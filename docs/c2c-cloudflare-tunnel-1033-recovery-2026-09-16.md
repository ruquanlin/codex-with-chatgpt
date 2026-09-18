# C2C - Pendlio 连接故障排查记录

**日期：** 2026-09-16
**Workspace：** `da`
**C2C 固定域名：** `c2c-da.pendlio.de`
**Workspace ID：** `1208b1350ccb`

## 1. 故障现象

ChatGPT 无法连接 `C2C - Pendlio` 插件。重新访问 C2C MCP 公网地址时，Cloudflare 返回：

```text
Error 1033
Cloudflare Tunnel error
```

ChatGPT 侧因此无法调用 C2C workspace tools。

## 2. 初步检查

检查本机进程：

```bash
ps aux | grep cloudflared
ps aux | grep c2c
```

最初两项均没有实际运行进程，只有 `grep` 自身。

项目 `package.json` 中确认 CLI 定义为：

```json
"bin": {
  "c2c": "./bin/c2c.js"
}
```

由于 `c2c` 没有注册为全局命令，以下命令不可用：

```bash
c2c serve
pnpm exec c2c --help
```

正确调用方式为直接执行 CLI：

```bash
node ./bin/c2c.js --help
```

C2C v2.0 提供 `start`、`stop`、`status`、`doctor`、`logs`、`tunnel` 等命令；不存在 `serve` 命令。

## 3. 发现启动了错误的 Workspace

最初在：

```text
~/codex-with-chatgpt
```

目录执行：

```bash
node ./bin/c2c.js start
```

虽然 Bridge 成功启动，但 `status` 显示：

```text
Workspace: codex-with-chatgpt
```

这不是 Pendlio 项目实际需要暴露的 workspace。

历史日志显示正常配置应为：

```text
workspace da (1208b1350ccb)
Named tunnel established: https://c2c-da.pendlio.de
```

因此停止错误 workspace 的 Bridge，并进入真正的 Pendlio repository：

```bash
node ./bin/c2c.js stop
cd /Users/benben/Documents/Codex/2026-08-20/da
```

随后通过工具 repo 中的 CLI 操作当前 `da` workspace：

```bash
node ~/codex-with-chatgpt/bin/c2c.js start
node ~/codex-with-chatgpt/bin/c2c.js status
```

确认 workspace 已恢复为：

```text
Workspace: da
```

## 4. Doctor 检查

在正确的 `da` workspace 下执行：

```bash
node ~/codex-with-chatgpt/bin/c2c.js doctor
```

结果：

```text
✓ Node.js (v26.8.1)
✓ Sandbox（已在白名单）
✓ Workspace (da)
✓ Bridge（端口 48765）
✓ MCP（未授权请求返回 401）
✓ OAuth
✓ Tunnel (https://c2c-da.pendlio.de)
· 已重新建立安全连接

Everything looks good.
```

但浏览器旧页面此时仍显示 1033，因此继续从各层验证，而不是仅依赖 doctor 的总结。

## 5. 验证 cloudflared Connector

执行：

```bash
ps aux | grep cloudflared
```

确认实际 `cloudflared` 进程存在，命令类似：

```text
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:48765 run c2c-1208b1350ccb
```

说明本地链路为：

```text
C2C Bridge :48765
        ↓
cloudflared
        ↓
Named Tunnel c2c-1208b1350ccb
```

进一步查询 Cloudflare：

```bash
cloudflared tunnel info c2c-1208b1350ccb
```

确认 Cloudflare 已看到 active connector。

Tunnel 信息：

```text
NAME: c2c-1208b1350ccb
ID: 1106d549-120b-4129-a9cf-1a2d9c62992b
```

`cloudflared 2026.9.0` 提示可升级至 `2026.9.1`，但 connector 已正常在线，因此该版本提示不是本次 1033 的直接原因。

## 6. 验证 DNS → Tunnel 映射

执行：

```bash
cloudflared tunnel route dns c2c-1208b1350ccb c2c-da.pendlio.de
```

返回：

```text
c2c-da.pendlio.de is already configured to route to your tunnel
```

因此确认固定域名已经指向正确的 named tunnel。

## 7. 最终端到端验证

执行：

```bash
curl -i https://c2c-da.pendlio.de/mcp
```

返回：

```text
HTTP/2 401
www-authenticate: Bearer realm="c2c", error="invalid_token", error_description="Missing bearer token"
server: cloudflare
```

响应正文：

```json
{"error":"unauthorized","error_description":"Authentication required"}
```

这里的 **401 是预期结果**：未携带 OAuth Bearer Token 访问 MCP endpoint 应被拒绝。

这证明完整链路已经恢复：

```text
Internet / ChatGPT
        ↓
c2c-da.pendlio.de
        ↓
Cloudflare DNS
        ↓
Named Tunnel
        ↓
active cloudflared connector
        ↓
127.0.0.1:48765
        ↓
C2C Bridge / da workspace
        ↓
MCP OAuth protection (401 without token)
```

随后 ChatGPT 再次调用 `C2C - Pendlio` 成功，`workspace_info` 返回：

```text
workspaceName: da
workspaceId: 1208b1350ccb
branch: main
```

## 8. 根因与关键经验

本次故障开始时 Bridge / Tunnel 没有正常运行；排查过程中又曾从 `~/codex-with-chatgpt` 启动 C2C，导致 Bridge 绑定到了错误的 `codex-with-chatgpt` workspace，而不是 Pendlio 的 `da` workspace。

恢复时应始终从目标项目目录运行 C2C CLI。例如 Pendlio：

```bash
cd /Users/benben/Documents/Codex/2026-08-20/da
node ~/codex-with-chatgpt/bin/c2c.js start
```

然后确认：

```bash
node ~/codex-with-chatgpt/bin/c2c.js status
```

目标必须是：

```text
Workspace: da
```

如果再次出现 Cloudflare 1033，推荐按以下顺序检查：

1. `c2c status`：Bridge 是否运行、workspace 是否正确。
2. `c2c doctor`：检查/重建 Bridge、OAuth、Tunnel。
3. `ps aux | grep cloudflared`：确认 connector 进程实际存活。
4. `cloudflared tunnel info <tunnel-name>`：确认 Cloudflare Edge 看得到 active connector。
5. `cloudflared tunnel route dns <tunnel-name> <hostname>`：确认 hostname 指向正确 Tunnel。
6. `curl -i https://<hostname>/mcp`：做端到端验证。

对于 OAuth 保护的 MCP endpoint，`curl` 返回 **401 Authentication required** 代表公网链路已经正常；Cloudflare **1033** 才代表 Tunnel 层仍有问题。

## 9. 本次无需执行的操作

本次恢复过程中最终无需：

- 重建 ChatGPT 插件；
- 删除或重新创建 OAuth client；
- 删除 named tunnel；
- 修改 `c2c-da.pendlio.de` DNS；
- 因 `cloudflared 2026.9.0 → 2026.9.1` 的提示而立即升级。

现有 C2C - Pendlio OAuth 授权在 Tunnel 恢复后继续有效。
