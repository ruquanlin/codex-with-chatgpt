# Workflow v4 — Minimal Spec

**日期：** 2026-10-21
**状态：** v4 策略变更已获批准并写入仓库策略；更高优先级全局工作流是否同步切换尚未核实
**工作区：** `codex-with-chatgpt`（已核对 `main` @ `dc88d8d`）

## 目标

普通开发任务只走 **ChatGPT 确定任务 → Codex 执行并定向验证 → 用户验收**。不再为常规任务生成或传递多层流程身份、审批凭证和中间文档。

## 三步流程

1. **ChatGPT**：根据任务自动选择相关 Skill，确定目标、最小范围与必要边界；按任务调用对应 Skill 所需的精简诊断或设计步骤，不额外叠加 v3 门禁。确认本次执行授权后，给出**一条**精简 Markdown Codex Prompt；Codex 默认目标为 **GPT-6 Luna + Light 推理档位**；只有任务确实需要时才升级，并在交付 Prompt 时告知应使用的具体模型和推理档位。
2. **Codex**：仅在批准范围内实施；做定向验证；返回“改了什么、做了什么验证、是否阻塞”。C2C 已有执行记录机制继续在执行端工作，不成为新的用户交接阶段。
3. **用户**：验收结果；提交、推送、合并、部署或其他外部动作仅按明确授权进行。验收结束即停止，不追加完成状态审批。

## 智能 Skill Routing（保留 v3 的有效能力）

保留已有 Workflow Router 和 Skill 生态，由 ChatGPT **自动按任务类型选择，默认静默，不增加独立审批阶段**：

- Bug / 故障 → `superpowers:systematic-debugging`；新功能 / 交互方案 → `superpowers:brainstorming`；架构变更在设计获批后使用 `superpowers:writing-plans`。
- UI / 前端 → 按需 `frontend-design`；视觉审查 → 按需 `Impeccable`，其意见仅供参考，不自动扩大任务。
- React / Next.js → 按需 `react-best-practices`；代码完成 → 相应的 `verification-before-completion`；仅在确实缺少能力时使用 `find-skills`。

执行所选 Skill 真正必要的步骤（包括其明确要求的设计确认），但**不机械串联所有 Skill**；普通小改动不新增独立 Spec / Plan / WDR，除非该 Skill 或任务实际需要。

## Codex 模型默认策略

- **默认目标：GPT-6 Luna，Light 推理档位**，用于普通功能、小型 UI、确定性修复和日常代码修改。
- **仅当当前任务确实需要**更强推理能力，或有具体失败证据表明 Luna Light 不足时才升级；选择足以可靠完成任务的**最低成本档位**，不因项目整体复杂而升级。
- **需要升级时，ChatGPT 必须在交付 Codex Prompt 的同时，明确告知应选择的具体可用模型、推理档位及一句话理由**；不只笼统说“使用更强模型”，也不要求用户自己判断。默认使用 Luna Light 时无须反复提示。
- 模型选择由 ChatGPT 自动完成，不成为新门禁。仓库目前仅查到 `gpt-6-luna` 映射，**未验证 Light 档位的具体调用参数**；实施时按实际 Codex 能力映射，不虚构模型 ID，不把普通 Luna 误报为 Luna Light。

## 新窗口识别和交接（自动判断，不自动开窗口）

每次进入**新的实质性开发阶段**（任务目标、交付物或执行边界发生实质变化）时，ChatGPT 简短说明：**是否建议新窗口、应在哪个 Project、是否需要交接 Prompt**。

- **默认继续当前窗口**。仅在上下文过长、执行阶段确需隔离、或连接状态需要刷新时，建议开新窗口；不因完成一个小步骤就频繁换窗口。
- 如需新窗口，直接提供**完整单条、最短 Markdown 交接 Prompt**，仅包含已确认的项目 / Workspace、当前状态、下一任务、必要边界和验收要点；不重复全局规则，不让新窗口重新诊断已解决事项。
- ChatGPT 负责判断和推荐，**由用户决定是否实际开启新窗口**。不需要新窗口时，不生成多余交接文档。

## 文档交付前自审（ChatGPT 自动完成）

ChatGPT 创建或修订交付给用户的 Spec、Plan、报告、Markdown 文档及窗口交接 Prompt 时，**先完成自审和必要修正，再定稿、提供下载链接**；不把未经审核的草稿称为最终版。

