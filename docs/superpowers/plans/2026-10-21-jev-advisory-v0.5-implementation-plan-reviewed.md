# Workflow v3 — Jev Advisory v0.5 Implementation Plan（自审修订版）

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This plan grants no execution permission.**

**Goal:** 将 Jev 降为仅在用户明确要求时调用的只读风险建议工具；正常任务改由确定性 Trusted Preflight 授权，保留历史 Stop、旧有效 Receipt 与 Phase 2/3 的完整性校验。

**Architecture:** 保留现有 C2C MCP 与 Phase 2/3 链路；在生产 `jev_decision_gate` 入口停止签发 Jev Receipt/Stop，在 `assessPreflight()` 内替换强制 Jev 分类为有限、可测试的任务材料检查；升级 Preflight Receipt 版本以禁止旧授权跨语义复用。旧 Jev/Stop 只读验证路径继续有效。

**Tech Stack:** TypeScript、Node.js、MCP、Vitest；现有项目脚本 `pnpm test`、`pnpm build`。

**Spec:** `docs/superpowers/specs/2026-10-21-jev-advisory-v0.5-design.md`（已保存、已获用户设计批准；截至核对时 Git 未跟踪）。

**Plan status:** 仅设计后实施准备，已完成静态自审；**未测试、未改代码、未取得本次实施授权**。本文档优先于同名未审阅计划供后续审查，但不更改已批准的 v0.5 Spec。

**Baseline:** `codex-with-chatgpt` / `main` / `00d689a`；执行前必须重新只读核对实际基线与文件状态。

## Global Constraints

- 目前**仅批准设计**，没有授予 Codex 实施或跳过现行 C2C 权限检查的许可。执行前必须单独核实合法授权和实施通道；不得将本计划、`approvedBasis`、测试结果或用户的设计批准当作 Phase 2 `READY`。
- 既有执行线 `workflow-v3-mandatory-jev-v04-20261021` 已收到真实 Jev `stop`；**不得**修改、删除、迁移、重命名规避或通过切换通道绕过历史 Stop。若维护计划在现有规则下仍受阻，停止于计划阶段并报告，不自动申请 Jev 重试。
- 仅编辑本计划列出的 Policy、MCP Jev 入口、Preflight 判定/收据以及必要定向测试；`authorization.ts` / `handoff-proof.ts` 仅在版本兼容必需时局部修改。不新增治理系统、权限旁路、第三方签名/审批服务、全历史证明或新执行工具。
- `jev_decision_gate`：只有用户明确提出咨询 Jev 时才调用；当前 MCP 无法独立证明用户是否提出了请求，因此这是 Workflow Router/调用方必须遵守的调用约束，而不是已有服务端可证明的授权事实。返回 `proceed` / `reframe` / `stop` 建议，无新 `receiptId`、无新 Stop Marker、无 Phase 2 授权；不可用也不独立冻结合法普通任务。
- 已知 Stop/Failure、Workspace scope、Proposal Identity、签名、材料摘要、15 分钟 TTL、Handoff Proof、Phase 3 必须照常强制校验；不能因 Jev 降权使任何一项降级。
- Preflight `NOT_REQUIRED` 只表示**不需要 Jev**，不代表任务无风险或无需真实用户执行批准。现有字段不能独立鉴真聊天中的批准内容，不得作超出能力的承诺。
- 新版 Preflight Receipt 用 `version: 4`；旧 v3 Preflight Receipt/关联 Proof 可安全拒绝，不能按新语义追认；旧有效 Jev `proceed` Receipt/Proof 按既有条件保留至到期，不续签。
- 仅进行定向测试与必要的正式 C2C 正向／负向核验；模拟 MCP 测试不冒充真实授权。未经用户进一步明确批准，不部署、不提交、不推送。**Task 1–3 必须作为同一次兼容切换完成验收，不允许只发布“Jev 已撤销、Preflight 尚未迁移”的中间状态。**

## Review Focus

