# C2C 原始项目、个人定制版与 Workflow v3 未来形态对比

> 更新时间：2026-10-18  
> 当前 C2C 基线：`main` / `868333b`（已与 origin/main 同步）  
> 文档作用：项目定位、阶段对比和未来 GitHub 发布计划；**非执行规范、非新的架构权威**。  
> 上层权威：`docs/workflow/WORKFLOW_V3_MASTER_ARCHITECTURE.md`、经批准的阶段 Spec / Implementation Plan。

## 1. 三个比较对象

| 对象 | 定位 | 依据 |
|---|---|---|
| **A. 上游 C2C** | ChatGPT 负责规划与审查，Codex 执行的安全协作桥梁 | [XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt) 的当前 README / LICENSE |
| **B. 我的 C2C（现状）** | 基于上游的定制版本，正在内建 Workflow v3 | 当前仓库源码与已完成的阶段验收 |
| **C. Workflow v3 完成态（目标）** | ChatGPT 决策、Codex 执行、用户验收的跨项目开发工作流 | Master Architecture 的目标与验收定义 |

**比较口径：** 上游项目会持续更新，“A”不是永久不变的历史版本；“B”是截至本文件日期的实现；“C”是目标设计，未验证前不得描述为已交付。

## 2. 总体区别

- **A 解决连接问题：** 让 ChatGPT 在 Codex 开发中承担规划与 Review，通过 OAuth / MCP 在 Workspace 内读取需要的上下文；Codex 保有代码执行职责。
- **B 增加过程治理：** 路由任务、识别风险、界定批准范围、绑定 Jev、生成 Execution Brief、编译最小执行包、规划验证并持久记录失败。
- **C 追求稳定的端到端体验：** 用户表达目标后，适用的流程尽可能自动展开；只有真正需要授权、权衡、视觉或生产验收时才要求用户介入。

## 3. 功能比较矩阵

| 维度 | A. 上游 | B. 当前定制版 | C. 目标完成态 |
|---|---|---|---|
| 协作模式 | ChatGPT Plan / Review，Codex 执行 | 保留职责分离 | ChatGPT decides · Codex executes · User accepts |
| 基础连接 | OAuth、Workspace 访问、Cloudflare Bridge | 沿用并扩展 | 作为受控执行基础设施 |
| 读写权限 | 上游 README 以只读 MCP 为核心 | 当前代码包含受权限控制的 `apply_patch` / 配置运行命令等工具 | 明确区分信息读取、代码修改与用户批准；公开说明边界 |
| 任务入口 | 通用协作流程 | Phase 1 Router、auto-trigger / discovery 已 E2E 验证 | 软件开发任务一致路由，常规路径默认静默 |
| 过程 Skill | 以 C2C Skill 和对话指令为主 | Debugging / Review / Brainstorming / Writing Plans 路由规则 | 过程 Skill + 适当领域 Skill，避免无关调用 |
| 风险与可见性 | 基础协议和审查 | HIGH / NORMAL、SILENT / EXPLICIT、持久化规则 | 仅高风险与实质性权衡额外介入 |
| 设计与范围 | ChatGPT 自行规划 | Grill 和批准边界 | 缩小任务、禁止额外重构与推测性扩展 |
| 执行授权 | 由协作过程管理 | Phase 2 Proposal / Identity / Jev / Execution Brief 已实现 | 条件式 Jev 及确定性执行授权 |
| Prompt | 依赖聊天和原有指令 | Phase 3 Compiler 已实现 | Brief → 最短充分 Prompt，不重复已知规则 |
| 模型选择 | 用户/执行环境主导 | Phase 3 Model Router 已实现 | 按任务选择最低成本的可靠模型 |
| 验证策略 | 测试记录与独立 Review | Phase 3 Validation Router 已实现 | 聚焦测试优先，浏览器仅在交互任务必要时使用 |
| 失败处理 | 原有执行 / Review 循环 | Phase 4A 失败契约、不可变存储和 Phase 2 拦截 | 失败终止旧线路，开始新的决策周期 |
| 稳定项目上下文 | Workspace 与项目文件 | 已有项目事实与文档 | Project Profiles 减少重复探索 |
| 完成状态 | 协作流程的 DONE / Review | 完整 Completion Routing 尚未完成 | 验证、Review、必要用户验收、关闭均有明确出口 |
| 历史与决策 | 执行记录 | Routing Record / WDR 规则、Failure History | 仅在有价值时保留可审查的决策与失败证据 |

