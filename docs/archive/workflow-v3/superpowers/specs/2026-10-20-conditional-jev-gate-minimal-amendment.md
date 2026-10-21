# Workflow v3 — Conditional Jev Gate / Trusted Preflight 最小修订 Spec

**版本：** Review Draft v0.1 · 2026-10-20  
**状态：** 待审核；**不授权源码修改或 Codex 实施**  
**目标工作区：** `codex-with-chatgpt` · `main` · 基线 `4153074`（存在未提交代码）  
**替代条款：** `docs/superpowers/specs/2026-10-19-jev-preflight-contract-v2-gate0-revised-spec.md` 中 §2 的全四项否定证明要求、初期禁止 `NOT_REQUIRED`、§3/§5/§6/§8 与之冲突的条文。其他机制与已发生的历史结果不变。

## 1. 决策与目标

采用 **B：Conditional Jev Gate + Trusted Preflight**。恢复“普通、范围明确、确定性任务无需调用 Jev”的原始 C2C 政策。取消把“证明四项触发条件在完整聊天历史中全部为假”作为普通任务通行前提。**不**将未验证调用方声明视为证明；C2C 自行做受限、以正向条件为基础的预检，且只签发与当前 Proposal 绑定的短期 `NOT_REQUIRED` 授权。

本次修订不重新设计 Workflow v3，不修改 Jev 模型、阈值或其他阶段算法，不重新解释历史 Jev Stop，也不启动 Governance Bootstrap、Stop Review、Governed Recovery。

## 2. 保持原 Mandatory Jev 四项触发条件

满足以下任意一项，**必须实际调用 Jev**，而非签发豁免：

1. `difficultOrUnclearBug`：困难、原因不清的 Bug。
2. `productionOrRuntimeIncident`：生产/运行时事故。
3. `completedPriorDiagnosisAndFollowupCodex`：已有一次诊断/调查轮次完成，拟发起下一轮 Codex 诊断、修复或跟进。
4. `repetitiveInvestigationWithoutProgress`：检查反复而未实质降低不确定性。

任何已知 Jev `stop`、失败执行线限制或已知相同调查线约束 **先于**豁免判定执行。若已发生 Stop，结果仍为 `STOPPED`；用户批准本 Spec 不构成清除 Stop 的授权。已有 `jevRequired=true` 继续强制进入 Jev；旧 `jevRequired=false` **不产生任何授权效果**。

## 3. 条件式预检判定

**授权判断顺序：**

1. **验证身份与完整性：** 已验证 Workspace、Proposal 格式、执行线关联、当前已存 Stop / Failure 记录；有错误或冲突时不得授予 `READY`。
2. **查找正向触发证据：** 从当前提供的任务事实、已知对话上下文和 C2C 自有相关记录识别上述四项触发；如明确成立，`REQUIRES_JEV`。
3. **处理不确定性：** 存在“继续调查/再试一次/线上故障/既往诊断”等未能澄清的含糊信号、相互矛盾的事实、可能重用停止调查线、需要猜测根因或关键来源不可用时，`REQUIRES_JEV_FOR_UNCERTAINTY`；不得悄悄走豁免。
4. **判断正向普通任务资格：** 仅当任务是明确、非推测性、独立且有具体目标/范围/已批准依据/可检查完成标准的常规操作，且在当前已知证据与 C2C 记录中未发现上述触发或 Stop 冲突时，才允许 `NOT_REQUIRED`。例：全新且界定清楚的功能实现、确定性局部编辑、简单资料读取；首次简单修复仅在确认不是已完成诊断后的新一轮 Codex 时有资格。**“目标写得短”或“来源声称简单”不足以判定普通任务。**
5. **其余场景：** `REQUIRES_JEV_FOR_UNCERTAINTY`。Jev `proceed/reframe/stop/unavailable` 语义保持不变；不可用时阻断自动继续。

这里的 `NOT_REQUIRED` 是“符合当前任务条件的政策性免调用判定”，**不是**“已在全量聊天历史中独立证明四项全假”。省略或隐藏实质性历史事实不被授权；当系统无法看见这些事实时，不能对不存在的全局证明作出声明。

## 4. 可信度与防绕过边界

- **决策权在 C2C：** C2C 不接受来自调用方的 `jevRequired=false`、`taskKind=ordinary`、`trusted=true`、自制 attestation/receipt、伪造 Jev `proceed` 作为授权；任务说明、类型标签和其他客户端内容仅作为需要校验的输入。
- **资格必须可审查：** 服务端检查结构化具体目标、约束、授权依据、任务材料及它**确实能读取**的相关 C2C 记录，形成受限预检结果和原因码。不得把对自由文本的形式校验冒充事实核验；正向事实与任务分类若不足以支持判定，转 Jev。
- **Stop 优先：** 预检和 Brief 签发之前核对既有 Stop Marker、执行线关联和已知调查指纹；不允许把仅更换 ID 的同一调查视为新任务。对已知关联但无法判断是否属于旧 Stop 的情况，不能发豁免。
- **短期授权：** 用 C2C 既有本地状态签发服务端控制、可验证、防伪的独立 `PreflightReceipt`；至少绑定 `workspaceId`、`executionLineId`、版本化 `proposalIdentity`、材料摘要、受限资格原因、签发/过期时间和 issuer；TTL 最多 **900 秒**。不把它伪装成 Jev Receipt，也不把它记成 Jev `proceed`。
- **两种互斥授权：** Phase 2 共享验证器接受 `(JEV_PROCEED, valid JevReceipt)` 或 `(NOT_REQUIRED, valid PreflightReceipt)`。`REQUIRES_JEV` 不可使用后一种；授权变化、信息冲突、重放、过期、异工作区、存储损坏均不能得到 `READY_FOR_EXECUTION`。
- **Handoff Proof：** 保留现有 Brief digest 与服务端 Proof 模型，在最小范围内将授权来源扩展为可区分的 `JEV_PROCEED` / `NOT_REQUIRED`，并在读取时重新校验对应来源和 Stop；不降低 Phase 3 的 Proof 检查要求。