1. **旧 v3 Receipt + v2 Handoff Proof：** 新判定不能重新放行旧授权；旧 v3 Proof 在切换后应拒绝，而旧有效 Jev v1 Proof 仍按原验签及时间规则有效（Task 2/3）。
2. **带 Proposal 的咨询请求：** Jev 返回 `stop` / `proceed` / `reframe` 都不得出现 `receiptId`，不得写入新 Stop 文件，且相同或更换 ID 的已知旧 Stop 仍能拦截正式授权（Task 1/3）。
3. **高风险但任务材料完整 / 不完整：** 已知生产事故、未知根因、授权/数据边界要按确定性约束作有限区分；只读诊断不要求先给出根因；空洞的风险承诺不应获 Receipt（Task 2）。
4. **`jevRequired=true`、既有诊断字段及关键词：** 均不因名称或布尔值自动形成 Jev 必审；其所陈述的真实风险仍须核查，字段值变化使旧 Receipt 失效（Task 2/3）。
5. **存储异常、篡改、跨 Workspace、到期、历史 Stop 与用户批准真实性：** 服务器不得对无效凭证返回 `READY`；外部部署/删除等仍需独立用户授权，**当前系统无法从字段本身证明聊天中的批准真实性**。相同 Brief digest 存在旧 Proof 时必须安全报告，不能覆盖或伪称已签发（Task 2/3）。

---

### Task 1：将生产 Jev MCP 入口改为只读 Advisory

**Files:**
- Modify: `src/mcp/server.ts`（`jev_decision_gate` 注册与处理）
- Modify: `docs/codex-execution-policy.md`
- Modify: `docs/efficient-debugging-workflow.md`
- Test: `tests/jev-receipt-mcp.test.ts`
- Read only: `src/workflow/phase2/jev-receipts.ts`（保留历史读取和测试构造能力）

**Interfaces:**
- Consumes: `runJevDecisionGate(input: JevGateInput): Promise<JevGateResult>`，已有 `getJevStop()` 查询。
- Produces: `jev_decision_gate` MCP 输出只包含 `JevGateResult` 的已有建议字段，**不再包含新签发的** `receiptId`；不写持久 Jev Receipt/Stop。这里的“只读”指**不创建新的业务授权/Stop**；现有 `getJevStop()` 首次读取可能创建 `issuer.key`，不能在未修改该读取实现前声称绝对零文件写入。

- [ ] **Step 1 — 红测：** 在 `tests/jev-receipt-mcp.test.ts` 增加/调整 MCP 测试：带合法且**没有历史 Stop** 的 Proposal 时，模拟 `stop` / `proceed` / `reframe`，均只返回建议、不返回 `receiptId`，状态目录无新增 `stop-*.json`、`stop-investigation-*.json` 或执行 Receipt（`issuer.key` 属于历史查询的现有初始化行为，不混同为新授权）。仅具 `workspace.read` 的客户端可咨询；另用已存在 Stop 的独立用例验证查询仍拒绝相关执行线，而不是把历史 Stop 用例误当成普通咨询。
- [ ] **Step 2 — 验证红测：** 执行 `pnpm exec vitest run tests/jev-receipt-mcp.test.ts`；预期新断言在旧行为下 FAIL。
- [ ] **Step 3 — 最小实现：** 在 `src/mcp/server.ts` 移除生产入口对 `issueJevReceipt()` 的调用与写入权限要求，含 Proposal 时亦只需 `workspace.read`；更新工具说明/注释和需要同步的输出契约，不触碰 `verifyJevReceipt()` / `getJevStop()` 与现有签名存储。保留 Proposal Identity 一致性验证和对已知 Stop 的现有保护；不签发授权，不引入另一条自动调用 Jev 的代码路径。**仅在用户主动要求时调用**属于 Router 调用规范，MCP 端无法独立核验用户意图，不写成服务器保证。
- [ ] **Step 4 — 修改 Policy：** 把两份 Policy 中“任何阶段 Mandatory Jev”改为“仅用户请求咨询时 Advisory”，将正式准入归于确定性 Preflight；写明旧 Stop 继续生效、咨询不可授权执行以及现有高风险外部操作仍需用户批准。
- [ ] **Step 5 — 绿测与审阅：** 重跑 `pnpm exec vitest run tests/jev-receipt-mcp.test.ts`；预期 PASS。对生产源码检索 `issueJevReceipt(` 的可达调用点；预期无 MCP 生产调用（历史工具函数/测试引用可存在）。

### Task 2：新 Preflight 确定性判断与 Receipt v4 迁移

