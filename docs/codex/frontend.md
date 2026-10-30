# Codex React 与 TypeScript 工程规范

涉及 React、TypeScript 或前端业务逻辑时，必须读取本文件。界面规则由项目的 `docs/web-ui-standard.md` 索引；文件不存在时读取对应模板并报告缺失。

## 1. React 与 TypeScript

生成或修改的前端代码必须：

1. 使用 React 函数组件和 Hooks，并遵循项目已有约定。
2. 使用清晰的英文变量名、函数名、组件名和文件名；普通注释、JSDoc 和 TSDoc 使用中文。
3. API 请求放在 Service 层，复杂的前端交互和展示逻辑放入内聚的 Hook、Service 或业务模块。
4. 复用已有状态管理和业务模式，不得在多处维护同一状态。
5. 前端负责展示、交互、本地界面状态和即时输入提示；不得把前端校验或计算作为权限、金额、库存和业务状态等关键结果的依据。
6. 页面、组件和 Hook 的职责及规模遵循 `docs/codex/code-quality.md`。

业务 API Service 应复用项目已有的请求入口；接口地址、认证状态、超时和通用错误转换需要跨业务共用时，在请求层集中处理，业务特有错误仍由业务模块处理。不得在页面中散落重复的请求与错误处理，也不得为了统一请求入口引入新请求库或重构无关模块。

导入结果等来自服务端或用户的文本默认按文本呈现。确需显示富文本时，先确认内容来源和安全处理方式；不得将未经安全处理的内容直接注入 HTML。

仅影响当前页面呈现的临时筛选、排序和图表联动，可由前端处理已获授权且已返回的数据；需要访问更多数据，或影响权限、持久化、业务状态、正式指标口径和汇总结果时，由后端提供权威结果。前端可以即时提示输入错误或禁用操作，但后端必须独立校验。归属或业务口径不明确时，先确认需求，不得在两端各自编造规则。

## 2. 组件与主题基线

1. 新 Web 项目默认使用 Ant Design 6 和 `@ant-design/icons` 6，React 版本不得低于 18。
2. 现有项目保留已验证的组件库、图标和主题；改用公司基线前必须确认。

新 Web 项目需要图表时，默认使用 Apache ECharts 官方 `echarts` 包；不需要图表时不安装。现有项目保留已验证的图表库，不为套用基线迁移。React 封装包、ECharts 插件或其他图表库不属于默认依赖，新增前须获得确认。使用项目现有包管理器从 npm Registry 安装并提交锁文件。官方来源：[ECharts 安装说明](https://echarts.apache.org/handbook/en/basics/download/)、[Apache-2.0 许可证](https://github.com/apache/echarts/blob/master/LICENSE)。

新建或明显重塑界面时，可选使用 [Frontend Design Skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design) 辅助制定配色、字体、布局、动效和文案方案。用户明确要求、项目现有设计系统和 Web UI 规范始终优先；不得因使用该 Skill 擅自增加字体、组件库或其他生产依赖。

设计探索和方向确认按 `docs/codex/interface-design.md` 执行，使用 Skill 不能替代探索或验证。实现前核对选定方案与令牌、组件和页面状态的对应关系；原型发现问题时须回查设计决策，不自行改写已确认的任务与业务规则。

组件按以下顺序选择：

```text
Ant Design 能满足需求
└── 直接使用 Ant Design 组件和 Token

多个页面重复使用，并包含稳定业务规则
└── 组合 Ant Design 组件形成业务组件

Ant Design 无法满足必要的业务、交互或可访问性要求
└── 说明缺口、复用范围和验证方式后，自定义基础组件
```

只改变名称、默认属性或样式时，使用业务代码、ThemeConfig、组件 Token、`classNames` 或 `styles`，不得创建转发组件。自定义基础组件不得复制 Ant Design 已有能力，也不得依赖内部 DOM、内部类名或高优先级全局覆盖。

Ant Design 组件令牌由 `seekway-antd-theme.ts` 维护并通过根级 `ConfigProvider` 应用；布局扩展放在 `seekway-theme.css`，两处不得定义同一令牌。全局反馈须位于 Ant Design `App` 上下文，通过 Hook 或上下文实例调用 message、notification 和 Modal，不得使用静态调用。

采用公司基线时，`@ant-design/icons` 是唯一主要业务图标体系，图标按钮须有可访问名称和提示。使用项目现有包管理器从 npm Registry 安装依赖并提交锁文件，不得从非官方站点或公共 CDN 引入生产代码。官方来源：[Ant Design React 文档](https://ant.design/docs/react/introduce/)、[`antd` npm 包](https://www.npmjs.com/package/antd)、[Ant Design 图标文档](https://ant.design/components/icon/)、[`@ant-design/icons` npm 包](https://www.npmjs.com/package/@ant-design/icons)。

## 3. 前端 Demo 与合成数据

1. 新系统、新操作流程、多角色交互或界面方案不明确时，可先用前端 Demo 验证页面关系、操作路径和信息层级。页面已有成熟模式或主要风险在后端、集成、数据或性能时，不得为了展示而先做完整 Demo。
2. Demo 使用的合成数据不得来自真实用户或生产环境，必须明确标记为演示数据，并尽量与预期数据契约一致。
3. 合成数据至少覆盖任务需要的正常、加载、空数据、失败、无权限、长文本和极值状态；不需要的状态不得为了凑清单而强行增加。
4. 合成数据放在集中的 fixture、mock Service 或适配层，不得散落在页面组件内；不得为 Demo 擅自新增生产依赖。
5. Demo 经用户确认后，先定义接口和数据契约，再打通一个真实页面、接口、业务逻辑和数据读写的最小端到端流程。Demo 代码只有通过生产代码要求后才可继续使用，否则应删除或重写。

## 4. 禁止事项

1. 不得滥用 `any`、使用 `@ts-ignore` 掩盖错误或无理由使用非空断言。
2. 不得将大量请求、状态和前端交互逻辑堆积在单个组件中。
3. 除新 Web 项目的 Ant Design 6、`@ant-design/icons` 6 和有图表需求时的 `echarts` 基线外，未经批准不得引入新的 UI 组件库、图标库、CSS 框架、字体或可视化依赖。
4. 不得为了视觉效果擅自改变业务流程、字段、权限、默认值或操作结果。
