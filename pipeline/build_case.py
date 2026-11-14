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


def measure_amplitudes(sig_uV: np.ndarray, fs: float, beats: list) -> dict:
    """每导联的 R、S 振幅与 ST 偏移（mV），各心搏中位数。
    零点：本心搏 QRS 起点前 4–40 ms 的 PR 段中位数（与网页读数一致，避开 P 波）。
    R = QRS 窗内最高正向偏移。
    S = 第一个正向波（≥ 0.05 mV）之后的最深负向偏移：R′ 比 R 高时，夹在中间的深 S 也算进来；
        没有正向波（QS 型）时取整个 QRS 的最深点。
    STJ = J 点（QRS 终点）。
    ST80 = J 点后 80 ms，只用能确认 J+80 仍在 T 波起点之前的心搏。
        能确认的心搏不到一半时：
          - 多数落进 T 波 → ST80 记为 None；
          - 多数没有 T 波标注（无法确认）→ 仍给出固定时点读数，但标 ST80unconfirmed，网页不按 ST 阈值着色。
        ST80inT / ST80unconfirmed 是落进 T 波 / 没有 T 波标注的心搏比例。"""
    per = {l: {"R": [], "S": [], "STJ": [], "ST80": [], "ST80u": []} for l in LEADS}
    n_st80 = n_in_t = n_no_t = 0
    idx = lambda t: int(round(t / 1000 * fs))  # noqa: E731
    n = sig_uV.shape[1]
    for b in beats:
        if "QRS" not in b:
            continue
        on, off = b["QRS"]["on"], b["QRS"]["off"]
        a = max(b["P"]["off"], on - 40) if "P" in b else on - 40
        if idx(a) < 0 or idx(off) >= n:  # 记录首尾不完整的心搏
            continue
        st80 = None  # "ok"：确认在 T 波之前；"unk"：没有 T 波标注，无法确认
        if idx(off + 80) < n:
            n_st80 += 1
            if "T" not in b:
                st80, n_no_t = "unk", n_no_t + 1
            elif off + 80 >= b["T"]["on"]:
                n_in_t += 1
            else:
                st80 = "ok"
        for li, lead in enumerate(LEADS):
            x = sig_uV[li]
            win = x[idx(a): idx(on - 4) + 1]
            # PR 段太短（P 波终点紧贴 QRS 起点）时窗口为空，与网页端一致改用 QRS 起点处的值
            base = np.median(win) if win.size else x[idx(on)]
            q = x[idx(on): idx(off) + 1] - base
            if q.size == 0:
                continue
            per[lead]["R"].append(max(0.0, float(q.max())))
            pos = np.flatnonzero(q >= 50)
            tail = q[pos[0]:] if pos.size else q
            per[lead]["S"].append(max(0.0, -float(tail.min())))
            per[lead]["STJ"].append(float(x[idx(off)] - base))
            if st80:
                per[lead]["ST80" if st80 == "ok" else "ST80u"].append(float(x[idx(off + 80)] - base))
    med = lambda v: None if not v else round(float(np.median(v)) / 1000, 3)  # noqa: E731
    n_ok = n_st80 - n_in_t - n_no_t
    if n_ok * 2 >= n_st80 and n_ok:
        mode = "ok"
    elif n_no_t > n_in_t:
        mode = "unconfirmed"
    else:
        mode = "none"
    out = {}
    for l, d in per.items():
        o = {k: med(d[k]) for k in ("R", "S", "STJ")}
        o["ST80"] = med(d["ST80"]) if mode == "ok" else med(d["ST80"] + d["ST80u"]) if mode == "unconfirmed" else None
        if n_in_t:
            o["ST80inT"] = round(n_in_t / n_st80, 2)
        if mode == "unconfirmed":
            o["ST80unconfirmed"] = round(n_no_t / n_st80, 2)
        out[l] = o
    return out


