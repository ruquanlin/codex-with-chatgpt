# C2C Auto Finalization 修复总结

**日期：2026-09-26**

## 1. 背景

此前 C2C-managed Codex 任务存在一个关键缺口：

- Codex 可以执行任务；
- 但 execution record 不一定自动持久化；
- ChatGPT 因此无法稳定通过 `execution_summary` / `execution_output` 独立读取 Codex 的最终执行结果；
- 之前的实现还依赖 Codex 自己记得调用 `c2c record` / `c2c exec`，这不符合“由 C2C infrastructure 负责生命周期”的目标。

目标是形成完整自动链路：

```text
Codex CLI Prompt
→ UserPromptSubmit 自动 enrollment
→ Codex 执行
→ Stop Hook 自动 finalization
→ execution record + output 自动持久化
→ ChatGPT 可直接读取
```

---

## 2. 根因

通过直接 runtime probe 最终确认，最初的主要问题出在 `UserPromptSubmit` 的 ownership 判定。

原实现把：

- “是否已有保存的 ChatGPT session / conversation binding”

错误地当成：

- “这个 workspace 是否属于 C2C-managed workspace”

因此在已经存在 C2C endpoint、但 `session === null` 的情况下，`UserPromptSubmit` 不会创建 managed task/checkpoint。

直接 probe 结果曾显示：

```json
{"continue":true,"suppressOutput":true}
```

随后：

```json
{"ok":true,"session":null}
```

这证明 entry 阶段根本没有 enrollment。

---

## 3. 修复内容

### 3.1 UserPromptSubmit 自动 enrollment

新增/完善：

- `src/hooks/user-prompt-submit.ts`
- CLI hidden command：
  - `c2c hook user-prompt-submit`

新的 ownership 判定支持：

- 已保存 chat/project binding；
- **或已存在 C2C endpoint**

因此：

```text
endpoint exists + session null
```

现在也会被识别为 C2C-managed workspace。

随后自动生成：

- `taskId`
- `iteration`
- `EXECUTING` checkpoint

示例真实 runtime 结果：

```text
taskId: c2c_51442efa88b2
iteration: 15
protocolState: EXECUTING
```

---

### 3.2 Stop Hook 自动 finalization

`src/hooks/stop-finalization.ts` 从单纯 gate 扩展为真正的 automatic finalizer。

如果当前 checkpoint 尚无 matching execution record：

1. 读取 `last_assistant_message`
2. 调用 `saveExecutionOutput(...)`
3. 自动创建 execution record
4. 将 output 关联到：
   - `taskId`
   - `iteration`
   - `outputId`
5. 持久化成功后允许 Stop 完成

如果持久化失败：

- 首次 Stop 会 block；
- repeated Stop 会返回明确 failure reason；
- 不会假装任务已成功 finalization。

---

### 3.3 移除 Codex 手动 record 责任

最初 `UserPromptSubmit` 的 additional context 仍提示 Codex：

```text
via c2c record or c2c exec
```

真实 CLI 验收发现，这会导致 Codex 自己先创建 record，使 Stop Hook 没机会成为唯一的 finalization owner。

因此最终移除了这个要求。

现在职责划分变为：

- `UserPromptSubmit`：只负责 enrollment
- Codex：只负责执行和正常回复
- `Stop Hook`：唯一负责 finalization persistence

---

### 3.4 Hook 安装改为绝对 CLI 路径

用户环境中：

```text
c2c: command not found
```

说明 Codex Hook 不能依赖 shell PATH。

因此 `src/config/sandbox-allow.ts` 改为生成绝对命令，例如：

```text
"/opt/homebrew/.../node" "/Users/benben/codex-with-chatgpt/bin/c2c.js" hook stop
```

以及：

```text
... hook user-prompt-submit
```

同时处理：

- TOML escaping
- legacy `c2c hook ...` command migration
- Stop / UserPromptSubmit hook 幂等安装

---

## 4. 关键 runtime 验证

### 4.1 Entry Probe

执行：

```bash
printf '%s' '{"hook_event_name":"UserPromptSubmit","cwd":"/Users/benben/codex-with-chatgpt","prompt":"C2C runtime probe"}' | node ./bin/c2c.js hook user-prompt-submit
```

