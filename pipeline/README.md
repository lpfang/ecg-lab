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
