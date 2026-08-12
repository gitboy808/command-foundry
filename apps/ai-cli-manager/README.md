# ai-cli-manager

管理当前 `PATH` 中生效的 Claude Code、Codex、Kimi Code、Pi 与 OMP。它只负责发现、
编排和呈现结果，不盘点 `PATH` 外的副本，也不判断安装来源或远程最新版本。

要求 Node.js 22.19 或更高版本。

## 本地安装

```bash
npm install
npm run build
npm link
ai-cli-manager --version
```

`npm link` 会把全局命令链接到当前项目的 `dist/cli.js`。修改源码后需要重新执行
`npm run build`；通常不需要重复执行 `npm link`。

开发时运行完整检查：

```bash
npm test
npm run build
```

## 命令

```bash
ai-cli-manager                 # 交互模式：选择安装全部缺失工具或更新全部已安装工具
ai-cli-manager status          # 输出当前 PATH 中各工具的本地版本状态
ai-cli-manager status --json   # 输出相同状态的 JSON
ai-cli-manager install omp     # 安装一个缺失工具
ai-cli-manager install omp pi  # 按参数顺序安装多个缺失工具
ai-cli-manager update          # 按 catalog 顺序更新全部已安装工具
ai-cli-manager update codex pi # 按参数顺序更新指定工具
ai-cli-manager --help          # 显示帮助
ai-cli-manager --version       # 显示自身版本
```

可用工具 ID：`claude`、`codex`、`kimi`、`pi`、`omp`。

### 状态扫描

扫描只执行每个工具的 `--version`：

- 命令不存在：`missing` / “未安装”；
- 命令成功且能提取版本：`installed` / 当前版本；
- 命令存在但执行失败或版本不可解析：`unreadable` / “版本不可读”。

扫描不访问网络、不查询远程最新版，也不会读取 npm、Homebrew 或其他包管理器的安装
清单。`status --json` 适合脚本读取，且不会进入交互。

### 安装与更新

缺失工具只使用 [catalog](./src/catalog.ts) 中唯一的推荐安装入口。更新始终调用当前
`PATH` 中生效命令自己的 updater：

| 工具 | 推荐安装入口 | 更新命令 |
| --- | --- | --- |
| Claude Code | 官方安装脚本 | `claude update` |
| Codex | 官方安装脚本 | `codex update` |
| Kimi Code | 官方安装脚本 | `kimi update` |
| Pi | `npm install -g --ignore-scripts @earendil-works/pi-coding-agent` | `pi update --self` |
| OMP | 官方安装脚本 | `omp update` |

所有安装和更新都要求 stdin 与 stdout 连接真实终端，并在执行前显示精确计划、等待确认。
动作继承当前终端，因此 Kimi 等上游工具可以显示进度或继续询问。多个动作逐个串行执行；
单项失败不会阻止后续动作。

官方安装器可能把新目录写入 shell profile，但无法修改已经运行的父进程环境。如果安装后
提示无法重新读取版本，请按安装器提示刷新当前 shell 或打开新终端，再运行
`ai-cli-manager status` 核验。

### 结果与退出码

每个动作结束后都会重新执行 `--version`：

- 前后版本不同：显示版本变化；
- 上游退出码为 0、版本不变：中性显示“无变化”，不会写成“成功更新”；
- 上游非零退出、超时或动作后版本不可读：显示“失败”。

进程退出码：

- `0`：只读命令成功、用户取消，或全部动作均未失败；
- `1`：参数错误、缺少真实终端，或至少一个动作失败。

上游输出直接显示在终端中；管理器不解析上游文本，也不猜测“无变化”的具体原因。

## 安全与执行边界

- 所有子进程均使用 `shell: false`，程序与参数分开传递；
- 上游动作继承终端，扫描与版本复检只捕获有限大小的输出；
- 安装脚本只允许 catalog 中声明的 HTTPS 域名，每一跳重定向都会重新校验；
- 脚本下载限制为 2 MiB，写入权限受限的临时文件，执行后始终清理；
- 下载和动作均有超时；动作超时会先终止整个进程树，再强制终止；
- 同一进程内的批量动作串行执行，避免同时运行多个安装器或 updater。

本工具不提供跨进程锁。如果在两个终端中同时启动安装或更新，最终并发安全性由对应上游
安装器负责；建议等待一个进程完成后再启动另一个。
