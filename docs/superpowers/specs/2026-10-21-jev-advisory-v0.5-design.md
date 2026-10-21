# Workflow v3 — Jev Advisory v0.5 最小降权设计（审阅修正版）

**日期：** 2026-10-21
**源码核对基线：** `codex-with-chatgpt` / `main` / `00d689a`
**状态：** 用户已确认降权方向；本文件完成静态设计自审，**尚未授权具体实施通道、修改源码或通过测试**。
**目的：** Jev 默认不介入，只提供可选风险建议；模型意见不能新建永久 Stop，也不能充当正式执行授权。保留既有 Stop、权限及防伪校验。

## 1. 精确决策边界

1. **默认不自动调用 Jev。** 普通开发、明确修复、诊断、复杂调试均先使用 Workflow Router、任务材料与确定性风险检查。只有用户明确要求咨询 Jev 且当前调用不违反既有 Stop 校验时才调用；咨询结果为 `proceed` / `reframe` / `stop` 建议，不是正式授权或服务端拒绝的充分依据。
2. **未来 Jev 不再签发执行 Receipt，不再写入新 Stop Marker。** `available:false` 不自动冻结未被其他规则阻断的任务；咨询结果不影响已存在的 Stop/Failure、安全约束或用户授权。
3. **新任务唯一正式自动交接入口为 Trusted Preflight Receipt → Phase 2 Execution Brief → Handoff Proof → Phase 3（旧有效 Jev `proceed` Receipt 的短期兼容见 §3）。** 不新增“Jev 说 proceed”或 `jevRequired=false` 的第三种授权路径。Preflight 由服务端签发，仍绑定 Workspace、Proposal、风险材料与期限。
4. **历史 Stop 不追溯解除。** 同一 `executionLineId` 或现有指纹命中的旧 Stop 保持有效；已有 Jev Receipt / Handoff Proof 保持原验证语义直至到期，不转译为新授权。
5. **用户授权与 C2C 技术授权是两件事。** `approvedBasis` 和 `taskEvidence` 是调用方提供的材料，现有服务端不能独立证明它们与聊天中的真实用户批准完全一致。不得因为字段存在或 Receipt 有效就宣称“用户已经批准修改、部署或绕过 Stop”。

## 2. 确定性 Preflight：移除 Jev 裁决，不取消风险检查

对现有 Proposal 和 PreflightInput 按有限步骤判断，**不新建人工审批系统或安全 Attestation**：

1. **硬停止先行：** 先验证 Workspace/权限、Proposal 格式及 Identity、相关历史 Stop、已有执行失败记录。身份或存储失败为 `BLOCKED_VALIDATION`；有关 Stop 为 `STOPPED`；已记录失败继续走现有失败阻断，不得转成普通任务。
2. **检查任务最低完备性：** `goal`、非空 `inScope` 与 `implementationBasis`、明确 `approvedBasis.summary`、具体 `taskEvidence` 及可检查的 `acceptanceCriteria` 必须存在且相互一致。仅有模糊占位符、只有一句“已批准”、无法确认要求完成什么时为 `NEEDS_TASK_DETAILS`，不得签发 Receipt。现有服务端只能做有限的结构和规则校验，不宣称独立鉴真语义内容。
3. **高风险不交给 Jev 裁决：** 当现有材料显示生产事故、安全/授权边界、数据完整性、不可逆操作、外部副作用或未确认根因时，不因为出现关键词自动调用 Jev，但必须保留明确的风险说明、限定的允许动作、禁止范围、验证或回退方式。**根因尚未知的只读诊断任务不要求预先给出根因；只要求明确调查问题、证据采集范围、停止条件及不修改代码的约束。**缺少这些执行必需材料时返回 `NEEDS_TASK_DETAILS`；无法满足确定性权限或安全约束时返回 `BLOCKED_VALIDATION`。**仅有模型或调用方声称“风险已解决”不能覆盖已知矛盾或已知 Stop。**
4. **首次明确修复与普通任务：** 材料完整且没有硬阻断时可走 `NOT_REQUIRED`；已完成诊断、`follow-up`、`same issue`、`completedPriorDiagnosisAndFollowupCodex`、`difficultOrUnclearBug`、`productionOrRuntimeIncident`、`repetitiveInvestigationWithoutProgress` 及 `jevRequired=true` 均不再作为**必须调用 Jev**的独立理由，但其中的实际风险事实依第 3 步处理。`jevRequired` 暂保留为兼容字段，仍加入材料摘要；不作为独立授权、历史改判许可或免检证明。
5. **不再出现无后续授权出口的 `REQUIRES_JEV`：** 新 Preflight 不得返回“必须找 Jev 签字”作为常规交接条件；若证据缺失，使用既有 `NEEDS_TASK_DETAILS`，若确定性验证失败，使用 `BLOCKED_VALIDATION`，有旧 Stop 则 `STOPPED`。保留枚举仅供兼容也不能让新任务实际陷入无法签发的门禁死路。