def axis_from_area(sig_uV: np.ndarray, fs: float, windows_ms: list) -> float | None:
    """额面 QRS 电轴：I 与 aVF 在 QRS 窗内的净面积（各心搏中位数）。
    按 Einthoven / Goldberger 几何关系，I = E·cosφ，aVF = (√3/2)·E·sinφ，
    所以 tanφ = (2/√3)·aVF / I。直接用 atan2(aVF, I) 会低估偏离 0° / 90° 的角度（本例约低 4°）。"""
    angles = []
    for on, off in windows_ms:
        a, z = int(on / 1000 * fs), int(off / 1000 * fs) + 1
        bi = sig_uV[0, max(a - 5, 0): a + 1].mean()
        bf = sig_uV[5, max(a - 5, 0): a + 1].mean()
        area_i = np.sum(sig_uV[0, a:z] - bi)
        area_f = np.sum(sig_uV[5, a:z] - bf)
        angles.append(np.degrees(np.arctan2(2 / np.sqrt(3) * area_f, area_i)))
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
    "P_Dur_Global": "P_ms",
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


# 每导联振幅特征（单位 mV；S 波记为负值，这里取绝对值）
AMP_COLS = {"R_Amp": "R", "S_Amp": "S", "ST_Amp": "STJ", "ST_Amp80ms": "ST80"}


@lru_cache(maxsize=2)
def feature_table(algo: str) -> dict:
    """读入一个算法的特征表中本站用到的列（全局间期 + 每导联振幅），按 ecg_id 索引。"""
    want = set(FEATURE_COLS) | {f"{k}_{l}" for k in AMP_COLS for l in LEADS}
    out = {}
    with open(RAW / "ptbxl" / f"{algo}_features.csv", newline="", encoding="utf-8") as f:
        rd = csv.reader(f)
        head = [h.lstrip("\ufeff") for h in next(rd)]
        idx = {c: i for i, c in enumerate(head) if c in want}
        id_col = head.index("ecg_id")  # 两个文件中 ecg_id 的列位置不同
        for row in rd:
            if not row[id_col]:
                continue
            vals = {}
            for c, i in idx.items():
                v = row[i].strip()
                vals[c] = None if v in ("", "nan") else float(v)
            out[int(float(row[id_col]))] = vals
    return out


def ptbxl_features(algo: str, ecg_id: int) -> dict | None:
    row = feature_table(algo).get(ecg_id)
    if row is None:
        return None
    return {FEATURE_COLS[c]: (None if row.get(c) is None else round(row[c], 1)) for c in FEATURE_COLS if c in row}


def ptbxl_amplitudes(algo: str, ecg_id: int) -> dict | None:
    """{导联: {R, S, STJ, ST80}}，mV；算法没有的项为 None"""
    row = feature_table(algo).get(ecg_id)
    if row is None:
        return None
    out = {}
    for lead in LEADS:
        d = {}
        for k, name in AMP_COLS.items():
            v = row.get(f"{k}_{lead}")
            d[name] = None if v is None else round(abs(v) if name == "S" else v, 3)
        out[lead] = d
    return out


ECGDELI_LABELS = {
    "p-wave onset": ("P", "on"), "p-wave peak": ("P", "peak"), "p-wave offset": ("P", "off"),
    "QRS onset": ("QRS", "on"), "R peak": ("QRS", "peak"), "QRS offset": ("QRS", "off"),
    "t-wave onset": ("T", "on"), "t-wave peak": ("T", "peak"), "t-wave offset": ("T", "off"),
}
# 合理时长（ms）；超出范围视为检测失败
WAVE_DUR_MS = {"P": (30, 250), "QRS": (40, 250), "T": (60, 500)}
EDGE_MS = 20  # 起止点离记录首尾太近，说明波形被截断


