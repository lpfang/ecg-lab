# 数据流水线

把公开心电数据库中的单条记录转成 `web/public/cases/` 下的静态文件。原始数据放在 `raw/`（不进 git），处理后的数据进 git。

## 环境

```bash
python3 -m venv pipeline/.venv
pipeline/.venv/bin/pip install wfdb numpy scipy
```

## PTB-XL 需要先下载的表格（约 200 MB，只需一次）

```bash
mkdir -p raw/ptbxl && cd raw/ptbxl
B=https://physionet-open.s3.amazonaws.com
curl -O $B/ptb-xl/1.0.3/ptbxl_database.csv
curl -O $B/ptb-xl/1.0.3/scp_statements.csv
curl -O $B/ptb-xl-plus/1.0.1/features/12sl_features.csv
curl -O $B/ptb-xl-plus/1.0.1/features/unig_features.csv
```

单条记录的波形文件由脚本按需下载。

## 生成病例

```bash
pipeline/.venv/bin/python pipeline/build_case.py ptbxl 33
```

- 输出：`<id>/signal.i16`（Int16 µV，导联优先）、`<id>/meta.json`，并更新 `index.json`。
- 可手写 `<id>/info.json`（`title` / `summary` / `tags`）覆盖列表中的标题和简介。
- 内容不变时不会改写文件。
- 质量问题（饱和、平线、基线漂移、Einthoven 关系不成立、两种算法测量差异大等）会打印出来并写入 `meta.json` 的 `issues`。

LUDB 的幅度被逐导联归一化，不是真实 mV，详见 [docs/数据核查.md](../docs/数据核查.md)。

## 手工标注的 P 波（房室传导阻滞病例）

`pipeline/manual/<id>.json` 存放本站手工标注的 P 波位置，生成病例时自动合并：替换自动标注中的 P 波，判定每个 P 波是否下传，写入 `meta.json` 的 `annotations.atrial`。格式与方法见 `build_case.py` 中 `apply_atrial` 的说明和 [docs/数据核查.md](../docs/数据核查.md)。

## 监护条带（VFDB：室速、室颤）

PTB-XL 没有室速、室颤标签。这两个病例取自 MIT-BIH 恶性室性心律失常库（VFDB v1.0.0，ODC-By 1.0）：两通道、250 Hz、约 35 分钟的监护记录，原库未注明导联身份，只有节律改变起点的标注（`.atr`），没有逐搏标注。

```bash
pipeline/.venv/bin/python pipeline/build_case.py vfdb 423@894 vfdb 426@642
```

- `记录号@起点秒`：截取 10 秒，不重采样、不滤波。`meta.json` 中 `kind: "strip"`，`strip` 字段保存原始记录号、起止采样点和 `.atr` 原始采样点，条带内时间由它们推算；`capabilities` 关闭逐搏标注、联动视图、间期 / 左室肥厚 / ST 表和卡尺的心率换算。
- 窗口经逐段画图核对（2026-11-15，Codex 复核）：423 的室速标注在原记录 898.460 s（样本 224615），426 的室颤标注在 645.728 s（样本 161432）。
- 422 号（室速 → 室颤）暂不收录：1528.844 s 起是数据库标注的噪声段，看不出室速转室颤的时刻。
- 调研过但未用：cudb（逐搏标注全是 N）；mitdb（室速多为 1–3 秒短阵）；Challenge 2021 宁波子集（12 导联，CC BY 4.0，标签噪声大：不少"室速"记录胸导联为平线、标"室颤"的有规则宽 QRS；持续性宽 QRS 心动过速 JS45546 等可作为以后的 12 导联候选）。所有候选库都没有尖端扭转标注。
