# Workflow v3 — Conditional Jev Gate / Trusted Preflight 最小修订 Spec

**版本：** v0.3 · 2026-10-20 · 已冻结
**状态：** 已实施；普通路径 E2E 已通过；Mandatory Jev 完整正向 E2E 待独立验收
**实施基线：** `codex-with-chatgpt` / `main` / `4153074`
**修订关系：** 在冲突范围内替代 `2026-10-19-jev-preflight-contract-v2-gate0-revised-spec.md` 的“全部四项否定证明”和“初期一律禁用 NOT_REQUIRED”要求；其余安全机制继续有效。本文件取代同题 v0.1、v0.2 草案，旧稿保留作为审核历史。

## 1. 唯一目标与验收原则

**让普通、范围明确、确定性的任务正常执行；只有命中既有 Mandatory Jev 条件时，才要求 Jev。**

不再要求证明“完整聊天历史中四项触发条件全部不存在”，也不把不能取得这种证明当成 Jev 触发条件。`NOT_REQUIRED` 是**基于当前可核验任务材料和已知记录的政策性免调用判定**，不是全历史无风险的加密证明。

保持已有 Jev Receipt、Proposal Identity、Stop Marker、Execution Brief、Handoff Proof 及已发生的 Stop/失败记录。**不**扩建 Governance Bootstrap、Stop Review、Governed Recovery、聊天历史索引、第三方证明服务或新治理层。

## 2. Mandatory Jev：只依实际任务关联触发

只要已知事实满足以下任一项，就必须调用 Jev：

1. **困难或原因不清的 Bug**（`difficultOrUnclearBug`）。
2. **生产/运行时事故**（`productionOrRuntimeIncident`）。
3. **已完成一次诊断/调查后，拟对同一问题或实质连续的调查线再次发起 Codex 诊断、修复或跟进**（`completedPriorDiagnosisAndFollowupCodex`）。
4. **同一问题反复调查但不确定性没有实质下降**（`repetitiveInvestigationWithoutProgress`）。

“同一问题/调查线”的判断依据是实际目标、受影响行为、原因假设、此前调查结果及已知记录的实质关联；**不能只凭同一仓库、同一模块、同一使用者或此前发生过诊断认定关联**。目标明确的后续修复若属于同一已诊断问题，仍须 Jev；独立新任务不因项目历史自动触发。

已记录的 `jevRequired=true` 在**当前绑定任务材料**中属于强制 Jev 信号。`jevRequired=false`、`taskKind=ordinary`、调用方自述“首次任务”等都不是独立授权。

## 3. 有限、可终止的预检算法

对一个固定 Proposal，按以下顺序进行**一次**决策；不要为了寻找无法读取的隐藏历史而无限补证：

1. **校验基础数据**：Workspace、Proposal/执行线标识、必要任务内容、服务端记录是否可读取且格式有效。若身份/存储验证失败，返回 `BLOCKED_VALIDATION`；这是验证失败，**不是**自动触发 Jev。
2. **已知 Stop 优先**：若 Stop Marker 与当前 Proposal/调查线有可靠的实质关联，返回 `STOPPED`。仅更换名称或 ID 不得绕过已识别的 Stop。无已知关联的其他 Stop 不阻断当前独立任务。
3. **已知 Jev 触发**：当前材料、调用方给出的具体上下文与 C2C 可见记录有任一正向触发，或当前材料明确 `jevRequired=true`，返回 `REQUIRES_JEV`。
4. **有关联的不确定性**：如当前任务被描述为“接着修”“再查一次”“线上故障”、与某次已知诊断存在尚未厘清的实质关联，或者涉及当前触发判定的事实彼此矛盾，返回 `REQUIRES_JEV`。**不得把抽象的“也许另有未知聊天历史”单独当成不确定性触发。**
5. **普通任务资格**：具备具体目标、限定范围、可检查的完成标准和当前操作依据；按已知内容属于常规确定性工作（例如新功能、局部明确修改、只读查询）；未发现第 2–4 步风险，则返回 `NOT_REQUIRED`。不存在额外的“四项全否证明”或“全历史证明”门槛。
6. **信息不足但不涉及 Jev 触发**：如果缺少执行必需的目标、范围或验收依据，返回 `NEEDS_TASK_DETAILS`，补齐必要任务信息即可重新申请；**不要仅因一般信息缺失调用 Jev**。如果缺的是判断某项 Mandatory Jev 是否触发的关键事实，则按第 4 步执行。