def parse_ecgdeli(path: Path, fs: float, duration_ms: float, label: str, issues: list) -> list[dict]:
    """ECGDeli 标注：aux_note 写明点的类型。以 QRS 起点为锚，把前后的点组装成心搏中的 P / QRS / T。
    不合理的波（顺序错乱、时长异常、被首尾截断）丢弃，并记入 issues。"""
    ann = wfdb.rdann(str(path), "atr")
    pts = []
    for s, note in zip(ann.sample, ann.aux_note):
        key = ECGDELI_LABELS.get(note.strip())
        if key:
            pts.append((round(s / fs * 1000, 1), *key))
    qrs_on = [t for t, w, k in pts if w == "QRS" and k == "on"]
    waves, dropped = [], []
    for i, q in enumerate(qrs_on):
        prev_q = qrs_on[i - 1] if i > 0 else -1e9
        next_q = qrs_on[i + 1] if i + 1 < len(qrs_on) else 1e9
        beat: dict[str, dict] = {}
        # P 属于本 QRS 之前：按"起点"分组，取最后一组同时有起点和终点的
        # （逐点覆盖会把两个 P 波的起点和终点拼在一起，或配上被截断心搏的残留点）
        p_groups: list[dict] = []
        for t, w, k in pts:
            if w == "P" and prev_q < t <= q:
                if k == "on" or not p_groups:
                    p_groups.append({})
                p_groups[-1].setdefault(k, t)
        complete = [g for g in p_groups if {"on", "off"} <= g.keys()]
        if complete:
            beat["P"] = complete[-1]
        # QRS 与 T 属于本 QRS 之后、下一个 QRS 之前，取最先出现的一组
        for t, w, k in pts:
            if w != "P" and q <= t < next_q and k not in beat.setdefault(w, {}):
                beat[w][k] = t
        for w in ("P", "QRS", "T"):
            b = beat.get(w, {})
            if not {"on", "off"} <= b.keys():
                continue
            on, off, peak = b["on"], b["off"], b.get("peak")
            reason = None
            lo, hi = WAVE_DUR_MS[w]
            if on < EDGE_MS or off > duration_ms - EDGE_MS:
                reason = "被记录首尾截断"
            elif not (lo <= off - on <= hi):
                reason = f"时长 {off - on:.0f} ms 不合理"
            elif peak is not None and not (on <= peak <= off):
                reason = "峰值不在起止点之间"
            elif w == "P" and "QRS" in beat and "on" in beat["QRS"] and off > beat["QRS"]["on"] + 2:
                reason = "P 波终点晚于 QRS 起点"
            elif w == "T" and "QRS" in beat and "off" in beat["QRS"] and on < beat["QRS"]["off"] - 2:
                reason = "T 波起点早于 QRS 终点"
            if reason:
                dropped.append(f"{w}@{on:.0f}ms（{reason}）")
                continue
            waves.append({"type": w, "on": on, "peak": peak, "off": off})
    if dropped:
        issues.append({"level": "info", "lead": label if label != "global" else None,
                       "msg": f"ECGDeli 自动标注中 {len(dropped)} 个波不合理已舍弃：{'；'.join(dropped)}"})
    waves.sort(key=lambda w: w["on"])
    return waves


def ecgdeli_annotations(ecg_id: int, fs: float, duration_ms: float, issues: list) -> dict | None:
    d = RAW / "ptbxl" / "fiducial"
    sub = f"{ecg_id // 1000 * 1000:05d}"
    names = ["global", *[f"lead_{l}" for l in LEADS]]
    try:
        for n in names:
            download(f"ptb-xl-plus/1.0.1/fiducial_points/ecgdeli/{sub}/{ecg_id:05d}_points_{n}.atr",
                     d / f"{ecg_id:05d}_points_{n}.atr")
    except Exception as e:  # noqa: BLE001
        issues.append({"level": "warn", "lead": None, "msg": f"没有 ECGDeli 波形标注（{e}），不能显示波段着色"})
        return None
    per_lead = {l: parse_ecgdeli(d / f"{ecg_id:05d}_points_lead_{l}", fs, duration_ms, l, issues) for l in LEADS}
    glob = parse_ecgdeli(d / f"{ecg_id:05d}_points_global", fs, duration_ms, "global", issues)
    # 全局标注组装成心搏：以 QRS 为中心，挂上前面的 P 和后面的 T
    beats = []
    qrs = [w for w in glob if w["type"] == "QRS"]
    for i, q in enumerate(qrs):
        prev_off = qrs[i - 1]["off"] if i > 0 else -1e9
        next_on = qrs[i + 1]["on"] if i + 1 < len(qrs) else 1e9
        b = {"QRS": {k: q[k] for k in ("on", "peak", "off")}}
        for w in glob:
            if w["type"] == "P" and prev_off < w["on"] and w["off"] <= q["on"] + 2:
                b["P"] = {k: w[k] for k in ("on", "peak", "off")}
            if w["type"] == "T" and w["on"] >= q["off"] - 2 and w["off"] < next_on:
                b["T"] = {k: w[k] for k in ("on", "peak", "off")}
        beats.append(b)
    return {
        "source": "ECGDeli（开源算法，PTB-XL+ 提供），自动标注，未经人工校对",
        "waves": per_lead,
        "beats": beats,
        # 范围包含第一个心搏的 P 波和最后一个心搏的 T 波
        "annotatedRangeMs": [
            beats[0]["P"]["on"] if "P" in beats[0] else beats[0]["QRS"]["on"],
            beats[-1]["T"]["off"] if "T" in beats[-1] else beats[-1]["QRS"]["off"],
        ] if beats else None,
    }