**安全差异不可忽略：** 最新上游 README 将连接器描述为只读；目前个人定制版存在写入权限工具。对外发布时不能直接复制上游的“只读保证”措辞，必须以实际工具清单、授权模型和测试为准。

## 4. 已实现范围与真实限制（2026-10-18）

### Phase 1 — Workflow Router

已完成任务分类、过程 Skill 选择、风险/可见性/持久化规则的设计和实现；此前已完成 auto-trigger / discovery 的 E2E 验证。

### Phase 2 — Jev + Execution Brief

已实现 Execution Proposal Identity、Jev 结果绑定、Phase 2 状态及 Execution Brief 交接。旧 Jev 身份绑定不得为另一执行方案提供授权。

### Phase 3 — Compiler / Model / Validation Router

已实现 Prompt Compiler、Model Router、Validation Router，并完成相应开发阶段验收。实际效果仍以任务级验证为准，不代表各项目都已经完全无人工介入。

### Phase 4A — Failure Loop

已实现：
- Canonical Failure Contract 与规定的失败类型 / 路由组合。
- Workspace 隔离的不可变 Failure Store、原子发布、幂等与冲突校验。
- 两个 MCP 工具：失败记录、有限历史查询。
- 在 `phase2_transition` 与 `phase2_execution_brief` 拦截已失败的 executionLineId。

最近 Phase 4A 结束时，Codex 报告 **73 个聚焦测试通过**，`tsc --noEmit` 通过，并完成源码审查。

**重要边界：** Phase 4A 的失败线路阻断只覆盖上述两个 Phase 2 MCP 入口。它**并未**全局吊销所有旧 Brief 或通过其他路径发起的 Phase 3 编译请求。不可宣称已经具备系统级的无旁路强制终止。

**资料同步提醒：** Master Architecture 的阶段状态表包含较早的“NOT STARTED”等旧状态；本文件按已验收的实际实现记录现状，但不修改其架构约束。后续可单独更新状态表。

## 5. Workflow v3 目标流程

```text
User Request
  ↓
Workflow Router — classify / risk / visibility / persistence
  ↓
Primary Process Skill → Diagnosis or Design → Grill
  ↓
Jev (conditional)
  ↓
Approved Execution Brief
  ↓
Prompt Compiler → Model Router → Validation Router
  ↓
Codex — scoped implementation + focused verification
  ↓
ChatGPT Review
  ↓
User Acceptance (if required)
  ↓
Completion Routing → CLOSED
```

失败时：

```text
Failure → Immutable Failure Record
  ↓
FAILED / NEW_DECISION_REQUIRED
  ↓
New evidence → diagnosis / Router / Grill / Jev as required
  ↓
New executionLineId + Proposal identity
  ↓
New Brief → New narrow prompt
```

旧执行线不重试、不靠把旧 Prompt 不断加长来“修复”；先前已验证事实可沿用，旧授权不能沿用。

## 6. 完成 v3 还需要什么

以下是路线方向，**不是对新阶段任务编号、技术方案或自动执行的预先批准**。

1. **Project Profiles：** 为 Pendlio、Portfolio、C2C 等高频项目保留稳定的框架、仓库、部署及测试事实；Profile 不替代 Router 做决定。
2. **Completion Routing：** 补齐 Review、必要的用户接受、完成/阻塞出口；不能用 Codex 的“已完成”代替真实验收。
3. **跨阶段 E2E：** 覆盖普通变更、复发 Bug、高风险、失败后重新决策、用户验收等主要路径。
4. **权限与边界核查：** 当前写权限工具的授权和隔离；明确 Phase 4A 入口拦截的能力范围。
5. **文档一致性：** 实际源码、状态、README、对外演示不能互相矛盾。