该算法所用的输入集合及理由码应记录在当前 Proposal 的授权审计中。对于相同输入和相同已知 C2C 记录，结果应一致。输入发生实质变化，作为新判定处理；不重复开启“这项判断是否足够可信”的元审核。

## 4. ChatGPT 与 C2C 的责任分界

- **ChatGPT / Workflow Router**：根据实际可见对话提供任务说明、已知前序调查、当前操作依据与触发线索。它不签发可信授权，也不得把缺失的历史描述成“已验证不存在”。
- **C2C**：依据第 3 节的有限规则，校验 Proposal 结构、服务端记录、已知 Stop 与触发信号；对符合条件的 Proposal 签发受限的 `PreflightReceipt`。C2C **不必独立证明整个 ChatGPT 历史中从未发生诊断**，也不能把结构化字段齐全误称为语义事实已获独立认证。
- **剩余风险**：如果调用方刻意隐去并改写 C2C 无法读取的前序调查，当前系统可能误归类。使用已知 Stop、已知关联、具体触发信号、Identity/Receipt 绑定减轻风险；不声称密码学上消除此风险。若未来要消除此类风险，属于本次范围以外的独立产品决策，**不构成本轮实施阻塞**。

## 5. Stop 范围：严格有效，但不无限传播

现有历史 Stop 不可删除、改写为 `proceed`、事后补判或通过仅改 `executionLineId` 绕过。Stop 约束其原始绑定 Proposal、执行线，以及根据现有 Stop Marker / 调查指纹/已知具体事实**可靠识别为同一调查**的后续提案。

不能凭“同一 Workspace、文件、项目名称或未知全局历史”把 Stop 推定为所有后续任务的项目级封锁。若与**某个已知 Stop** 的实质关联存在具体且未解决的证据冲突，则不签发免 Jev Receipt，按原有 Stop/治理语义处理；不得把与 Stop 无关的普通任务拉入该争议。**本修订不改变已记录 Stop 的效力，也不引入解封操作。**

## 6. 授权防伪与最小兼容修订

- **两种互斥的有效授权**：`JEV_PROCEED` + 真实、匹配的 Jev Receipt；或 `NOT_REQUIRED` + 服务端签发、匹配的 PreflightReceipt。`jevRequired=false` 本身不能作为第三条路径。
- **PreflightReceipt**：复用既有服务端签名/持久化能力，签发者为 C2C，TTL 不超过 900 秒；至少绑定 workspace、executionLineId、proposalIdentity、**门禁相关材料摘要**（含 `jevRequired` 的有效值/存在性、预检证据及风险相关输入）、判定版本、原因码、签发与到期时间。它不是 Jev Receipt，也不能伪装为 Jev `proceed`。
- **身份最小变化**：优先扩展受保护的授权材料摘要与验证逻辑，而非仅为本变更全面重写 `stableIdentity()`。若必须升级 Proposal Identity，需给出具体兼容必要性，并保留旧格式安全拒绝免 Jev 的行为；不能静默接纳旧 Receipt 为 `NOT_REQUIRED`。
- **变更与复用**：`jevRequired=true` 变成 `false`、任务范围/风险/关联证据发生实质变化时，旧 PreflightReceipt 失效；不能用旧 Receipt 覆盖新的强制 Jev 事实。**同一 Proposal、同一未变更材料、有效期内的重复验证是正常幂等操作**，不视为攻击性重放；跨 Proposal/Workspace、篡改和过期使用必须拒绝。
- **共享验证**：`phase2_transition` 和 `phase2_execution_brief` 必须采用同一授权验证语义，校验现有 Stop 与当前材料；只有获准的 Brief 能获得对应授权来源的 Handoff Proof。
- **Phase 3**：`phase3_compile_execution` 必须验证 Handoff Proof（含 Brief digest、Proposal/Workspace 绑定、授权来源和 Stop），不能只凭结构正确的 Brief 编译 `READY`。保留现有真实 Jev `proceed/reframe/stop/unavailable` 语义。

