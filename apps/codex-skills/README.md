# codex-skills

用于启用或禁用本地 Codex 技能的交互式 CLI 工具。默认扫描以下目录：

- `~/.codex/skills/.system`
- `~/.codex/skills`
- `~/.agents/skills`

工具只更新 `~/.codex/config.toml` 中匹配的 `[[skills.config]]` 配置项，
不会修改或删除技能文件。

## 安装

需要 Node.js 20.17 或更高版本。

```bash
npm install
npm run build
npm link
```

安装完成后运行：

```bash
codex-skills
```

使用方向键移动光标，按 `Space` 切换技能状态，按 `Enter` 应用修改。
按 `Esc` 或 `Ctrl+C` 退出时不会写入配置。

修改技能状态后，需要重启 Codex 或新建任务才能生效。

## 使用命令

```bash
# 打开交互式技能选择器
codex-skills

# 只读显示当前生效状态，不写入任何内容
codex-skills --list
```

## 开发

```bash
npm run dev
npm test
npm run build
```

写入前会校验 TOML 格式，并通过临时文件和原子重命名完成配置更新。
如果选择器打开期间 `config.toml` 被其他进程修改，工具会拒绝写入，
避免覆盖其他进程产生的变更。
