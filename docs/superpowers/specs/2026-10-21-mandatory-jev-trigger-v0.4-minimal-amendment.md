# Workflow v3 — Mandatory Jev Trigger v0.4 最小修订（审阅修正版）

**日期：** 2026-10-21\
**状态：** 政策方向已确认；草案已完成静态自审，**尚未实施或测试，不等于安全验收通过**\
**核对基线：** `codex-with-chatgpt` / `main` / `541118d`\
**修订范围：** 仅调整“完成一次诊断后，同一问题的后续 Codex 任务一律强制 Jev”这一独立触发条件及其直接依赖的政策、判定和测试。保留冻结的 v0.3 及全部其他机制。

## 1. 修改的唯一政策决定

**诊断轮次不是独立风险条件。** 对同一已诊断问题，若当前任务是**根因已明确、具体方案已批准、无已知失败或矛盾、范围和验收标准明确的首次有界实施**，不再仅因其属于后续任务而强制 Jev，可申请正式 Trusted Preflight。

同一问题的进一步**探索性诊断**、根因或修复方案仍存在实质不确定性，以及无进展的重复调查，仍按已有 Mandatory 风险条件调用 Jev。**获批不是自动授权；仍须获得 C2C 服务端签发并验证的 Receipt。**

## 2. 与 v0.3 的精确修订关系

本修订仅替代 v0.3：

- §2 第 3 项 `completedPriorDiagnosisAndFollowupCodex` **作为独立、无条件 Mandatory 触发**的定义；以及“即使修复很明确也仍须 Jev”的对应句。
- §3 第 3–4 步中**只凭同一问题继续修复、后续轮次或相关字样**推断 Mandatory 的部分；有关联的**实际、未解决的不确定性**仍触发。
- §8 中“同一问题已诊断后再修复（即使修复很明确）→ `REQUIRES_JEV`”的验收预期。

**不修改** v0.3 §2 其余三个独立条件：`difficultOrUnclearBug`、`productionOrRuntimeIncident`、`repetitiveInvestigationWithoutProgress`。其中生产/运行时事故条件不因事故是否被称作“正在发生”而缩窄；困难 Bug 的 Mandatory 条件也不因本修订而自动取消。一个任务即使满足首次已批准实施的形式，仍命中上述任一条件时，必须 Jev。

其他 Stop、Failure、授权及 Handoff 规则继续按 v0.3 执行。

## 3. 有限、可终止的资格判断

按既有 Phase 2 优先顺序，对**当前已知材料与可用记录**作一次判定：

1. **身份/材料/服务端验证异常：** `BLOCKED_VALIDATION`；不能将验证故障改称“普通任务”。
2. **相关 Jev Stop 或已记录失败执行线：** 保留现有 `STOPPED` / Failure 阻塞，不以新 ID、修改字眼或本修订绕过。
3. **其他独立 Mandatory 信号、原 Proposal 已知有效的 `jevRequired=true`、或具体且未解决的风险矛盾：** `REQUIRES_JEV`；不得转入 Trusted Preflight。
4. **同一已诊断问题的首次有界实施：** 必须在当前已有字段中给出**具体、相互一致**的根因/诊断结论、已批准的修复内容与实施依据（`approvedBasis`、`implementationBasis`、`taskEvidence`）、边界和可检查的 `acceptanceCriteria`，且无已知修复失败、重开探索或其他强制条件；满足后方可 `NOT_REQUIRED`。字段非空或 `approvedBasis.type=approved_design` **本身不足以证明**根因、批准和“首次”成立。
5. **一般实施细节或批准依据不足，且没有具体 Mandatory 风险信号：** `NEEDS_TASK_DETAILS`，只补足缺失的任务材料；不为缺少一般信息而调用 Jev。若现有事实相互冲突、关键根因仍不确定或仍需探索，则依第 3 步处理。
6. **与已有调查无实质关联的明确普通任务：** 继续使用 v0.3 的有限 Trusted Preflight 资格规则，不新设全历史证明要求。

“首次有界实施”指对同一已明确问题的**首次已批准修复执行尝试**，不是同一项目的第一次 Codex 调用；不能因为把失败后的第二次修复写成“首次”而取得豁免。已批准范围内的定向验收不因其在诊断后进行而独立触发 Jev，但若发现新故障、原假设被推翻或开始探索性调试，须重新按当前事实分类。

## 4. 输入字段、关键词及兼容要求