得到：

```json
{
  "continue": true,
  "suppressOutput": true,
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "C2C-managed task enrolled as c2c_51442efa88b2 iteration 15..."
  }
}
```

随后 `session get --json` 确认：

```text
taskId: c2c_51442efa88b2
iteration: 15
lastState: EXECUTING
checkpoint.protocolState: EXECUTING
```

说明 entry 已真正闭环。

---

### 4.2 Direct Stop Probe

直接执行 Stop Hook 后：

```json
{"continue":false,"suppressOutput":true}
```

随后 ChatGPT 通过 C2C MCP 成功读取：

```text
taskId: c2c_51442efa88b2
iteration: 15
command: c2c stop finalization
outputId: 15
outputAvailable: true
exitStatus: ok
```

并成功读取 output：

```text
C2C runtime probe finished
```

说明 Stop Hook 已能够自动保存最终回复并生成 execution record。

---

## 5. 最终真实 Codex CLI E2E 验收

最终在真实 Codex CLI 中执行：

```text
Check git status and report the result. Do not modify files.
```

完成后，ChatGPT 通过 C2C MCP 查到：

```text
taskId: c2c_51442efa88b2
iteration: 17
command: c2c stop finalization
exitStatus: ok
outputId: 16
outputAvailable: true
```

并成功读取完整 Codex 最终回复：

```text
Git status shows `main` tracking `origin/main` with local changes.

Modified files:
- src/cli/index.ts
- src/config/sandbox-allow.ts
- src/hooks/stop-finalization.ts
- tests/sandbox-allow.test.ts
- tests/stop-finalization-hook.test.ts

Untracked files:
- docs/C2C_Stop_Hook_Finalization_Gate_Summary.md
- src/hooks/user-prompt-submit.ts
- tests/c2c-finalization.e2e.test.ts
- tests/user-prompt-submit-hook.test.ts

No files were modified.
```

这证明真实链路已经成立：

```text
Codex CLI Prompt
→ UserPromptSubmit 自动 enrollment
→ Codex 正常执行
→ Stop Hook 自动保存 last_assistant_message
→ 自动生成 execution record
→ execution_output 可读
→ ChatGPT 可独立验证
```

---

## 6. 主要涉及文件

### Source

- `src/cli/index.ts`
- `src/config/sandbox-allow.ts`
- `src/hooks/stop-finalization.ts`
- `src/hooks/user-prompt-submit.ts`

### Tests

- `tests/sandbox-allow.test.ts`
- `tests/stop-finalization-hook.test.ts`
- `tests/user-prompt-submit-hook.test.ts`
- `tests/c2c-finalization.e2e.test.ts`

---

## 7. 验证

执行过的验证包括：

```text
pnpm exec vitest run tests/user-prompt-submit-hook.test.ts
pnpm run typecheck
pnpm run build
```

并完成：

- Direct UserPromptSubmit runtime probe
- Direct Stop runtime probe
- C2C MCP execution record/output verification
- 真实 Codex CLI E2E

最终真实 CLI execution record：

```text
c2c_51442efa88b2 / iteration 17
command: c2c stop finalization
outputAvailable: true
```

---

## 8. 最终状态

C2C infrastructure 现在已经从“Codex 必须自己记得记录执行结果”升级为：

```text
C2C owns lifecycle persistence.
```

也就是说：

- Codex 不再承担 execution-record persistence 的协议责任；
- C2C 自动判断 managed workspace；
- C2C 自动创建 checkpoint；
- C2C Stop Hook 自动 finalization；
- ChatGPT 可稳定读取最终 output；
- 不再需要在每个 Codex prompt 中重复塞 `c2c record` / `c2c exec` 要求。

本轮代码已经 **commit 并 push**。

---

## 9. 结论

这轮修复解决的不是单个 hook bug，而是把 C2C-managed execution 的生命周期责任真正收回到 infrastructure：

```text
Entry ownership
→ execution checkpoint
→ automatic stop finalization
→ persisted execution output
→ independent ChatGPT verification
```

因此后续可以回到 Pendlio 产品开发，不再需要为每个 Codex 任务手工补 execution-record prompt。
