# DSH Agent SSH Dashboard

一个面向 DeepSeek Harness Agent 的 SSH 会话管理插件。Agent 负责提供连接信息和执行远端 Bash；人类界面只读，以“一个逻辑会话一个卡片”的方式展示连接生命周期、命令统计和逐段命令响应。

> 当前仓库同时生成原生 DSH Host/Client 包和 Dynamic Cordis Package。原生包可安装到 DSH profile 并在 Desktop 重启后自动加载；动态包仍可用于临时试运行。

## 功能

- `ssh_session_open`：创建或重新打开逻辑 SSH 会话。
- `ssh_sessions`：列出会话连接状态和命令统计。
- `ssh_bash`：通过本地 OpenSSH 在远端执行 `bash -s --`。
- `ssh_session_close`：正常关闭会话并保留看板记录。
- 每个 session 对应一个看板卡片，点击后查看 `Agent 命令 → 远端响应`。
- stdout、stderr、远端退出码、本地 SSH 进程退出码和超时状态分开记录。
- 身份文件路径不会出现在看板或 `ssh_sessions` 中。

## 状态语义

会话卡片只表达连接生命周期：

| 状态 | 含义 |
| --- | --- |
| `ready` | 已登记连接参数，等待首次命令验证连接 |
| `healthy` | 最近一次 SSH 传输正常完成；内部命令可以成功或失败 |
| `running` | 正在执行命令 |
| `closed` | Agent 正常关闭会话 |
| `error` | 明确的认证、DNS、主机密钥、网络或 SSH 传输故障 |

命令失败不会自动把会话卡片标红。失败命令只在详情中显示，并计入 `invalidCount`。

## 要求

- DeepSeek Harness Desktop 2.0.1 / DSH rc.7，或兼容版本。
- Host 侧可用 `subprocess`、`shell`、`timer`、`tools` 和 `webServer` 服务。
- Client 侧可用 `timer` 和 Slots。
- 本地已安装 OpenSSH `ssh`。
- Node.js 22 或更高版本，仅用于构建和测试本仓库。

## 构建

```bash
npm run check
```

构建产物位于：

```text
dist/native/index.js       原生 Host 入口
dist/native/client.js      原生 Client 入口
dist/cordis-package.json   动态安装载荷
dist/checksums.json
```

`cordis-package.json` 包含可传给 `cordis_define` 的 `plugin`、`name`、`purpose` 和 `code`。

## 持久安装到 DSH Desktop

1. 克隆仓库并运行 `npm run check`。
2. 在仓库目录执行：

```powershell
dsh plugin --profile desktop add link:.
```

3. 完整退出并重新启动 DSH Desktop。
4. 确认启动页包含 `agent-ssh-dashboard`，且 `/dsh-agent-ssh-dashboard/api/state` 返回 JSON。

`link:.` 会把当前仓库作为 Desktop profile 的持久依赖。修改源码后需重新运行 `npm run build` 并重启 Desktop。卸载使用：

```powershell
dsh plugin --profile desktop remove dsh-agent-ssh-dashboard
```

## 动态安装

读取 `dist/cordis-package.json`，依次调用 `cordis_define` 和 `cordis_run`。动态定义仅在当前 DSH 进程有效，适合开发测试；不要把运行时 `pluginId/packageId` 写进仓库。

## 使用

SSH 操作由 Agent 调用工具完成，看板只读。可以直接对 Agent 说：

- “打开 SSH 会话 `prod`，主机 `server.example.com`，用户 `deploy`。”
- “在 `prod` 上执行 `uname -a && df -h`。”
- “列出所有 SSH 会话及命令统计。”
- “关闭 `prod` 会话。”

使用私钥时提供本机完整路径；该路径不会出现在看板和 `ssh_sessions` 返回中。第一次连接默认采用 OpenSSH `accept-new` 主机密钥策略；生产环境建议明确使用 `strict` 并预先维护 `known_hosts`。

## 开发

```bash
npm test
npm run check:secrets
npm run pack:check
```

测试直接加载 `src/dynamic/host.js` 的真实函数体，并使用受控的 subprocess mock 验证：

- 普通远端命令失败不会污染会话连接健康。
- 超时时 `exitCode` 为 `null`，`processExitCode` 单独保留。
- DNS、认证等明确连接错误会把会话设为 `error`。
- 正常关闭后状态为 `closed`，统计继续保留。
- Client 注册目标 Slots 且源码可解析。

## 仓库结构

```text
src/dynamic/host.js       Dynamic Host 函数体
src/dynamic/client.js     Dynamic Client 函数体
scripts/build.mjs         生成可分发 Cordis JSON
scripts/check-secrets.mjs 提交前敏感信息检查
test/                     Node 内置测试
docs/                     架构、Tool API 和发布说明
```

## 安全

插件允许 Agent 使用配置的 SSH 身份执行任意远端 Bash。请使用最小权限账户和密钥，并阅读 [SECURITY.md](SECURITY.md)。不要提交私钥、密码、访问令牌、真实主机清单或 `known_hosts`。

## License

MIT