- `completedPriorDiagnosisAndFollowupCodex=true` 保留为**已发生诊断/关联线索**，不再独立等于 `REQUIRES_JEV`；需结合**当前操作性质**、诊断结论、批准依据、失败历史、风险信号判断。它不会因为“字段存在”而使缺乏根因证据的后续修复自动取得 `NOT_REQUIRED`。
- `follow-up`、`same issue`、“诊断后继续修复”等表述是**上下文线索**，不能仅凭字符串匹配触发 Jev；但“继续探索根因”“仍原因不明”“反复调查无进展”等包含独立风险的事实仍必须被识别。
- 保留 `jevRequired=true` 的强制效力，`jevRequired=false` 本身不是授权。**对于已知绑定 Proposal 或 Stop 的执行线，不得通过翻转标志、改名、重新签发普通 Receipt 或复用旧 Receipt 来追溯改判；已知的 Jev `reframe` / `available:false` 按既有路由规则处理，不得事后当作 `proceed`。**
- **现有能力边界：** 当前 C2C 的 `preflightMaterialDigest` 会绑定并校验 Receipt 所用的 `jevRequired` 值，但不能据此证明“某个从未被可靠记录的历史输入中，该值从未是 true”。原版 v0.3 已承认调用方隐去不可见历史的残余风险；v0.4 不宣称消除该风险。不能把“政策禁止翻转”写成“服务端可无条件检测任何历史翻转”。
- 对同一固定、未改变的授权材料，在有效期内重复验证保持幂等；任务/风险证据变化时旧 Preflight Receipt 失效，新材料必须重新分类。原有 Receipt 的工作区、执行线、Proposal、材料摘要、签名、900 秒有效期和 Handoff Proof 验证不变。

## 5. 最小实施涉及位置（仅定位，不授权实施）

1. `docs/codex-execution-policy.md`、`docs/efficient-debugging-workflow.md`：只替换“诊断完成即 Mandatory”的独立规则及其重复描述，保留其余风险条件。
2. `src/workflow/phase2/preflight-receipts.ts`：仅调整 `assessPreflight()` 对后续诊断字段/词语的分类与**已诊断后首次有界实施**的证据门槛；保留其他 Mandatory 信号、Stop、Receipt 摘要及验证路径。若现有字段无法可靠表达某项具体判断，应明确返回 `NEEDS_TASK_DETAILS` 或按实际 Mandatory 信号处理，**不得默认放行**。
3. 对应定向测试：`tests/phase2-authorization-gaps.test.ts`、`tests/phase2-preflight-mcp.test.ts`；仅覆盖受影响用例，不扩大测试范围。
4. 本文件作为独立 v0.4 修订留存；冻结的 v0.3 不覆盖、不重写。

## 6. 最小验收矩阵

| 场景 | 预期 |
|---|---|
| 同一问题已有具体根因证据，批准后首次有界实施；无其他 Mandatory、Stop、Failure | `NOT_REQUIRED`，可取得有效 Preflight Receipt |
| 仅出现 `follow-up` / `same issue` / “继续修复”，其他材料为普通、明确任务 | 不因这些字眼单独 `REQUIRES_JEV` |
| 已诊断问题仍需探索原因，或当前根因/修复方案有实质冲突 | `REQUIRES_JEV` |
| 只有“修复已批准”的空泛声称，缺少必要诊断依据，无具体 Mandatory 信号 | `NEEDS_TASK_DETAILS`，不得自动 `NOT_REQUIRED` |
| 原有困难/原因不明 Bug、生产/运行时事故、无进展重复调查命中 | `REQUIRES_JEV`；不受本豁免影响 |
| 当前已知绑定材料存在 `jevRequired=true`，改为 `false` 试图沿用已有授权 | 不得以此直接 `READY`；保留既有门禁与 Receipt 校验 |
| 已知相关 Stop（包括同一调查改 ID）或已记录失败执行线 | 原 `STOPPED` / Failure 阻塞不变 |
| 已知 Jev `reframe` / `available:false` | 按既有路由规则停止或重定范围；本修订不赋予事后 Preflight 替代授权的许可，也不虚称服务端已持久化这些状态 |
| 签名/身份/材料摘要不匹配、过期、跨工作区 Receipt，或无效 Handoff Proof | Phase 2/3 均不得未经合法授权 `READY` |
| 既有普通独立任务及相同输入的合法 Receipt 重验证 | 原正常路径保持可用、幂等 |

验证以针对性单元/MCP 测试和必要的真实正式 C2C 路径核验为限；测试的模拟决策不能冒充真实 Jev 返回。报告须区分设计审阅、代码验证与真实运行结果。

## 7. 边界与待证事项

本文件只是一项**已审阅的政策草案**，不是代码实施授权、不是完整安全审计、不是已通过 E2E 的声明。当前未实施，故不能宣称上述新分类在运行时生效。

保留 v0.3 对不可见聊天历史/调用方选择性叙述的既有残余风险。**当前服务端没有可证明全面追溯历史 `jevRequired` 翻转或所有 `reframe` / 不可用决策的记录来源；这些限制不因本修订而消失，不能称为已自动阻断。**本轮不新增历史索引、信任服务、Receipt 类型、授权旁路或治理框架；如果后续定向验证证实存在**新的实际越权路径**，应只报告可复现证据并停止扩大实施，不能自行稀释安全门禁或启动架构分支。