**Files:**
- Modify: `src/workflow/phase2/preflight-receipts.ts`
- Test: `tests/phase2-preflight-mcp.test.ts`
- Test: `tests/phase2-authorization-gaps.test.ts`
- Modify only if required by migration: `src/workflow/phase2/authorization.ts`, `src/workflow/phase2/handoff-proof.ts`

**Interfaces:**
- Consumes: `assessPreflight(proposal: ExecutionProposal, input: PreflightInput): {state: PreflightState; reasonCodes: string[]}`、`preflightMaterialDigest()`、`issuePreflightReceipt()`、`verifyPreflightReceipt()`。
- Produces: 已有 `NOT_REQUIRED | NEEDS_TASK_DETAILS | BLOCKED_VALIDATION` 等状态的有限确定性分类；新 `PreflightReceipt.version = 4`，有效期仍为 `900_000 ms`。不新增 `READY` 旁路。

- [ ] **Step 1 — 红测：** 以现有 `goal/scope.inScope/scope.outOfScope/approvedBasis.summary/implementationBasis/riskProfile/taskEvidence/acceptanceCriteria` 写表驱动测试，并明确断言 `state` 和原因码：
  - 普通修改、已批准的首次有界修复、英文 `follow-up` / 中文“诊断后继续修复”、`completedPriorDiagnosisAndFollowupCodex=true`、`jevRequired=true`：不**仅因这些标签**返回 `REQUIRES_JEV`；仍需完整材料。
  - 根因未知的**只读诊断**：明确调查问题、可读证据范围、`outOfScope` 禁止修改及停止条件时可获得普通技术预检；未知根因本身不是必须 Jev。
  - `taskEvidence` 仅写“已批准”、没有可检查验收标准、或高风险任务缺风险边界/不允许动作/验证或回退信息：`NEEDS_TASK_DETAILS`，不签 Receipt。
  - 已知历史 Stop 或已有执行失败：对应 MCP 保持原拒绝状态；存储/身份损坏不得降级为 `NEEDS_TASK_DETAILS`。
  这些测试只能验证**有限、确定性的材料规则**，不能声称机器鉴真用户批准或任意自然语言的真实性。
- [ ] **Step 2 — 验证红测：** 运行 `pnpm exec vitest run tests/phase2-preflight-mcp.test.ts tests/phase2-authorization-gaps.test.ts`；预期新用例在现有强制 Jev 判定下 FAIL。
- [ ] **Step 3 — 最小实现：** 在 `assessPreflight()` 去除诊断轮次、关键词与 `jevRequired` 等**对 Jev 强制调用的判定**；将可核验的最低材料要求落在已有字段（包含 `scope.outOfScope` 与 `taskEvidence`、`acceptanceCriteria`）上，对识别出的高风险操作要求相应边界与验证/停止或回退依据。不得以新正则或“安全”一词冒充复杂语义鉴真；当既有字段不能明确表达高风险任务必要条件时，`NEEDS_TASK_DETAILS` 并指明缺项，不能默许放行。`getJevStop()`、Failure、权限及 Proposal Identity 检查继续由既有外层 MCP 执行；硬校验异常继续 `BLOCKED_VALIDATION`。`REQUIRES_JEV` 仅兼容保留，不能成为新任务的无出口状态。
- [ ] **Step 4 — Receipt 迁移：** 把新签发的 `PreflightReceipt.version` 升为 `4`，使 `verifyPreflightReceipt()` 仅接受 v4；保持 issuer、Workspace ID、executionLineId、Proposal Identity、`jevRequired` 值及存在性、材料摘要、HMAC、TTL 等绑定。`reasonCodes` 须与新语义一致（如统一 `DETERMINISTIC_PREFLIGHT_PASSED`），签发与验证保持同值；切换后 v3 Receipt/对应 Proof 均不得因重估而被追认。若涉及 Proof 校验，做最小兼容修改而非引入新的 Proof 签名协议。
- [ ] **Step 5 — 绿测：** 运行 `pnpm exec vitest run tests/phase2-preflight-mcp.test.ts tests/phase2-authorization-gaps.test.ts`；预期 PASS，覆盖 v4 同材料重复验证可用、v3 不可按 v4 重估、篡改、材料变化、跨 Workspace 和过期拒绝。**需要用有效签名的旧版测试夹具**证明 v3 被拒，而不是仅修改字节导致 HMAC 失败来充当版本迁移测试。