自审仅核对：**符合已批准范围、事实与现有证据一致、前后无矛盾、无明显遗漏或占位符、格式与文件可用**。发现问题直接修订并复查；仍有无法核实的关键问题时如实标注为未定稿，不宣称通过。**这是 ChatGPT 内部质量检查，不新增用户审批、独立流程阶段或冗长审查报告。**

## 从默认执行路径中撤出

`phase2_preflight`、`phase2_transition`、`phase2_execution_brief`、`phase3_compile_execution`，以及它们所需的 Proposal Identity、Preflight Receipt、Execution Brief、Handoff Proof **均不再是 v4 普通任务的前置流程**。

不要新增 `workflow_prepare_execution`、通用缓存、任务生命周期状态机、审批凭证或新的治理子系统。v3 旧接口和历史数据可暂时保留供兼容与回退，但 **v4 不在内部重新调用这套链条**。

## 不可删除的安全底线

- 连接的 C2C 工作区及权限必须正确；用户批准本次执行不等于批准任意直接写入、生产变更或外部操作。
- **历史 Stop 不得作为 v4 普通任务的独立门禁**。`STOPPED`、`UNVERIFIED` 或 Stop 查询失败都不能单独拒绝 v4 普通执行；普通路径不调用 `jev_stop_status` 或 v3 Phase 2/3 门禁。历史记录保持不变供审计，旧 v3 API 仍按原行为执行 Stop 检查。若独立安全限制、用户授权或其他非 Stop 检查拒绝任务，仍必须遵守。
- For v4 ordinary execution, historical Stop results (`STOPPED`, `UNVERIFIED`) or a Stop query failure must not independently block the task. Continue to require workspace identity and permissions, explicit user authorization, and independent safety restrictions.
- Jev 默认不调用；仅在用户明确要求时咨询，且 Jev 意见不等于执行授权。
- 已有 Stop 标记不替代工作区身份、连接器权限、明确用户授权或独立安全限制；这些要求仍在各自授权边界执行。

## 历史 Stop 保留

- 不修改、删除、迁移或重新分类历史 Stop；保留现有记录用于审计和旧 v3 API 兼容。
- v4 普通执行不依据历史 Stop 状态单独阻断；不得将 Stop 标记解释为安全规则、用户授权或其他独立约束的替代物。

## 失败处理

一次失败，先报告具体原因。**没有新证据不自动重试**，不重建执行线、不反复改 Prompt、不反复重启 Bridge；有新证据时只解决当前阻塞，不重新启动整套流程。

## 最小落地范围

- **流程规则**：普通 v4 任务不经过 Phase 2/3 或历史 Stop 门禁；保留智能 Skill Routing、窗口管理、精简 Prompt 和定向验证；默认 Luna / Light。仓库策略文档不代表已修改更高优先级的全局工作流配置。
- **C2C**：保留只读 Stop 查询和现有执行记录；不改 OAuth、Bridge 身份体系、既有 Stop 数据或旧 v3 API。C2C-managed Codex 执行仍须按已有契约落盘记录。
- **采用范围**：此策略仅适用于本工作区 v4 普通执行。Portfolio、Pendlio、Investment 保持现状。
- **文件保护**：保留所有未提交、未追踪与历史文档，不做清理或重排。

## 验收

1. 普通已批准任务：**不调用四个 v3 Phase 2/3 工具**，输出一条精简 Codex Prompt，完成定向验证和用户验收。
2. 历史 Stop：旧 Stop 单独不能阻断 v4 普通任务；独立的安全限制、授权和工作区权限仍可阻断。历史记录不变，旧 v3 API 的兼容行为不变。
3. 用户未授权写入/部署：不执行相应操作。
4. 同样错误没有新事实：停止循环，报告阻塞。
5. Skill Routing 按任务自动选择相关 Skill，Impeccable 的建议不扩大范围；默认目标为 Luna / Light（能力支持时），仅在任务确实需要时升级，并在交付 Prompt 时明确推荐具体可用模型、推理档位和简短理由；不虚报实际执行所用模型。
6. 进入新实质性阶段时能判断窗口 / Project / 交接需求；只在必要时给出一条最短 MD Prompt。
7. ChatGPT 交付文档前先自审、修正并复核；仅在可定稿且实际文件可用时提供下载链接，不向用户交付未经自审的最终版。
8. 保留 C2C 既有执行记录契约；不误称用户尚未验收的任务已经完成。

**完成定义：** 上述定向验证通过、真实普通路径可用，并明确切换默认规则。此后不为“完整性”追加阶段。
