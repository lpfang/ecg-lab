# 心电图实验室 · ECG Lab

用真实 12 导联心电图学习读图的教学网站，面向高血压患者等普通读者和医学生：每个知识点都有通俗版和专业版两层讲解。

在线访问：https://lpfang.github.io/ecg-lab/

> 本站为教学工具，不能用于诊断，也不解读个人心电图。内容未经心内科专业人员审定。

## 目录

- `web/`：Vite + 原生 JavaScript 静态网站（`npm run dev` / `npm test` / `npm run build`）
- `pipeline/`：Python 数据流水线，把公开数据库中的记录转成静态文件，见 [pipeline/README.md](pipeline/README.md)
- `docs/`：[开发计划](docs/计划.md)、[数据核查](docs/数据核查.md)、[迁移经验](docs/迁移经验-心电图教学.md)

推送到 `main` 后由 GitHub Actions 自动测试、构建并发布到 GitHub Pages。

## 数据来源与许可

- **PTB-XL v1.0.3**（CC BY 4.0）：Wagner, P., Strodthoff, N., Bousseljot, R., Samek, W., & Schaeffter, T. (2022). PTB-XL, a large publicly available electrocardiography dataset (version 1.0.3). PhysioNet. https://doi.org/10.13026/kfzx-aw45
- **PTB-XL+ v1.0.1**（CC BY 4.0）：Strodthoff, N., et al. (2023). PTB-XL+, a comprehensive electrocardiographic feature dataset (version 1.0.1). PhysioNet. https://doi.org/10.13026/g6h6-7g88
- **LUDB v1.0.1**（ODC-BY 1.0，仅用于时间相关教学）：Kalyakulina, A., et al. (2021). Lobachevsky University Electrocardiography Database (version 1.0.1). PhysioNet. https://doi.org/10.13026/eegm-h675
- PhysioNet：Pollard, T., et al. (2026). PhysioNet as a global platform for biomedical research. Nature Health. https://doi.org/10.1038/s44360-026-00096-z

本仓库中 `web/public/cases/` 下的数据由上述数据库处理而来，按原许可再分发。