### 典型 E2E 场景

- **Pendlio 1102 复发：** 路由为高风险 Bug，先诊断，再进行必要的 Jev、有限修改、聚焦测试和生产验收；旧失败线必须拒绝重用。
- **Portfolio 3D/移动交互：** 需要真实交互时才使用浏览器或真机验证；最后由用户判定效果是否可接受。
- **C2C 自身失败：** 验证权限、Identity、Failure History 和新决策周期的交接。

以上是测试场景，不意味着应主动在生产环境制造故障。

## 7. 项目原创性与上游归属

**合理定位：** Workflow v3 是由项目所有者主导目标、组合架构、范围决策、评审与验收的个人设计成果，文档及代码开发使用了 AI 辅助。

**不合理的说法：** 声称从零发明 C2C Bridge / OAuth / MCP；声称独占 Router、Jev 等通用概念；或把上游代码全部描述成个人原创。

建议英文项目简介：

> A human-governed AI software delivery workflow, architected through a user-led design process and implemented with AI assistance. Built on and extended from the open-source Codex with ChatGPT project.

原始项目：[XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt)。上游采用 **MIT License**（2026-10-18 已核查）；分发源自上游的代码时保留适用的原始版权和许可证声明。外部 Skills 和依赖应另行核对。此处不是对具体著作权归属的法律认定。

## 8. GitHub 发布决策

**已选定路线：** 完成 Workflow v3 → 在实际项目 E2E 验证 → 确立独立项目定位及归属 → 发布 v1.0.0。

建议：
1. **先继续在当前 C2C 仓库开发**，避免在 Workflow v3 未完成前为形式上的独立而拆分稳定 Bridge。
2. **完成 E2E 与范围验收**，积累代表性的正常 / 失败 / 高风险 / 用户验收证据。
3. **准备发布资料**：项目独特价值、架构图、安装流程、示例、Known Limitations、权限与安全模型。
4. **检查敏感内容**：个人电脑路径、账号、Token、内部项目记录，以及任何不适合公开的配置或日志。
5. **选择衍生仓库形式**：若仍高度依赖 C2C，则公开说明其上游继承关系；若未来能独立运行，再考虑将 Workflow Core 抽离并把 C2C 定位为 Adapter。
6. **发布版本**：有明确 Release Notes、维护边界和 MIT 归属；不要为了“看起来原创”复制两份实质相同的仓库。

### v1.0.0 发布闸门

- [ ] Workflow v3 剩余能力实现并完成跨阶段 E2E。
- [ ] Project Profiles、Completion Routing 与用户最终授权职责相容。
- [ ] 失败线路与任何已知旁路的限制被准确测试、披露。
- [ ] 模型与测试默认选择“最小充分”，不依赖不必要的浏览器运行。
- [ ] 开源安全、隐私和第三方许可检查通过。
- [ ] README、架构说明和示例只宣称已经验证的能力。
- [ ] 完成独立项目 / Fork / Adapter 结构的最终发布选择。
- [ ] 发布 v1.0.0 后再考虑将其纳入 Portfolio Featured Project。

## 9. 参考资料与维护原则

内部：
- `docs/workflow/WORKFLOW_V3_MASTER_ARCHITECTURE.md`
- `docs/workflow/phases/phase-1-router.md`
- `docs/workflow/phases/phase-2-jev-execution-brief.md`
- `docs/superpowers/specs/2026-10-17-phase4a-failure-loop-design.md`
- `docs/superpowers/plans/2026-10-17-phase4a-failure-loop-plan.md`

上游：
- [README](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/README.md)
- [MIT License](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/LICENSE)

本文件仅用于对比与路线追踪；新阶段的正式实施必须通过批准的 Spec / Plan 与工作流决策，不因本文件的愿景而扩大执行范围。
