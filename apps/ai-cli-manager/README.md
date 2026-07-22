# ai-cli-manager

用于检测、安装和更新 Claude Code、Codex CLI、Kimi Code 与 Pi 的交互式 CLI。

需要 Node.js 20.17 或更高版本。工具只在用户确认后执行安装或更新，检测阶段不会修改系统；Homebrew 查询会设置 `HOMEBREW_NO_AUTO_UPDATE=1`。

## 使用

```bash
npm install
npm run build
npm link

ai-cli-manager
```

交互界面使用方向键移动、`Space` 选择、`Enter` 继续。已安装的工具沿用当前 PATH 中生效安装的来源；未安装的工具会再让用户选择官方源、npm 或 Homebrew。

只读和自动化选项：

```bash
ai-cli-manager --list
ai-cli-manager --json
ai-cli-manager --dry-run
ai-cli-manager --offline
```

来源说明：

- Claude Code 官方源使用 `claude.ai` 安装器，npm 包为 `@anthropic-ai/claude-code`，Homebrew 为 `claude-code` cask（也识别 `claude-code@latest` channel）。
- Codex 官方源使用 OpenAI 安装器，npm 包为 `@openai/codex`，Homebrew 为 `codex` cask。
- Kimi Code 官方源使用 `code.kimi.com` 安装器，npm 包为 `@moonshot-ai/kimi-code`，Homebrew 为 `kimi-code` formula。旧版 `kimi-cli` 不会自动迁移。
- Pi 官方安装脚本底层使用 npm，当前包为 `@earendil-works/pi-coding-agent`；Homebrew formula 为 `pi-coding-agent`。旧包 `@mariozechner/pi-coding-agent` 只提示迁移。

官方安装脚本会先下载到临时文件，只允许固定的官方 HTTPS 域名，并通过独立子进程执行，不会拼接 shell 命令。

## 开发

```bash
npm test
npm run build
```
