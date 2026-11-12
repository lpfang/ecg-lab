"""把公开心电数据库中的一条记录处理成前端用的静态资源。

用法：
    pipeline/.venv/bin/python pipeline/build_case.py ptbxl 33 [ludb 142 ...]

输出（web/public/cases/）：
    index.json                 所有病例列表（order.json 可指定顺序）
    <id>/signal.i16            Int16 小端，单位 µV，导联优先（12 × N）
    <id>/meta.json             采样率、导联、诊断、测量值、标注、质量报告、来源
    <id>/info.json（可选，手写）  教学说明，覆盖 index 中的标题和简介

数据源：
    ptbxl  PTB-XL v1.0.3（真实 mV 幅度）+ PTB-XL+ v1.0.1（GE 12SL 与 Glasgow Uni-G 算法测量）
           需先下载 raw/ptbxl/ 下的 ptbxl_database.csv、scp_statements.csv、
           12sl_features.csv、unig_features.csv（见 pipeline/README.md）
    ludb   LUDB v1.0.1（医生逐导联手工标注波形起止点）。
           注意：LUDB 的幅度被逐导联归一化（每导联峰峰值 = 1 mV），不是真实 mV，
           只能用于时间相关的教学（波形定位、间期），见 docs/数据核查.md

原则（见 docs/迁移经验-心电图教学.md）：
    - 增益、基线、导联顺序一律从头文件读取，不做假设
    - 质量问题和冲突显式报告，不静默处理
    - 内容不变时不改写文件
"""
from __future__ import annotations

import ast
import csv
import json
import sys
import urllib.request
from functools import lru_cache
from pathlib import Path

import numpy as np
import wfdb
from scipy.signal import butter, filtfilt

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw"
OUT = ROOT / "web" / "public" / "cases"
S3 = "https://physionet-open.s3.amazonaws.com/"

LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"]