**明示的信任限制：** 目前 C2C 无可信接口完整读取所有 ChatGPT 对话历史。因此它能核验服务端所见的事实和授权记录，却不能阻止一个刻意隐去前序诊断、重新描述任务的恶意调用方 *在所有情形下* 逃过语义分类。此风险由“已知 Stop 优先、含糊从严、服务端签发、限定资格和任务身份绑定”减轻，不能声称被密码学消除。本最小修订不新增全量聊天存储、外部可信证明服务或全局会话生命周期层。

## 5. Phase 2 / Phase 3 行为

| 条件 | Phase 2 |
|---|---|
| 当前线有绑定 Stop | `STOPPED` |
| 存在 Mandatory Jev 触发/实质不确定，无 Jev 授权 | `EXECUTION_PROPOSED` |
| 真实且适配当前 Proposal 的 Jev `proceed` | `READY_FOR_EXECUTION` |
| 有效且满足本 Spec 的 `NOT_REQUIRED` PreflightReceipt | `READY_FOR_EXECUTION` |
| Jev `reframe` | `REFRAME_REQUIRED` |
| Jev `stop` | `STOPPED` |
| Jev 不可用（已实际尝试） | `BLOCKED` |
| 无效、伪造、错配或过期授权 | 绝不 `READY_FOR_EXECUTION` |

`phase2_transition` 与 `phase2_execution_brief` 使用**同一**验证语义；后者只在 READY 后签发对应授权的 Handoff Proof。Phase 3 MCP 必须拒绝无有效 Proof 的 Brief，不因它格式正确就返回 `READY`。**当前只读核对显示 `src/mcp/server.ts` 的 `phase3_compile_execution` 入口仍直接调用编译器：属于 Task 3 未完成的既有边界，需在其原任务中完成验收；不可算成这次 Gate 0 修订的通过证据。**

## 6. 攻击与误判验收（仅定向）

1. **正向正常路径：** 新的、范围明确且非调试性质的确定性任务，由真实 C2C 预检签发有效 `NOT_REQUIRED`；Phase 2 可创建 Proof-backed Brief；Phase 3 仅在校验该 Proof 后 `READY`。记录真实调用顺序与授权类型。
2. **触发必须 Jev：** 分别覆盖四项正向触发，尤其“诊断已完成 → 下一轮确定性修复”；即使目标很清楚也不能发 `NOT_REQUIRED`。
3. **防伪与身份绑定：** 仅声明 `jevRequired=false`、仅声明 ordinary、伪造 `proceed` 或 PreflightReceipt、重放、过期、修改 Proposal/材料、更换 Workspace 均不能产生 READY。
4. **Stop 完整性：** 原 Stop 调查线、仅改 `executionLineId` 的同一调查、已知关联调查、冲突/损坏 Stop 记录均不能获豁免，也不能被新的 Receipt 覆盖。
5. **不确定性：** 续修、线上事件、未知诊断来源、互相矛盾的上下文都走 Jev；其不可用时保持 BLOCKED。
6. **保持既有功能：** Jev Receipt、Proposal Identity、Stop Marker、Brief、Proof 继续存在。仅定向测试和必要的真实 C2C E2E，不默认全套测试或全面重构。

## 7. 实施边界与发布约束

**仅在本 Spec 审核批准后**，另行通过既有 C2C Phase 2 / Jev（按触发条件）/ Execution Brief / Phase 3 正式授权流程交给 Codex。实施只允许涉及 Phase 2 预检与授权验证、短期 PreflightReceipt/Proof 的最小必要字段、受影响 MCP 入口、政策冲突的最小文本修订、定向测试。优先复用现有存储和身份机制；不得重写 Jev、模型/Prompt Compiler、Phase 4、Workflow Router 或其他项目代码。

**硬性发布前提：** 先修复并完成 Task 3 的真实 Phase 3 Handoff Proof 校验验收；再执行新普通路径的真实 E2E。两者都没有通过前，不标记 Workflow v3 完成。历史失败 E2E 与 Stop 始终保留原始结果。

## 8. 审核结论待确认

- **建议批准的政策取舍：** `NOT_REQUIRED` 通过“具体、确定性普通任务的正向资格 + 当前可核验记录/触发检查”获得，不再以完整历史中的四项否定证明为先决条件。
- **必须接受的边界：** 对话外、未传达的历史无法被 C2C 独立检测；如需要防御故意隐瞒的恶意调用方，则在没有可信对话来源接口的情况下，本轻量方案不能提供绝对保证。
- **本稿不是源代码实施授权。**