RHYTHM_CODES = ["AFIB", "AFLT", "STACH", "SBRAD", "SARRH", "SR"]


def drop_p(ann: dict | None) -> dict | None:
    """去掉 P 波（房颤时 ECGDeli 会把颤动波误标为 P 波）"""
    if not ann:
        return ann
    ann["waves"] = {l: [w for w in ws if w["type"] != "P"] for l, ws in ann["waves"].items()}
    for b in ann["beats"]:
        b.pop("P", None)
    if ann["beats"]:
        ann["annotatedRangeMs"][0] = ann["beats"][0]["QRS"]["on"]
    return ann


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

    codes = {d["code"] for d in diagnoses}
    rhythm = next((r for r in RHYTHM_CODES if r in codes), "SR")
    no_p = rhythm in ("AFIB", "AFLT")  # 房颤 / 房扑：没有窦性 P 波，PR 间期不适用

    algos = []
    amps = []
    for key, label in ALGORITHMS:
        f = ptbxl_features(key, ecg_id)
        if f is None:
            issues.append({"level": "warn", "lead": None, "msg": f"PTB-XL+ 中没有 {label} 的测量值"})
            continue
        if no_p:  # 房颤 / 房扑没有 P 波：算法仍会输出 PR、P 波时限，一并舍弃
            f["PR_ms"] = None
            f["P_ms"] = None
        algos.append({"id": key, "label": label, "kind": "algorithm", "values": f})
        a = ptbxl_amplitudes(key, ecg_id)
        if a:
            amps.append({"id": key, "label": label, "kind": "algorithm", "values": a})
    if no_p:
        issues.append({"level": "info", "lead": None,
                       "msg": "心房颤动 / 扑动：没有窦性 P 波，PR 间期不适用，算法给出的 PR、P 波时限与自动标注的 P 波已舍弃"})
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
        "amplitudes": amps,
        "rhythm": rhythm,
        "annotations": drop_p(ecgdeli_annotations(ecg_id, fs, wrec.sig_len / fs * 1000, issues)) if no_p
        else ecgdeli_annotations(ecg_id, fs, wrec.sig_len / fs * 1000, issues),
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
    # allow_nan=False：出现 NaN / Infinity 时直接报错（浏览器无法解析含 NaN 的 JSON），不静默写出
    return (json.dumps(obj, ensure_ascii=False, indent=1, allow_nan=False) + "\n").encode("utf-8")


MANUAL = ROOT / "pipeline" / "manual"


