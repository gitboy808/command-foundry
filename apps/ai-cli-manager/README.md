# ai-cli-manager

统一检测、安装和更新 Claude Code、Codex CLI、Kimi Code 与 Pi。

要求 Node.js 22.19 或更高版本。

## 安装

```bash
npm install
npm run build
npm link
```

## 使用

```bash
ai-cli-manager           # 交互式安装或更新
ai-cli-manager --list    # 只读显示状态
ai-cli-manager --json    # 以 JSON 输出状态
ai-cli-manager --update  # 更新所有来源明确的已安装 CLI
```

需要跳过远程版本查询时追加 `--offline`。完整参数以帮助输出为准：

```bash
ai-cli-manager --help
```

## 行为边界

- 检测阶段不修改系统，Homebrew 查询不会触发自动更新。
- 交互模式执行前需要确认；`--update` 会直接执行，并跳过来源不明或需要迁移的安装。
- 已安装工具沿用 PATH 中当前生效的来源；未安装工具由用户选择可用来源。
- 官方脚本仅从内置 HTTPS 白名单下载到临时文件，并在独立子进程中执行。

## 开发

```bash
npm test
npm run build
```
