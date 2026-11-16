"""为 PTB-XL 病例粗定位每个心搏的 QRS 起止点和 T 波终点，作为手工标注的起点（结果要逐搏画图核对后再写入 manual/<id>.json）。

方法（都是全局边界，12 导联共用一组时间）：
  QRS 起止：12 导联 0.5–40 Hz 滤波后求"空间速度"（各导联一阶导数的平方和再开方，10 ms 平滑）。
           以 R 峰为中心，向前、向后找速度第一次降到阈值以下的点；
           阈值 = 本搏 TP 段速度基线 + FRAC ×（QRS 内速度峰值 − 基线）。
  T 波终点：切线法。12 导联合成"偏离等电位线的幅度"曲线，从 T 波顶点往后找下降最陡的点作切线，
           与曲线自身的基线相交。比两种算法的 QT 平均短约 27 ms（10 个自动标注可靠的病例上 20–32 ms），
           与手工切线法通常比机器算法早的已知情况一致，不做额外修正。
用法：pipeline/.venv/bin/python pipeline/manual/propose_boundaries.py ptbxl-1222 [--plot 输出目录]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy.signal import butter, filtfilt

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
import build_case as bc  # noqa: E402

FRAC = 0.03          # QRS 起止阈值占速度峰值的比例（在 10 个自动标注可靠的病例上校准）
HOLD_MS = 12         # 速度持续低于阈值这么久，才算离开 QRS
SMOOTH_MS = 10


def load(case_id: str):
    meta = json.loads((ROOT / "web/public/cases" / case_id / "meta.json").read_text("utf-8"))
    fs = meta["fs"]
    raw = np.fromfile(ROOT / "web/public/cases" / case_id / "signal.i16", dtype="<i2").astype(float)
    x = raw.reshape(len(meta["leads"]), -1) / 1000.0          # mV，导联 × 采样点
    b, a = butter(2, [0.5, 40], btype="band", fs=fs)
    x = filtfilt(b, a, x, axis=1)
    return meta, fs, x


def velocity(x, fs):
    d = np.gradient(x, axis=1) * fs                            # mV/s
    v = np.sqrt((d ** 2).sum(0))
    k = max(1, int(SMOOTH_MS / 1000 * fs))
    return np.convolve(v, np.ones(k) / k, mode="same")


def propose(meta, fs, x):
    v = velocity(x, fs)
    beats = meta["annotations"]["beats"]
    peaks = [b["QRS"]["peak"] for b in beats]
    n = x.shape[1]
    ms = lambda i: round(i / fs * 1000)  # noqa: E731
    idx = lambda t: int(round(t / 1000 * fs))  # noqa: E731
    out = []
    for bi, pk in enumerate(peaks):
        p = idx(pk)
        prev_p = idx(peaks[bi - 1]) if bi > 0 else 0
        next_p = idx(peaks[bi + 1]) if bi + 1 < len(peaks) else n
        # QRS 峰值附近的速度最大值
        lo, hi = max(0, p - idx(90)), min(n, p + idx(90))
        vmax = v[lo:hi].max()
        # 基线：本搏 R 峰前 300–150 ms 中速度较低的部分（TP / PR 段）
        b0, b1 = max(prev_p + idx(250), p - idx(330)), p - idx(150)
        base = np.percentile(v[b0:b1], 30) if b1 > b0 else np.percentile(v, 10)
        thr = base + FRAC * (vmax - base)
        hold = idx(HOLD_MS)
        # 起点：从 R 峰往前，找到速度"持续"低于阈值的位置（避免停在 QRS 中间的切迹上）
        on = p
        while on > max(hold, p - idx(200)) and not (v[on - hold:on] < thr).all():
            on -= 1
        off = p
        while off < min(n - hold - 1, p + idx(220)) and not (v[off:off + hold] < thr).all():
            off += 1
        # T 波终点：切线法，切线画在 12 导联合成的"偏离等电位线的幅度"曲线上
        #   等电位线 = QRS 起点前 10–40 ms 各导联的中位数；幅度曲线 20 ms 平滑；
        #   从 T 波顶点往后找下降最陡的点，切线与幅度曲线自身的基线（顶点之后的第 10 百分位）相交
        iso = np.median(x[:, max(0, on - idx(40)): max(1, on - idx(10))], axis=1)
        t0 = off + idx(40)
        t1 = min(next_p - idx(60), off + idx(700), n - 1)
        t_end = t_peak = None
        if t1 - t0 > idx(160):
            mag = np.sqrt(((x[:, t0:t1] - iso[:, None]) ** 2).sum(0))
            k = idx(20)
            mag = np.convolve(mag, np.ones(k) / k, mode="same")
            tp = int(np.argmax(mag[: min(len(mag), idx(450))]))
            y = mag - np.percentile(mag[tp:], 10)
            d = np.gradient(y)
            jj = tp + int(np.argmin(d[tp: min(len(d), tp + idx(250))]))
            if d[jj] < 0:
                c = jj - y[jj] / d[jj]
                if tp < c < len(y):
                    t_end, t_peak = t0 + c, t0 + tp
        out.append({"peak": pk, "on": ms(on), "off": ms(off), "tOff": None if t_end is None else ms(t_end),
                    "tPeak": None if t_peak is None else ms(t_peak)})
    return out


def summary(meta, rows):
    al = {m["id"]: m["values"] for m in meta["measurements"] if m["kind"] == "algorithm"}
    q = [r["off"] - r["on"] for r in rows]
    qt = [r["tOff"] - r["on"] for r in rows if r["tOff"]]
    print(f"  本工具 QRS 中位 {np.median(q):.0f}（{min(q)}–{max(q)}），QT 中位 {np.median(qt):.0f}"
          f"  | 算法 QRS {[v.get('QRS_ms') for v in al.values()]} QT {[v.get('QT_ms') for v in al.values()]}")


def plot(case_id, meta, fs, x, rows, outdir: Path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    outdir.mkdir(parents=True, exist_ok=True)
    leads = meta["leads"]
    show = ["I", "II", "V1", "V2", "V5", "aVF"]
    t = np.arange(x.shape[1]) / fs * 1000
    fig, ax = plt.subplots(len(show), 1, figsize=(30, 2.3 * len(show)), sharex=True)
    for k, l in enumerate(show):
        ax[k].plot(t, x[leads.index(l)], c="k", lw=0.8)
        ax[k].set_ylabel(l)
        for r in rows:
            ax[k].axvline(r["on"], c="g", lw=0.9)
            ax[k].axvline(r["off"], c="r", lw=0.9)
            if r["tOff"]:
                ax[k].axvline(r["tOff"], c="b", lw=0.9)
        ax[k].grid(alpha=0.3)
    ax[-1].set_xticks(np.arange(0, 10001, 200))
    fig.suptitle(f"{case_id}  green=QRS on  red=QRS off  blue=T end")
    fig.tight_layout()
    fig.savefig(outdir / f"{case_id}.png", dpi=45)
    plt.close(fig)


if __name__ == "__main__":
    cid = sys.argv[1]
    meta, fs, x = load(cid)
    rows = propose(meta, fs, x)
    print(cid)
    summary(meta, rows)
    if "--plot" in sys.argv:
        plot(cid, meta, fs, x, rows, Path(sys.argv[sys.argv.index("--plot") + 1]))
    if "--json" in sys.argv:
        print(json.dumps(rows, ensure_ascii=False))
