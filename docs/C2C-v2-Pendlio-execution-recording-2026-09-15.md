# C2C v2 → Pendlio Execution Recording 修复与验收记录

**日期：** 2026-09-15\
**项目：** Pendlio\
**C2C Bridge：** `codex-with-chatgpt` v2.0.0\
**远程 MCP Endpoint：** `https://c2c-da.pendlio.de/mcp`

## 1. 问题背景

此前 Codex 虽然会实际执行 `test` / `lint` / `build`，但 ChatGPT 通过 C2C
无法读取这些执行结果。

典型现象：

-   `execution_summary` 返回空 records
-   `test_status` 返回 `No execution records yet for this workspace.`
-   `execution_output` 返回空列表
-   Codex 自己能够报告测试通过，但 ChatGPT 无法独立验证真实
    command、exit code、stdout/stderr

核心问题不是读取端，而是：

`Codex command execution → C2C execution store`

这条记录链路没有正确打通。

## 2. 目标架构

目标是保持 Codex 自己负责代码修改和验证，同时让 C2C 保存可供 ChatGPT
独立审查的执行证据：

``` text
Codex
  ↓
真实执行 test / lint / build / typecheck
  ↓
C2C execution recording
  ↓
command + exitCode + stdout/stderr
  ↓
execution_summary / test_status / execution_output
  ↓
ChatGPT 独立审查
```

不依赖 Codex 最终自然语言中的"tests passed"作为验证依据。

## 3. C2C Bridge 修复

C2C v2 execution recording 完成后，本地 bridge
已能够记录真实命令执行结果，包括：

-   command
-   exitCode
-   stdout
-   stderr
-   timestamp
-   taskId
-   iteration
-   outputId
-   validationType
-   tests / exitStatus

同时验证了成功、失败和 build 类型的 execution record。

C2C Bridge 版本：

``` text
version = 2.0.0
```

## 4. 中间问题：Bridge Workspace 指向错误

第一次远程部署后，ChatGPT 虽然已经连接到新版 bridge，但 workspace
暂时错误指向：

``` text
workspaceName = codex-with-chatgpt
workspaceId   = 51442efa88b2
```

这意味着：

``` text
ChatGPT
→ C2C - Pendlio
→ codex-with-chatgpt 自身源码
```

而不是 Pendlio。

当时 ChatGPT 成功独立读取了 C2C 自身测试：

``` text
Test Files: 17 passed (17)
Tests:      184 passed (184)
exitCode:   0
outputId:   4
```

这证明 execution recording 本身已经工作，但业务 workspace target
不正确。

## 5. OAuth / Reconnect 问题

Bridge 切换过程中曾出现：

``` text
Unknown client. Please reconnect from ChatGPT.
```

原因与新旧 bridge workspace/auth store 切换有关。

重新连接 C2C 插件后，新 bridge 可以正常被 ChatGPT 访问。

随后在把 workspace 切回 Pendlio 时，ChatGPT access/refresh token 被迁回
`da` auth store，并重新绑定到正确的
workspace，因此最终不需要再次重新连接。

## 6. Workspace 切回 Pendlio

最终 C2C bridge workspace target 已切回：

``` text
workspaceName: da
workspaceId:   1208b1350ccb
repo/path:     /Users/benben/Documents/Codex/2026-08-20/da
```

其中 `da` 为当前 Pendlio 源码仓库。

最终结构：

``` text
ChatGPT
  ↓
C2C - Pendlio
  ↓
https://c2c-da.pendlio.de/mcp
  ↓
codex-with-chatgpt v2.0 bridge
  ↓
da / Pendlio source workspace
```

## 7. 远程 MCP 工具验证

远程 MCP 保留 execution 相关能力，包括：

-   `run_tests`
-   `run_lint`
-   `build_project`
-   `execution_summary`
-   `execution_output`
-   `test_status`

同时保留 workspace/git 等读取工具。

## 8. Pendlio 端到端测试

在正确的 Pendlio workspace 上实际执行：

``` text
pnpm run test
```

C2C execution record：

``` text
taskId:         mcp_run_tests
iteration:      1
outputId:       1
command:        pnpm run test
exitCode:       0
exitStatus:     ok
tests:          passed
validationType: test
outputAvailable:true
```

ChatGPT 随后通过 C2C 独立读取 `outputId=1` 的真实 stdout/stderr。

### Build

Pendlio test script 首先执行 production build：

``` text
WRANGLER_LOG_PATH=.wrangler/wrangler.log vinext build
```

Build 成功完成。

### Tests

最终 Node test runner 输出：

``` text
tests 56
suites 0
pass 56
fail 0
cancelled 0
skipped 0
todo 0
```

即：

**56 tests passed / 0 failed**

## 9. 最终验收结论

以下链路已经完成真实端到端验证：

``` text
Codex / MCP 执行真实验证命令
        ↓
C2C v2 Bridge
        ↓
Pendlio workspace (da)
        ↓
Execution Record
        ↓
execution_summary
test_status
execution_output
        ↓
ChatGPT 独立读取 stdout/stderr/exitCode
```

验收状态：

-   C2C v2 bridge：✅
-   Remote MCP endpoint：✅
-   Pendlio workspace：✅
-   OAuth：✅
-   Test execution：✅
-   Execution recording：✅
-   stdout/stderr 保存：✅
-   exitCode 保存：✅
-   ChatGPT 独立 read-back：✅
-   Pendlio tests：56/56 passed ✅

## 10. 后续使用方式

以后 Codex 完成修改并报告测试通过后，可以直接在 ChatGPT 中要求：

``` text
@C2C - Pendlio 审查 Codex 的测试结果
```

ChatGPT 应优先检查：

1.  `execution_summary`
2.  `test_status`
3.  `execution_output(action=list)`
4.  对相应 `outputId` 调用 `execution_output(action=read)`

从而独立确认：

-   Codex 是否真的运行过验证命令
-   执行的是哪个 command
-   exit code 是否为 0
-   实际通过/失败的测试数量
-   stdout/stderr 是否与 Codex 的总结一致

## 11. 待整理事项

当前功能链路已经稳定。后续可单独处理目录和命名整理，例如：

-   将 `codex-with-chatgpt` 移入更清晰的 C2C infrastructure 父目录
-   考虑将含糊的 Pendlio 本地目录名 `da` 改为更明确的名称
-   明确区分：
    -   C2C bridge 软件
    -   Pendlio workspace
    -   MCP endpoint
    -   ChatGPT connector

这些目录调整不应与本次已经验证成功的 execution recording 功能混合修改。