def apply_atrial(case_id: str, ann: dict | None, issues: list) -> None:
    """合并本站手工标注的 P 波（房室传导阻滞病例：自动标注每个 QRS 只配一个 P 波，未下传的 P 波会被漏掉）。

    pipeline/manual/<id>.json：{lead, method, conduction: "auto"|"none", p: [{peak, hidden?}]}
      hidden：P 波被 QRS / T 波遮住或在记录开头难以辨认（"QRS" / "T" / "edge"），位置按 PP 间期推定
    P 波起止点 = 峰值 −/+ ECGDeli 已有 P 波的中位前后宽度。
    conduction "auto"：P 波起点到其后第一个 QRS 起点 120–450 ms、且中间没有别的 P 波，视为下传；
               "none"：完全性房室传导阻滞，P 波一律不下传。
    """
    f = MANUAL / f"{case_id}.json"
    if not f.exists() or not ann:
        return
    man = json.loads(f.read_text(encoding="utf-8"))
    beats = ann["beats"]
    auto_p = [b["P"] for b in beats if "P" in b]
    pre = float(np.median([p["peak"] - p["on"] for p in auto_p])) if auto_p else 50.0
    post = float(np.median([p["off"] - p["peak"] for p in auto_p])) if auto_p else 50.0
    waves = []
    for p in man["p"]:
        w = {"on": round(p["peak"] - pre), "peak": p["peak"], "off": round(p["peak"] + post), "conducts": None}
        if p.get("hidden"):
            w["hidden"] = p["hidden"]
        waves.append(w)
    for b in beats:
        b.pop("P", None)
    if man["conduction"] == "auto":
        for i, w in enumerate(waves):
            nxt = waves[i + 1]["on"] if i + 1 < len(waves) else 1e9
            for bi, b in enumerate(beats):
                pr = b["QRS"]["on"] - w["on"]
                if 120 <= pr <= 450 and b["QRS"]["on"] < nxt + 40 and "P" not in b:
                    w["conducts"] = bi
                    b["P"] = {k: w[k] for k in ("on", "peak", "off")}
                    break
    # 逐导联着色：P 波一律换成手工标注（时间对所有导联相同）；被遮住的不着色
    for lead, ws in ann["waves"].items():
        ann["waves"][lead] = sorted(
            [x for x in ws if x["type"] != "P"]
            + [{"type": "P", "on": w["on"], "peak": w["peak"], "off": w["off"]} for w in waves if not w.get("hidden")],
            key=lambda x: x["on"])
    ann["atrial"] = {
        "source": f"本站手工标注（{man['lead']} 导联），未经医生校对",
        "method": man["method"],
        "conduction": man["conduction"],
        "waves": waves,
    }
    ann["source"] += "；P 波为本站手工标注（见下方说明）"
    first = beats[0]
    ann["annotatedRangeMs"][0] = min(first["P"]["on"] if "P" in first else first["QRS"]["on"], first["QRS"]["on"])
    n_c = sum(w["conducts"] is not None for w in waves)
    issues.append({"level": "info", "lead": None,
                   "msg": f"P 波为本站手工标注：共 {len(waves)} 个，下传 {n_c} 个，未下传 {len(waves) - n_c} 个"})


def build(db: str, rec: str) -> dict:
    case_id = f"{db}-{rec}"
    log(f"[{case_id}]")
    c = LOADERS[db](rec)
    apply_atrial(case_id, c["annotations"], c["issues"])
    sig_uV, fs = c["sig_uV"], c["fs"]
    issues = c["issues"]
    qual = quality(sig_uV, c["raw"], fs, c["adc_limits"], issues)

    # 自算电轴（仅在幅度真实、有 QRS 窗时），作为算法值的交叉核对
    if not c["amplitudeNormalized"] and c["annotations"]:
        wins = [(b["QRS"]["on"], b["QRS"]["off"]) for b in c["annotations"]["beats"] if "QRS" in b]
        c["measurements"].append({"id": "area", "label": "本站计算", "kind": "computed",
                                  "values": {"axis_deg": axis_from_area(sig_uV, fs, wins)}})
        own = {"id": "area", "label": "本站计算", "kind": "computed",
               "values": measure_amplitudes(sig_uV, fs, c["annotations"]["beats"])}
        c.setdefault("amplitudes", []).append(own)
        # 与算法交叉核对：R、S 相差超过 0.2 mV 时报告
        for alg in c["amplitudes"]:
            if alg["kind"] != "algorithm":
                continue
            for lead in LEADS:
                for k in ("R", "S"):
                    va, vb = alg["values"][lead].get(k), own["values"][lead].get(k)
                    if va is not None and vb is not None and abs(va - vb) > 0.2:
                        issues.append({"level": "info", "lead": lead,
                                       "msg": f"{k} 波振幅：本站 {vb:.2f} mV，{alg['label']} {va:.2f} mV，相差超过 0.2 mV"})

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
        "amplitudes": c.get("amplitudes", []),
        "rhythm": c.get("rhythm"),
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
            "group": info.get("group", "其他"),
            "patient": meta["patient"],
            "amplitudeNormalized": meta["amplitudeNormalized"],
            # 只在测验中使用、不出现在病例列表里（如 LUDB：幅度被归一化，只能用于时间相关题目）
            **({"quizOnly": True} if info.get("quizOnly") else {}),
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