### Task 3：历史 Stop／旧 Jev Receipt／Phase 3 回归与交付检查

**Files:**
- Test: `tests/jev-receipts.test.ts`
- Test: `tests/jev-receipt-mcp.test.ts`
- Test: `tests/phase2-preflight-mcp.test.ts`
- Test: `tests/phase2-authorized-mcp.test.ts`
- Modify only when migration regression requires: `src/workflow/phase2/authorization.ts`、`src/workflow/phase2/handoff-proof.ts`

**Interfaces:**
- Consumes: Task 1 的 advisory MCP 返回、Task 2 的 Preflight v4，原有 `getJevStop` / `verifyJevReceipt` / `verifyPhase2Authorization` / `readHandoffProof`。
- Produces: 不存在无效 `READY` 的负向测试证据，以及有效 Preflight v4 → Brief → Proof → Phase 3 正向证据。

- [ ] **Step 1 — 红测/回归设计：** 将测试分为两种性质：**历史签名数据的隔离测试构造**（允许在测试环境直接调用 `issueJevReceipt()` 构造旧 Stop 或旧有效 `proceed`，不代表生产 MCP 仍能签发）与**生产 MCP**（不得签发新 Jev Receipt/Stop）。明确覆盖同执行线历史 Stop、仅改 ID 但现有指纹相同的 Stop、旧合法 Jev v1 Proof（到期前有效）、旧 v3 Preflight 不被 v4 接收，以及 `phase3_compile_execution` 无合法 Proof 时拒绝。**补充同一 Brief digest 已有旧 Proof 的迁移场景：不得静默覆盖不可变 Proof；该冲突在原 Receipt 的 15 分钟 TTL 过期后**仍可能永久存在**，不能假设“等 TTL 过去”即可解决。用独立测试证明安全拒绝及错误报告；在无另行批准的最小 Proof 存储方案前，明确把“相同 Brief digest 的重签发”记录为未解决的兼容限制，**不宣称全场景迁移成功**，更不能误报 Phase 3 READY。**
- [ ] **Step 2 — 执行定向回归：** 运行 `pnpm exec vitest run tests/jev-receipts.test.ts tests/jev-receipt-mcp.test.ts tests/phase2-preflight-mcp.test.ts tests/phase2-authorized-mcp.test.ts tests/phase2-authorization-gaps.test.ts`；预期 PASS。失败时只修复与本设计直接相关的断言或兼容逻辑，不能修改现存 Stop 使测试通过。**若迁移碰到旧 Proof 永久占位，按 Step 1 记录受限结果，而不是假称该场景 PASS。**
- [ ] **Step 3 — 构建与 Diff 检查：** 执行 `pnpm build`、`git diff --check`、`git diff --stat`；预期构建无错、无空格异常，改动只落在批准文件集合；确认未改变旧 Stop 的签名/读取、生产授权权限边界及 Phase 3 Proof 验证。
- [ ] **Step 4 — 真实协议验收（单独授权之后）：** 仅在该代码实施线具有正式授权时，进行一次真实 C2C 普通任务 Preflight→Phase 2 Brief→Handoff Proof→Phase 3 `READY` 及旧 Stop 负向核对；模拟模型返回不得称为真实 Jev E2E。若权限/Stop 阻断，原样记录接口和状态，不换线或重试求 `proceed`。
- [ ] **Step 5 — 交付报告：** 分别列明源码完成、定向测试、构建、真实 C2C 验收以及未解决的合法实施授权，不能用本地测试通过冒充工作流已经生效。**提交／推送另待明确授权。**

## 执行前检查点（不构成额外审批系统）

**当前状态：仅计划已编制，不可直接实施。** 设计稿截至核对时仍为 Untracked；可由用户将设计与本计划分别保存/提交。正式执行前须独立确认代码实施权限、C2C 现有授权协议与历史 v0.4 Stop 的关系。若找不到合法授权路径，应停止并说明具体阻塞，不能自行新建特权通道或伪造 Receipt。**本计划没有解决执行通道合法性，也没有通过旧 Stop；不能把“计划自审通过”误写成“可执行”。**

**新窗口建议：** 当前仍可留在 Workflow v3 Project。本计划审阅通过并进入实际代码实施、需要隔离上下文时再考虑新窗口；届时提供单条完整 Markdown 交接信息。