上述“高风险材料”检查须限定为**当前已有字段可表达、可测试的最小规则**；不能把尚未建立的真实用户批准验证、语义事实真实性检测或全历史证据索引伪称已经实现。涉及真实部署、删除、生产变更等操作仍遵守 Workflow Router 的用户批准和原有外部执行权限，Preflight Receipt 本身不授权这些动作。

## 3. 源码改动范围及迁移

| 位置 | 必要改动 | 不得改动 |
|---|---|---|
| `docs/codex-execution-policy.md`、`docs/efficient-debugging-workflow.md` | Jev 从 Mandatory Decision Gate 改为仅在用户请求时使用的 Advisory，明确常规授权走 Preflight 与确定性校验 | 其他路由、执行授权、调试策略 |
| `src/mcp/server.ts` | `jev_decision_gate` 仍可只读返回建议，但停止在此工具调用 `issueJevReceipt()`；更新工具说明及权限注释以反映无写入；`phase2_preflight` 保留身份、Stop 和 Failure 检查，返回已有状态 | 不引入绕过 Phase 2/3 的 API |
| `src/workflow/phase2/preflight-receipts.ts` | 改动 `assessPreflight()` 的强制 Jev 分类，补入最小的材料/风险完备性判定；维持签名、材料摘要及 TTL | 不移除历史 Stop 查询，也不把任意非空文字当作已经证明的批准 |
| `src/workflow/phase2/jev-receipts.ts` | `issueJevReceipt()` 不再被生产 MCP 调用；为旧 Receipt、Stop 验证及测试保留必要的历史读取能力 | 不删除或更改已有 Stop、签名密钥、旧验证语义 |
| `src/workflow/phase2/authorization.ts`、`src/workflow/phase2/handoff-proof.ts` | 如需改动，只限兼容新 Preflight 版本与准确文案 | 不弱化合法 Receipt、关联 Stop、Handoff Proof 和 Phase 3 校验 |

**版本迁移必须明确：** 现有 Preflight Receipt 是 `version: 3`（issuer `c2c-conditional-preflight`），新判定语义不能静默复用旧 v3 Receipt。建议将新签发/校验升为 `version: 4`，保留签名、绑定和 900 秒 TTL。切换后旧 v3 Preflight Receipt 及其对应 Proof 可以安全拒绝，并允许未受 Stop/Failure 阻断的任务在新规则下重新申请；无需把旧记录转换为新授权。部署切换前应说明最多约 15 分钟的旧 Receipt/Proof 失效窗口。既有合法 Jev `proceed` Receipt / Proof 仍按原验证规则在有效期内处理；已过期不续签。

**兼容接口：** `boundJevResult` 可以暂留字段名称，但仅接受可信服务器已签发的现有合法授权类型；新 `jev_decision_gate` 返回不包含 `receiptId`，也不得使 `stop` / `reframe` 文本成为授权材料。旧的 `jevRequired` 是兼容输入，不再负责决定是否必须找 Jev，但仍被摘要绑定，篡改后不能复用旧 Receipt。现有测试或内部直接调用 `issueJevReceipt()` 的能力不代表存在允许在生产运行时通过 MCP 创建新 Stop 的路径；必须通过代码检索和回归测试确认生产调用点已经全部断开。