## 7. 实施顺序：解除循环依赖，不降低验收标准

**Task 3 原有 Phase 3 Proof 校验缺口**与 **Conditional Gate 的 `NOT_REQUIRED` 路径**属于两个可分别实施、分别测试的局部改动，不要求先证明整个新正常路径 E2E 通过才能开始修复其依赖。

1. 保留 Task 1–3 未提交内容，先只读核对实际 diff、现有接口和测试；不重复实施已存在的修复。
2. 在**可真实满足现行授权与历史 Stop 约束**的 C2C 执行路径中，完成 Task 3 缺口修复与针对性测试；不得用手写 Prompt、假 Jev `proceed`、假 Proof、事后补调用或另开 ID 来冒充正式流程通过。
3. 在相同授权约束下完成 Conditional Preflight 最小增量与定向测试；复用已有记录/Receipt/Proof，不增设新的治理前置条件。
4. 仅在两项局部能力均可用后，进行普通 `NOT_REQUIRED` 与 Mandatory Jev 两条真实 C2C E2E，并核对 Phase 3 Proof-backed 编译结果。两条均通过前，不能标记 Workflow v3 最终完成。

**若现行门禁阻止第 2 或第 3 步**：报告具体受阻接口、返回状态和绑定的 Stop/授权证据，**停止执行**；该阻塞不自动授权绕过门禁、重设 Stop、创建治理系统或重新设计整份 Spec。由用户针对该具体阻塞决定下一步，不反复迭代抽象原则。

## 8. 最小验收矩阵

| 情景 | 预期 |
|---|---|
| 新的、明确且与既有调查无实质关联的局部任务 | `NOT_REQUIRED`，合法 Receipt / Proof，Phase 3 可在 Proof 有效时 `READY` |
| 同一项目过去发生过诊断，但当前任务独立 | 不仅因项目历史调用 Jev |
| 同一问题已诊断后再修复（即使修复很明确） | `REQUIRES_JEV` |
| 困难 Bug、运行时事故、无进展重复调查 | `REQUIRES_JEV` |
| 当前触发判定存在具体矛盾或续查信号 | `REQUIRES_JEV` |
| 仅缺少一般执行细节，未见 Jev 线索 | `NEEDS_TASK_DETAILS`，不是强制 Jev |
| 当前任务命中已知 Stop / 改 ID 重提相同调查 | `STOPPED`，不得豁免 |
| 与当前任务无关的旧 Stop | 不阻断普通路径 |
| 假 `jevRequired=false`、伪造 Proceed / Receipt、跨 Proposal 复用、篡改、过期 | 不得 READY |
| 同一未改变 Proposal 在 TTL 内重复验证 | 允许幂等验证 |
| 修改 `jevRequired=true` 或风险相关材料后重用旧免 Jev Receipt | 拒绝旧授权 |
| 缺失或伪造 Phase 3 Handoff Proof | Phase 3 不得 READY |
| 实际调用 Jev 后 `reframe/stop/unavailable` | 保留原有流程语义，不自动执行 |

验收只需对应的定向自动化测试与必要真实 C2C E2E；不把全面测试、全仓重构或引入可信全历史作为新增前提。每项结论必须标注是源码/测试验证、真实 MCP 返回，还是尚未验证。

## 9. 最终边界及审批点

**本 Spec 的验收原则：** 普通任务顺利通过；真正触发 Jev 的任务实际调用 Jev；历史 Stop 仍有效但不被无限扩大；安全检查有限、可解释、可终止。

**待批准内容：** 仅批准以上政策取舍与对应最小实施范围，并接受第 4 节明确的剩余可见性限制。**本文件本身不等于代码实施授权。** 实施需通过现有 C2C 正式流程获得实际执行权限；不因文档状态或测试通过而宣称 E2E 完成。