PHYSIONET_CITATION = (
    "Pollard, T., Moody, B. E., Lehman, L., Gow, B., Fernandes, C., Xie, C., Johnson, A., Mark, R. G., "
    "& Heldt, T. (2026). PhysioNet as a global platform for biomedical research. Nature Health. "
    "https://doi.org/10.1038/s44360-026-00096-z"
)


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def download(rel: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    log(f"  下载 {rel}")
    with urllib.request.urlopen(S3 + rel, timeout=120) as r:
        data = r.read()
    if not data:
        raise RuntimeError(f"下载结果为空：{rel}")
    dest.write_bytes(data)
    return dest


# ---------------------------------------------------------------- 通用：读信号、质量检查


def read_signal(path: Path):
    """返回 (sig_uV[12, N], raw_adc[12, N], fs)。导联按名字映射到 LEADS 顺序。"""
    rec = wfdb.rdrecord(str(path), physical=False)
    names = [n.lower() for n in rec.sig_name]
    order = [names.index(l.lower()) for l in LEADS]
    raw = rec.d_signal.T[order].astype(np.int64)
    units = [rec.units[i] for i in order]
    if any(u.lower() != "mv" for u in units):
        raise RuntimeError(f"单位不是 mV：{units}")
    gains = np.array(rec.adc_gain, dtype=float)[order][:, None]
    baselines = np.array(rec.baseline, dtype=float)[order][:, None]
    sig_uV = (raw - baselines) / gains * 1000.0
    if np.abs(sig_uV).max() > 32767:
        raise RuntimeError("信号超出 Int16 µV 范围")
    return sig_uV, raw, float(rec.fs), rec


def einthoven_check(sig_uV: np.ndarray, fs: float) -> dict:
    """导联间线性关系：II = I + III，aVF = (II + III) / 2，aVR = −(I + II) / 2。
    真实 12 导联应几乎完全满足（滤波后相对误差 < 2%）；不满足说明幅度被逐导联缩放或导联有误。"""
    b, a = butter(2, [0.5 / (fs / 2), 40 / (fs / 2)], "band")
    x = filtfilt(b, a, sig_uV, axis=1)
    I, II, III, aVR, aVL, aVF = x[:6]

    def rel(est, ref):
        return float(np.linalg.norm(est - ref) / max(np.linalg.norm(ref), 1e-9))

    return {
        "II=I+III": round(rel(I + III, II), 4),
        "aVF=(II+III)/2": round(rel((II + III) / 2, aVF), 4),
        "aVR=-(I+II)/2": round(rel(-(I + II) / 2, aVR), 4),
    }


def quality(sig_uV: np.ndarray, raw: np.ndarray, fs: float, adc_limits, issues: list) -> dict:
    lo, hi = adc_limits
    per_lead = {}
    for li, lead in enumerate(LEADS):
        x = sig_uV[li]
        sat = int(np.sum((raw[li] <= lo) | (raw[li] >= hi)))
        if sat:
            issues.append({"level": "error", "lead": lead, "msg": f"{sat} 个采样点饱和（达到 ADC 极限）"})
        if np.std(x) < 20:
            issues.append({"level": "error", "lead": lead, "msg": "信号近似平线，疑似导联脱落"})
        w = int(fs)
        base = np.array([np.median(x[max(0, i - w // 2): i + w // 2]) for i in range(0, len(x), w // 4)])
        wander = float(base.max() - base.min())
        if wander > 500:
            issues.append({"level": "warn", "lead": lead, "msg": f"基线漂移较大（{wander / 1000:.2f} mV）"})
        per_lead[lead] = {"baselineWander_uV": round(wander), "saturated": sat}
    ein = einthoven_check(sig_uV, fs)
    worst = max(ein.values())
    if worst > 0.05:
        issues.append({"level": "error", "lead": None,
                       "msg": f"肢体导联不满足 Einthoven / Goldberger 关系（最大相对误差 {worst:.0%}），"
                              "幅度可能被逐导联缩放，不能用于电压、电轴、向量相关教学"})
    elif worst > 0.02:
        issues.append({"level": "warn", "lead": None, "msg": f"肢体导联间关系误差 {worst:.1%}，略高"})
    return {"perLead": per_lead, "einthoven": ein}


def axis_from_area(sig_uV: np.ndarray, fs: float, windows_ms: list) -> float | None:
    """额面 QRS 电轴：I 与 aVF 在 QRS 窗内的净面积（各心搏中位数）。"""
    angles = []
    for on, off in windows_ms:
        a, z = int(on / 1000 * fs), int(off / 1000 * fs) + 1
        bi = sig_uV[0, max(a - 5, 0): a + 1].mean()
        bf = sig_uV[5, max(a - 5, 0): a + 1].mean()
        angles.append(np.degrees(np.arctan2(np.sum(sig_uV[5, a:z] - bf), np.sum(sig_uV[0, a:z] - bi))))
    return None if not angles else round(float(np.median(angles)))


# ---------------------------------------------------------------- PTB-XL


PTBXL_SOURCE = {
    "name": "PTB-XL v1.0.3",
    "url": "https://physionet.org/content/ptb-xl/1.0.3/",
    "license": "Creative Commons Attribution 4.0 International (CC BY 4.0)",
    "citation": (
        "Wagner, P., Strodthoff, N., Bousseljot, R., Samek, W., & Schaeffter, T. (2022). PTB-XL, a large "
        "publicly available electrocardiography dataset (version 1.0.3). PhysioNet. "
        "https://doi.org/10.13026/kfzx-aw45"
    ),
    "annotation": "诊断标签来自原始报告；测量值来自 PTB-XL+ 中的 GE 12SL 与 Glasgow Uni-G 算法，未经人工校对",
}
PTBXL_PLUS = {
    "name": "PTB-XL+ v1.0.1",
    "url": "https://physionet.org/content/ptb-xl-plus/1.0.1/",
    "license": "Creative Commons Attribution 4.0 International (CC BY 4.0)",
    "citation": (
        "Strodthoff, N., Mehari, T., Nagel, C., Aston, P. J., Sundar, A., Graff, C., Kanters, J. K., "
        "Haverkamp, W., Dössel, O., Loewe, A., Bär, M., & Schaeffter, T. (2023). PTB-XL+, a comprehensive "
        "electrocardiographic feature dataset (version 1.0.1). PhysioNet. https://doi.org/10.13026/g6h6-7g88"
    ),
}
FEATURE_COLS = {
    "HR__Global": "HR_bpm", "RR_Mean_Global": "RR_ms", "PR_Int_Global": "PR_ms",
    "QRS_Dur_Global": "QRS_ms", "QT_Int_Global": "QT_ms", "QRS_AxisFront_Global": "axis_deg",
}
ALGORITHMS = [("12sl", "GE Marquette 12SL"), ("unig", "Glasgow Uni-G")]


@lru_cache(maxsize=1)
def ptbxl_db() -> dict:
    with open(RAW / "ptbxl" / "ptbxl_database.csv", newline="", encoding="utf-8") as f:
        return {int(float(r["ecg_id"])): r for r in csv.DictReader(f)}


@lru_cache(maxsize=1)
def scp_statements() -> dict:
    with open(RAW / "ptbxl" / "scp_statements.csv", newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    head = rows[0]
    return {r[0]: dict(zip(head[1:], r[1:])) for r in rows[1:]}


def ptbxl_features(algo: str, ecg_id: int) -> dict | None:
    path = RAW / "ptbxl" / f"{algo}_features.csv"
    with open(path, newline="", encoding="utf-8") as f:
        rd = csv.reader(f)
        head = [h.lstrip("﻿") for h in next(rd)]
        idx = {c: i for i, c in enumerate(head) if c in FEATURE_COLS}
        id_col = head.index("ecg_id")  # 两个文件中 ecg_id 的列位置不同
        for row in rd:
            if row[id_col] and int(float(row[id_col])) == ecg_id:
                out = {}
                for c, i in idx.items():
                    v = row[i].strip()
                    out[FEATURE_COLS[c]] = None if v in ("", "nan") else round(float(v), 1)
                return out
    return None


def load_ptbxl(rec: str) -> dict:
    ecg_id = int(rec)
    row = ptbxl_db()[ecg_id]
    base = RAW / "ptbxl" / Path(row["filename_hr"]).name
    for ext in ("hea", "dat"):
        download(f"ptb-xl/1.0.3/{row['filename_hr']}.{ext}", base.with_suffix(f".{ext}"))
    sig_uV, raw, fs, wrec = read_signal(base)
    issues: list = []

    # PTB-XL 自带的人工质量标注
    for col, label in [("baseline_drift", "基线漂移"), ("static_noise", "静态噪声"), ("burst_noise", "突发噪声"),
                       ("electrodes_problems", "电极问题"), ("extra_beats", "额外心搏"), ("pacemaker", "起搏器")]:
        if row[col].strip():
            issues.append({"level": "warn", "lead": None, "msg": f"数据库标注 {label}：{row[col].strip()}"})

    stm = scp_statements()
    diagnoses = []
    for code, lik in ast.literal_eval(row["scp_codes"]).items():
        s = stm.get(code, {})
        diagnoses.append({"code": code, "likelihood": lik, "description": s.get("description", ""),
                          "class": s.get("diagnostic_class", "")})

    algos = []
    for key, label in ALGORITHMS:
        f = ptbxl_features(key, ecg_id)
        if f is None:
            issues.append({"level": "warn", "lead": None, "msg": f"PTB-XL+ 中没有 {label} 的测量值"})
            continue
        algos.append({"id": key, "label": label, "kind": "algorithm", "values": f})
    # 两种算法差异较大时报告
    if len(algos) == 2:
        for k, tol in [("PR_ms", 20), ("QRS_ms", 12), ("QT_ms", 20)]:
            a, b = algos[0]["values"].get(k), algos[1]["values"].get(k)
            if a is not None and b is not None and abs(a - b) > tol:
                issues.append({"level": "warn", "lead": None,
                               "msg": f"{k[:-3]} 两种算法相差 {abs(a - b):.0f} ms（{a:.0f} vs {b:.0f}）"})

    age = float(row["age"]) if row["age"] else None
    sex = {"0": "M", "1": "F"}.get(row["sex"].split(".")[0])
    return {
        "sig_uV": sig_uV, "raw": raw, "fs": fs, "nSamples": wrec.sig_len,
        "adc_limits": (-32768, 32767),
        "issues": issues,
        "patient": {"age": None if age is None else ("≥90" if age >= 90 else str(int(age))), "sex": sex},
        "diagnoses": diagnoses,
        "reportOriginal": row["report"],
        "validatedByCardiologist": row["validated_by_human"] == "True",
        "measurements": algos,
        "annotations": None,
        "amplitudeNormalized": False,
        "source": PTBXL_SOURCE | {"record": f"ecg_id {ecg_id}", "derived": PTBXL_PLUS,
                                  "physionet": PHYSIONET_CITATION},
    }


# ---------------------------------------------------------------- LUDB（只用于时间相关教学）


LUDB_SOURCE = {
    "name": "Lobachevsky University Electrocardiography Database (LUDB) v1.0.1",
    "url": "https://physionet.org/content/ludb/1.0.1/",
    "license": "Open Data Commons Attribution License v1.0",
    "citation": (
        "Kalyakulina, A., Yusipov, I., Moskalenko, V., Nikolskiy, A., Kosonogov, K., Zolotykh, N., & "
        "Ivanchenko, M. (2021). Lobachevsky University Electrocardiography Database (version 1.0.1). "
        "PhysioNet. https://doi.org/10.13026/eegm-h675"
    ),
    "annotation": "心内科医生逐导联手工标注 P / QRS / T 起止点与峰值；幅度已被逐导联归一化，不是真实 mV",
}
LUDB_EXT = ["i", "ii", "iii", "avr", "avl", "avf", "v1", "v2", "v3", "v4", "v5", "v6"]
WAVE_OF_SYMBOL = {"p": "P", "N": "QRS", "t": "T"}


def parse_ludb_annotation(path: Path, ext: str, fs: float, issues: list, lead: str):
    ann = wfdb.rdann(str(path), ext)
    waves, syms, samps = [], ann.symbol, ann.sample
    for i, s in enumerate(syms):
        if s in WAVE_OF_SYMBOL:
            on = samps[i - 1] if i > 0 and syms[i - 1] == "(" else None
            off = samps[i + 1] if i + 1 < len(syms) and syms[i + 1] == ")" else None
            w = {"type": WAVE_OF_SYMBOL[s],
                 "on": None if on is None else round(on / fs * 1000, 1),
                 "peak": round(samps[i] / fs * 1000, 1),
                 "off": None if off is None else round(off / fs * 1000, 1)}
            if on is None or off is None:
                issues.append({"level": "warn", "lead": lead,
                               "msg": f"{w['type']} 波（峰值 {w['peak']} ms）缺少{'起点' if on is None else '终点'}标注"})
            waves.append(w)
        elif s not in "()":
            issues.append({"level": "warn", "lead": lead, "msg": f"未识别的标注符号 {s!r}，已忽略"})
    return waves


def group_beats(ann: dict, issues: list, tol_ms: float = 80.0):
    """按 QRS 峰值把各导联的波对齐成心搏。各导联是独立标注的，直接取最早 / 最晚会叠加单个导联的
    标注误差；≥3 个导联时取第二早的起点、第二晚的终点。"""
    peaks = sorted((w["peak"], lead) for lead, ws in ann.items() for w in ws if w["type"] == "QRS")
    clusters: list[list] = []
    for p, lead in peaks:
        if clusters and p - np.median([x for x, _ in clusters[-1]]) <= tol_ms:
            clusters[-1].append((p, lead))
        else:
            clusters.append([(p, lead)])
    beats = []
    for cl in clusters:
        center = float(np.median([p for p, _ in cl]))
        missing = [l for l in LEADS if l not in {lead for _, lead in cl}]
        if missing:
            issues.append({"level": "info", "lead": None,
                           "msg": f"QRS @ {center:.0f} ms：{len(missing)} 个导联未标注（{', '.join(missing)}）"})
        beats.append({"center": center})
    for bi, b in enumerate(beats):
        lo = beats[bi - 1]["center"] if bi > 0 else -1e9
        hi = beats[bi + 1]["center"] if bi + 1 < len(beats) else 1e9
        for typ, (a, z) in {"P": (lo, b["center"]), "QRS": ((lo + b["center"]) / 2, (b["center"] + hi) / 2),
                            "T": (b["center"], hi)}.items():
            ons, offs = [], []
            for ws in ann.values():
                for w in ws:
                    if w["type"] == typ and a < w["peak"] < z:
                        if typ == "QRS" and abs(w["peak"] - b["center"]) > tol_ms:
                            continue
                        if w["on"] is not None:
                            ons.append(w["on"])
                        if w["off"] is not None:
                            offs.append(w["off"])
            if ons and offs:
                ons.sort()
                offs.sort(reverse=True)
                k = 1 if len(ons) >= 3 and len(offs) >= 3 else 0
                b[typ] = {"on": ons[k], "off": offs[k], "nLeads": len(ons)}
    return beats


def ludb_measure(beats: list) -> dict:
    pr, qrs, qt, rr = [], [], [], []
    for i, b in enumerate(beats):
        if "QRS" in b:
            qrs.append(b["QRS"]["off"] - b["QRS"]["on"])
            if "P" in b:
                pr.append(b["QRS"]["on"] - b["P"]["on"])
            if "T" in b:
                qt.append(b["T"]["off"] - b["QRS"]["on"])
        if i > 0 and "QRS" in b and "QRS" in beats[i - 1]:
            rr.append(b["QRS"]["on"] - beats[i - 1]["QRS"]["on"])
    med = lambda xs: None if not xs else round(float(np.median(xs)), 1)  # noqa: E731
    v = {"PR_ms": med(pr), "QRS_ms": med(qrs), "QT_ms": med(qt), "RR_ms": med(rr), "axis_deg": None}
    v["HR_bpm"] = None if not v["RR_ms"] else round(60000 / v["RR_ms"], 1)
    return v


def load_ludb(rec: str) -> dict:
    base = RAW / "ludb" / rec
    for ext in ["hea", "dat", *LUDB_EXT]:
        download(f"ludb/1.0.1/data/{rec}.{ext}", base.with_suffix(f".{ext}"))
    sig_uV, raw, fs, wrec = read_signal(base)
    issues: list = []
    ann = {lead: parse_ludb_annotation(base, ext, fs, issues, lead) for lead, ext in zip(LEADS, LUDB_EXT)}
    beats = group_beats(ann, issues)
    all_ms = [w[k] for ws in ann.values() for w in ws for k in ("on", "off") if w[k] is not None]
    rng = [min(all_ms), max(all_ms)] if all_ms else None
    if rng:
        issues.append({"level": "info", "lead": None,
                       "msg": f"只有 {rng[0] / 1000:.1f}–{rng[1] / 1000:.1f} 秒有人工标注，首尾未标注"})
    diag, age, sex = [], None, None
    for c in wrec.comments:
        c = c.strip()
        if c.startswith("<age>:"):
            age = c.split(":", 1)[1].strip()
        elif c.startswith("<sex>:"):
            sex = c.split(":", 1)[1].strip()
        elif c and not c.startswith("<"):
            diag.append({"code": None, "likelihood": None, "description": c.rstrip(". ").strip(), "class": ""})
    return {
        "sig_uV": sig_uV, "raw": raw, "fs": fs, "nSamples": wrec.sig_len,
        "adc_limits": (-32768, 32767),
        "issues": issues,
        "patient": {"age": age, "sex": sex},
        "diagnoses": diag,
        "reportOriginal": None,
        "validatedByCardiologist": True,
        "measurements": [{"id": "ludb", "label": "医生人工标注", "kind": "manual", "values": ludb_measure(beats),
                          "method": "全局起止：取第二早的起点与第二晚的终点（排除单个离群导联）；各心搏中位数"}],
        "annotations": {"waves": ann, "beats": beats, "annotatedRangeMs": rng},
        "amplitudeNormalized": True,
        "source": LUDB_SOURCE | {"record": rec, "physionet": PHYSIONET_CITATION},
    }


# ---------------------------------------------------------------- 输出


LOADERS = {"ptbxl": load_ptbxl, "ludb": load_ludb}


def write_if_changed(path: Path, data: bytes) -> bool:
    if path.exists() and path.read_bytes() == data:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return True


def dumps(obj) -> bytes:
    return (json.dumps(obj, ensure_ascii=False, indent=1) + "\n").encode("utf-8")


def build(db: str, rec: str) -> dict:
    case_id = f"{db}-{rec}"
    log(f"[{case_id}]")
    c = LOADERS[db](rec)
    sig_uV, fs = c["sig_uV"], c["fs"]
    issues = c["issues"]
    qual = quality(sig_uV, c["raw"], fs, c["adc_limits"], issues)

    # 自算电轴（仅在幅度真实、有 QRS 窗时），作为算法值的交叉核对
    if not c["amplitudeNormalized"] and c["annotations"]:
        wins = [(b["QRS"]["on"], b["QRS"]["off"]) for b in c["annotations"]["beats"] if "QRS" in b]
        c["measurements"].append({"id": "area", "label": "本站计算", "kind": "computed",
                                  "values": {"axis_deg": axis_from_area(sig_uV, fs, wins)}})

    meta = {
        "id": case_id,
        "fs": fs,
        "nSamples": int(c["nSamples"]),
        "durationMs": c["nSamples"] / fs * 1000,
        "leads": LEADS,
        "signal": {"file": "signal.i16", "dtype": "int16le", "unit": "uV", "layout": "lead-major"},
        "amplitudeNormalized": c["amplitudeNormalized"],
        "patient": c["patient"],
        "diagnoses": c["diagnoses"],
        "reportOriginal": c["reportOriginal"],
        "validatedByCardiologist": c["validatedByCardiologist"],
        "measurements": c["measurements"],
        "annotations": c["annotations"],
        "quality": qual,
        "issues": issues,
        "source": c["source"],
        "contentReviewed": False,
    }
    d = OUT / case_id
    changed = write_if_changed(d / "signal.i16", np.round(sig_uV).astype("<i2").tobytes())
    changed |= write_if_changed(d / "meta.json", dumps(meta))
    for m in c["measurements"]:
        log(f"  {m['label']}: " + " ".join(f"{k}={v}" for k, v in m["values"].items()))
    log(f"  Einthoven 相对误差 {qual['einthoven']}")
    log(f"  {'已更新' if changed else '无变化'}；错误 {sum(i['level'] == 'error' for i in issues)}，"
        f"警告 {sum(i['level'] == 'warn' for i in issues)}")
    for i in issues:
        if i["level"] != "info":
            log(f"  [{i['level']}] {i['lead'] or '-'}: {i['msg']}")
    return meta


def update_index():
    cases = []
    for d in sorted(p for p in OUT.iterdir() if p.is_dir()):
        m = d / "meta.json"
        if not m.exists():
            continue
        meta = json.loads(m.read_text("utf-8"))
        info = json.loads((d / "info.json").read_text("utf-8")) if (d / "info.json").exists() else {}
        cases.append({
            "id": meta["id"],
            "title": info.get("title", meta["id"]),
            "summary": info.get("summary", "; ".join(x["description"] for x in meta["diagnoses"])),
            "tags": info.get("tags", []),
            "patient": meta["patient"],
            "amplitudeNormalized": meta["amplitudeNormalized"],
        })
    order_f = OUT / "order.json"
    order = json.loads(order_f.read_text("utf-8")) if order_f.exists() else []
    cases.sort(key=lambda c: (order.index(c["id"]) if c["id"] in order else len(order), c["id"]))
    write_if_changed(OUT / "index.json", dumps({"cases": cases}))


def main(argv):
    if len(argv) < 2 or len(argv) % 2:
        print(__doc__)
        sys.exit(1)
    for db, rec in zip(argv[::2], argv[1::2]):
        if db not in LOADERS:
            sys.exit(f"未知数据源 {db}，可选：{', '.join(LOADERS)}")
        build(db, rec)
    update_index()


if __name__ == "__main__":
    main(sys.argv[1:])
