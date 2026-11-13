"""按教学主题从 PTB-XL 中筛选候选病例，打印每个主题排名靠前的几条，供人工挑选。

用法：pipeline/.venv/bin/python pipeline/select_cases.py [主题 ...]

筛选原则：
  - 诊断经心内科医生确认（validated_by_human）
  - 没有基线漂移、噪声、电极问题、起搏器等质量标记
  - 诊断标签尽量"干净"：除目标诊断外只允许少量指定的伴随标签
  - GE 12SL 与 Glasgow Uni-G 都有测量值，且 PR / QRS / QT 两者相差不大
"""
from __future__ import annotations

import ast
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw" / "ptbxl"

# 主题：必须包含（且可信度 ≥ min_lik）、允许伴随的标签
TOPICS = {
    "normal": dict(need={"NORM"}, allow={"SR"}),
    "normal_male": dict(need={"NORM"}, allow={"SR"}, sex="0", hr=(62, 80)),
    "sbrad": dict(need={"SBRAD"}, allow={"NORM"}),
    "stach": dict(need={"STACH"}, allow={"NORM"}),
    "1avb": dict(need={"1AVB"}, allow={"SR", "NORM"}),
    "afib": dict(need={"AFIB"}, allow={"NORM", "NDT", "NST_"}),
    "lvh": dict(need={"LVH"}, allow={"SR", "VCLVH"}),
    "lvh_strain": dict(need={"LVH"}, any_of={"ISC_", "ISCAL", "ISCLA", "STD_", "INVT", "NDT"},
                       allow={"SR", "VCLVH", "ISC_", "ISCAL", "ISCLA", "STD_", "INVT", "NDT", "LAO/LAE"}),
    "lae": dict(need={"LAO/LAE"}, allow={"SR", "NORM"}),
    "crbbb": dict(need={"CRBBB"}, allow={"SR"}),
    "clbbb": dict(need={"CLBBB"}, allow={"SR"}),
    "lafb": dict(need={"LAFB"}, allow={"SR"}),
    "imi": dict(need={"IMI"}, allow={"SR"}),
    "asmi": dict(need={"ASMI"}, allow={"SR"}),
    "lpfb": dict(need={"LPFB"}, allow={"SR"}),
    # 电轴右偏：其余正常（NORM），额面 QRS 电轴 > 90°
    "rad": dict(need={"NORM"}, allow={"SR"}, axis=(95, 150)),
}
RHYTHM = {"SR", "SBRAD", "STACH", "SARRH", "AFIB", "AFLT"}
FLAGS = ["baseline_drift", "static_noise", "burst_noise", "electrodes_problems", "extra_beats", "pacemaker"]
FEATS = ["HR__Global", "PR_Int_Global", "QRS_Dur_Global", "QT_Int_Global", "QRS_AxisFront_Global"]


def load_feats(algo: str) -> dict:
    out = {}
    with open(RAW / f"{algo}_features.csv", newline="", encoding="utf-8") as f:
        rd = csv.reader(f)
        head = [h.lstrip("﻿") for h in next(rd)]
        idx = {c: head.index(c) for c in FEATS if c in head}
        idc = head.index("ecg_id")
        for row in rd:
            if not row[idc]:
                continue
            vals = {}
            for c, i in idx.items():
                v = row[i].strip()
                vals[c] = None if v in ("", "nan") else float(v)
            out[int(float(row[idc]))] = vals
    return out


def main(topics):
    f12, fug = load_feats("12sl"), load_feats("unig")
    with open(RAW / "ptbxl_database.csv", newline="", encoding="utf-8") as f:
        db = list(csv.DictReader(f))
    for topic in topics:
        spec = TOPICS[topic]
        cands = []
        for r in db:
            if r["validated_by_human"] != "True" or any(r[k].strip() for k in FLAGS):
                continue
            scp = {k: v for k, v in ast.literal_eval(r["scp_codes"]).items()}
            codes = set(scp)
            # 节律类标签（SBRAD、STACH、AFIB 等）在 PTB-XL 中可信度常记为 0，只对诊断类标签要求 ≥ 80
            if not spec["need"] <= codes or any(scp[c] < 80 for c in spec["need"] if c not in RHYTHM):
                continue
            if "any_of" in spec and not (codes & spec["any_of"]):
                continue
            extra = codes - spec["need"] - spec["allow"]
            if extra:
                continue
            if "sex" in spec and r["sex"].split(".")[0] != spec["sex"]:
                continue
            eid = int(float(r["ecg_id"]))
            a, b = f12.get(eid), fug.get(eid)
            if not a or not b:
                continue
            diffs = []
            for k, tol in (("PR_Int_Global", 20), ("QRS_Dur_Global", 12), ("QT_Int_Global", 20)):
                if a.get(k) is not None and b.get(k) is not None:
                    diffs.append(abs(a[k] - b[k]) / tol)
                elif topic != "afib" or k != "PR_Int_Global":
                    diffs.append(1.0)
            if max(diffs, default=0) > 1:
                continue
            if "hr" in spec and not (b.get("HR__Global") and spec["hr"][0] <= b["HR__Global"] <= spec["hr"][1]):
                continue
            if "axis" in spec and not (b.get("QRS_AxisFront_Global") is not None and a.get("QRS_AxisFront_Global") is not None
                                       and all(spec["axis"][0] <= x["QRS_AxisFront_Global"] <= spec["axis"][1] for x in (a, b))):
                continue
            age = float(r["age"]) if r["age"] else 0
            score = sum(diffs) + (0 if 30 <= age <= 80 else 1)
            cands.append((score, eid, r, b, scp))
        cands.sort(key=lambda c: c[0])
        print(f"\n=== {topic}：{len(cands)} 条候选")
        for score, eid, r, b, scp in cands[:6]:
            sex = {"0": "男", "1": "女"}.get(r["sex"].split(".")[0], "?")
            fmt = lambda v: "—" if v is None else f"{v:.0f}"  # noqa: E731
            print(f"  {eid:>6} {sex} {r['age'][:2]:>2}岁  HR {fmt(b['HR__Global'])} PR {fmt(b['PR_Int_Global'])} "
                  f"QRS {fmt(b['QRS_Dur_Global'])} QT {fmt(b['QT_Int_Global'])} 轴 {fmt(b['QRS_AxisFront_Global'])}  "
                  f"{scp}  |  {r['report'][:60]}")


if __name__ == "__main__":
    main(sys.argv[1:] or list(TOPICS))