## 4. 现有 Stop 与实施通道的边界

2026-10-21 的执行线 `workflow-v3-mandatory-jev-v04-20261021` 已产生真实 Jev `stop`，不得修改、删除或借 v0.5 追溯改写它。现有 `getJevStop()` 通过执行线 ID 和由目标、范围、批准依据、实施依据等字段计算的调查指纹匹配，**并非全面语义等价检测**；仅改变某些实质材料可能避开指纹，因此不能声称技术上绝对防止换词绕过。对已知实质相同的被停止任务，工作流层仍必须保持阻断。

v0.5 的**治理权限变更**与已停止的 v0.4 **首次修复实施**在目标上不同，但部分代码位置重叠；不得仅以改名、新分支、换 PR 或换执行通道就声称已被允许。正式实施须事先确认：具体维护任务与旧 Stop 的关系、当前有效的用户代码实施授权、所用通道能否合法执行，以及独立的确定性校验路径。若无法确认合法路径，就停止于已审阅 Spec，不能伪造 C2C Phase 2/3 `READY` 或静默绕过既有 Stop。本修订**不设计或自动启动** Stop 解封及外部独立特权通道。

## 5. 定向验收矩阵

| 场景 | 预期 |
|---|---|
| 明确普通任务、首次有界修复 | 无 Jev 调用；材料齐全且无旧 Stop/Failure 时可签发新版 Preflight Receipt |
| 用户要求咨询 Jev：`proceed` / `reframe` / `stop` | 只读建议；不返回新执行 Receipt，不写入 Stop Marker，不改变正式授权状态 |
| Jev 不可用或未调用 | 不由 Jev 本身阻断；仍需完成确定性 Preflight / 权限验证 |
| 复杂 Bug、生产事故、安全边界、数据完整性或重复调试 | 不自动 Jev；风险所需材料不足时拒签并返回具体缺项，禁止凭非空占位语句通过 |
| 原有相关 Stop（原执行线或既有指纹命中）、已有失败执行线 | 沿用原 Stop/Failure 阻断；不自动解除 |
| 旧 Preflight v3 Receipt 及关联 Proof | 不因新版判定语义而被追认；按版本迁移规则安全拒绝 |
| 新 Preflight v4 Receipt（签名、Workspace、Proposal Identity、材料摘要、TTL） | 受篡改、跨工作区、身份/材料改变、过期均不得 READY |
| 旧有效 Jev `proceed` Receipt/Proof | 按原条件验证至到期；不得由新咨询签发或延长 |
| Phase 2 Brief → Handoff Proof → Phase 3 | 只有合法授权和有效 Proof 可 READY |
| 未获得当前具体维护任务授权、需绕过历史 Stop 的实施 | 不得执行 Codex 或宣称 READY |

建议最小更新：`tests/phase2-preflight-mcp.test.ts`、`tests/phase2-authorization-gaps.test.ts`、`tests/jev-receipt-mcp.test.ts`、相关 Receipt/Proof 版本测试。重点覆盖“模型不会新建 Stop”“旧 Stop 有效”“v3/v4 收据不混用”“高风险信息不全不能直接签发”“Phase 3 不旁路”。仅进行定向测试和必要的真实正式 C2C 授权链路验证；不能用模拟测试冒充真实授权。

## 6. 审阅结论及本轮边界

本文件是**对 v0.5 草案的静态设计修订**，并非已实施的代码、已通过的测试或可直接执行的官方 Codex Prompt。本轮不修改仓库、不运行 Codex、不调用 Jev、不改变已有 Stop，不新增治理服务、持久审批层、全历史索引或解除权限。当前仍存在调用方陈述的事实真实性无法完全独立验证、已知 Stop 的语义匹配范围有限、以及新授权机制未实施等限制；这些限制必须被如实报告，而不是声称已完全消除。若实施中发现新的实际越权路径，暂停该实施线并记录复现证据，不自动开展更广的治理开发。
