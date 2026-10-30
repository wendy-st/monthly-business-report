# 月度经营报告系统

本机单人使用，以2026-09为首个核对月份，保留五个报告模块。不重建销售预测和历史LISTING上游程序。

规范基线：[SEEKWAY V2.1.0](https://github.com/songtu2025/seekway-codex-standards/tree/v2.1.0)，来源提交ff27d5a34bf8e34c9dc71b10d26ff40b6ec006fb。项目规则在AGENTS.md和docs/codex；原报告HTML与[业务说明](docs/business/报告业务逻辑说明_复刻基准_2026-09-V2.0.md)仅作只读业务及布局参考。

## 项目目录

```text
frontend/                 前端程序
backend/                  后端程序
data/sources/2026-09/      本期7份原始Excel（含历史及预测输入）
runtime/data/             月份登记及不可变快照
runtime/checks/           预检、财务核对及目录迁移检查结果
runtime/run/              日志及服务进程登记
docs/business/            现有业务逻辑说明
docs/codex/               开发专项规范
scripts/                  本地服务管理脚本
启动报告.cmd              双击启动
停止报告.cmd              双击停止
```

当前仅整理顶层目录及文件归属，前后端内部结构保留。`runtime`中的月份登记和快照必须一起保留，不能单独移动；辅助工具联接和依赖目录按原位置保留。

## 当前状态

9月真实数据已接入只读FastAPI接口，默认页面展示真实结果，开发环境的`/?preview=1`仅用于合成布局回归。前端使用React、TypeScript、Vite、Ant Design 6、ECharts，金额及筛选汇总由后端Decimal计算。

- 三期经营：本期2026-09、环比2026-08、同比2025-09；净销量、净收入及净利润按经营底表重算。
- 业务组当月概况：按原报告顺序展示经营指标、三级品类占比、利润瀑布与四项结论、原币均价和退货率、退款影响、11项费用及赔偿杠杆、完整及盈亏LISTING明细。站点与LISTING联动，US排在CA前，欧洲桶保留原始站点；LZF同比包含2025年MX数据，以新报告核算结果为准。恢复原稿表格分区、变化标记、公式批注和核算说明；费用杠杆保留冲回负号，退款汇总按三种口径的净利率变化核算。瀑布比较期间与费用比较期间独立，费用杠杆沿用费用比较期间并独立选择三种分析口径。
- 费用：实际、剔价、剔价剔退款各自核算环比与同比；按LISTING选价，人民币原生成本保持原值；退款明细、过去历史单位成本及佣金备用率分别处理。输出费用率桥、退款贡献、有符号11项利润拆解和利润弹性情景。
- 产品：894个本期款式，保留完整三级品类路径，提供相对盈利诊断及来源行；盈亏筛选以本期款式集合追溯历史。
- 库存：规模、金额、结构、库龄、预测起点全部取经营工作簿“库存数据”；只有周转天数的存量和流量取2025/2026周转表。库龄排除同步异常，分母保留全部有效FBA在库；未来支持使用已有预测，不假定新增补货，提供两种仓库范围及需求±15%情景、季节性风险。
- LISTING：本期沿用原9月报告的新品、UK推广、废弃/停运及MX简版；FR/ES/IT仅第5模块不显示，公司经营合计保留这些站点。
- 历史：读取冻结历史利润，单独筛选年份、站点、LISTING；展示年季月趋势、业务拆解、最佳月及排除清单。

本轮是9月数据接入与核对阶段，尚未交付后续月份上传/生成/切换、SQLite/SQLAlchemy/Alembic及Docker Compose/Nginx正式部署。历史看板的全部洞察和盈利象限、产品逐款成本变动归因等深层分析仍需补齐，不能将当前核心结果通过等同完整业务说明全部功能验收。用户已选择暂不调整Windows组件、不安装Docker、不自动重启。

## 使用

在本项目根目录双击`启动报告.cmd`，打开 http://127.0.0.1:5186/ 。双击`停止报告.cmd`关闭本项目服务。关闭浏览器不会停止服务；入口只管理登记且命令行属于本项目的进程，端口被其他进程占用时会报错，不自动结束其他进程。

启动入口不安装依赖、不重新导入Excel。源代码或核算规则更新后，入口先构建页面并预生成公司及各业务组的常用报告；首次生成需要等待，完成后普通启动直接复用。未生成过的筛选组合首次计算后保存。日志和进程登记保存在`runtime/run/`。服务仅绑定127.0.0.1，不提供互联网访问或登录系统。

Windows手动启动前，在frontend目录执行`npm run build`，在backend目录执行`python -m app.services.prepare_reports`。然后两个终端均进入backend目录：

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 5187
```

```powershell
python -m uvicorn app.web:app --host 127.0.0.1 --port 5186
```

手动命令可用Ctrl+C停止。Linux/CI使用相同命令。依赖准备与检查分开：前端按锁文件执行`npm ci`；后端需要Python 3.12以上及pyproject.toml声明的运行依赖。检查命令不会安装依赖。

日常页面由本机静态服务提供生产构建，保留5186页面端口及5187只读API端口；不代表Docker/Nginx正式部署完成。开发调试仍可在frontend目录运行`npm run dev -- --port 5188`，合成样例仅在该开发服务的`/?preview=1`可用。

## 数据与恢复

原始7份Excel经用户批准整体迁入`data/sources/2026-09/`，文件名和内容保持不变，此后不再移动、不改名、不写回、不刷新外部链接；旧HTML仍在原位置只读。当前导入读取公式缓存，未证明缓存的新鲜度；2026库存工作簿有1条外部链接，未刷新。

本地快照位于`runtime/data/snapshots/`，月份登记为`runtime/data/report-2026-09.json`，后端默认按项目位置定位数据，不依赖终端当前目录；手动设置`REPORT_DATA_DIR`可覆盖读取目录。同一源文件身份重复导入不产生新版本，发现来源变化则拒绝覆盖已登记月份；失败不发布月份登记，已完整落盘的同身份分表可复用。修改来源后的重新导入需要另行明确版本保留方式。

派生报告保存在`runtime/data/prepared/<源身份>/<核算代码版本>/`，与原始快照分离。预生成及首次筛选调用同一套现有核算器，结果原子写入；版本变化不会读到旧规则结果。公司总览和业务组请求精简视图，款式明细在产品页按需读取；默认完整financial接口保持兼容。前端复用同范围请求并保留重试，旧筛选的回包不会覆盖新筛选。

只读导入命令（在backend目录，当前已导入，无需每次执行）：

```sh
python -m app.services.source_import --source-dir ../data/sources/2026-09 --destination ../runtime/data
```

Excel、报告、快照、日志、数据库及CodeGraph索引均排除Git。未自动提交或推送GitHub。目录整理前备份位于项目外`D:\AI软件\backups\monthly-report\structure-20261027-153940\project.zip`，同目录`before.json`记录原文件哈希，`moves.json`记录迁移前后路径。需要回退时先双击停止入口，再按迁移清单将文件归位，从备份恢复修改的源码、配置和说明；不要将整个压缩包直接覆盖到新目录而留下两份来源。此前9月接入备份`before-september-data-20261027.zip`继续保留。

辅助工具实体位于`D:\AI软件\skills\frontend-design`和`D:\AI软件\tools\codegraph`，Codex保留发现入口，索引通过项目目录联接存到D盘。辅助工具不属于业务运行依赖，不要单独移动联接目标。

## 检查命令

在backend目录，Windows和Linux/CI共用：

```sh
python -m pytest -q
python -m ruff format --check app tests
python -m ruff check app tests
python -m mypy --strict app tests
python -m app.services.source_preflight --source-dir ../data/sources/2026-09 --output ../runtime/checks/source-preflight-2026-09.json
```

本机Mypy使用D盘开发工具，PowerShell运行前设置`$env:PYTHONPATH='D:/AI软件/tools/report-checks'`；常规环境安装到开发虚拟环境后无需此设置。预检不代表业务验收，也不重算Excel。

在frontend目录，Windows和Linux/CI共用：

```sh
npm run format:check
npm run lint
npm run typecheck
npm run build
npm test
npm ls antd @ant-design/icons react react-dom echarts
```

浏览器测试需先完成构建和预生成，启动本机5186/5187服务且具备9月快照，使用已安装的Microsoft Edge；CI需准备同一浏览器及私有测试数据。Playwright将真实页面测试指向5186，自动启动5188开发服务执行合成布局回归。未使用Browser插件，使用Playwright。真实页面测试另外覆盖API绑定、筛选、明细、错误重试、特殊字符及四种桌面宽度；真实金额不硬编码进前端测试。

## 9月数据接入核验（2026-10-27）

- 7份原始Excel导入前后及收尾SHA-256一致。经营底表三期共13386行、经营库存8862行、预测6324行、历史9430行。
- 净销量、净收入与原报告一致，净利润差异小于0.01元；小组、站点、店铺、一级/三级品类、LISTING、款式的21项加总勾稽通过。
- 后端19项pytest、Ruff格式/规则、Mypy strict通过；6个费用比较组合桥接、有符号利润影响勾稽及404/422参数校验通过。
- 前端格式、ESLint、TypeScript、生产构建通过；14项Playwright通过（6项真实数据、8项合成布局回归），四种桌面宽度无整页横向溢出。生产包未包含合成ReportApp入口，已人工查看五模块1440×1000截图。
- 启动、停止、重复启动已实际验证。未验证Docker，不声称正式部署完成。尚无数据库及Alembic配置，迁移检查不适用本阶段。
- 自动复杂度、重复率、循环依赖扫描未配置；已人工审查模块职责及调用方向，代码文件不超过300物理行。多口径汇总、LISTING组合和季节评分中存在超过50行的内聚业务函数，已按计算目标审查，不能说自动复杂度检查通过。
- 构建已有Ant Design `use client`及大包提示，不隐藏提示；完整辅助技术、全部对比度及全量深层业务逻辑尚未验收。

## 目录整理核验（2026-10-27）

- 7份Excel、业务说明、月份登记及全部快照共26个文件与迁移前SHA-256一致；98个未涉及的程序及测试文件内容不变。
- 6个报告接口经前端代理返回的完整结果与迁移前一致；新来源目录的7份Excel预检通过，同身份导入复用原快照，未生成新版本。
- 后端19项pytest、Ruff格式及规则、Mypy strict通过；PowerShell语法及UTF-8 BOM检查通过。真实报告五模块和演示入口的2项现有Playwright测试通过，未修改测试。
- 已验证迁移后的启动、重复启动、根目录停止入口及重新启动；服务保持运行在原地址。业务输入、运行数据和业务说明的Git忽略规则生效。
- 仅适配必要路径，未修改业务计算或前端源码，未安装依赖或调整数据库、认证及系统组件。前端完整构建与14项全量回归未在本次目录整理中重复执行；Docker及深层业务验收状态沿用上述未交付范围。
- 迁移路径和哈希证据位于`runtime/checks/structure-migration.json`；本次浏览器截图及测试输出保存在项目外备份目录的`browser/`中。
