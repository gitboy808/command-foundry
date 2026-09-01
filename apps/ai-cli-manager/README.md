# ai-cli-manager

管理当前 `PATH` 中生效的 Claude Code、Codex、Kimi Code、Pi、OMP、MiniMax CLI 与
Grok Build，不盘点 `PATH` 外的副本。安装来源根据当前命令路径推断，仅用于展示和 Claude
更新分派；`status` 直接查询 catalog 声明的官网 latest。

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
ai-cli-manager                 # 交互模式：选择操作，再多选要处理的工具
ai-cli-manager status          # 输出本地版本、安装来源和官网 latest 对比
ai-cli-manager status --json   # 输出相同状态的 JSON
ai-cli-manager status --local  # 只读本地状态，不访问网络
ai-cli-manager install omp     # 安装一个缺失工具
ai-cli-manager install omp pi  # 按参数顺序安装多个缺失工具
ai-cli-manager update          # 按 catalog 顺序更新全部已安装工具
ai-cli-manager update codex pi # 按参数顺序更新指定工具
ai-cli-manager uninstall mmx   # 卸载指定工具（必须显式给出工具名）
ai-cli-manager --help          # 显示帮助
ai-cli-manager --version       # 显示自身版本
```

可用工具 ID：`claude`、`codex`、`kimi`、`pi`、`omp`、`mmx`、`grok`。

### 状态扫描

扫描执行每个工具的 `--version`，读取 PATH 当前命令及其符号链接的真实路径，并在默认模式
下并行查询官网 latest：

- 命令不存在：`missing` / “未安装”；
- 命令成功且能提取版本：`installed` / 当前版本与推断来源；
- 命令存在但执行失败或版本不可解析：`unreadable` / “版本不可读”。

来源可能是 `official`、`homebrew`、`npm`、`bun`、`pnpm`、`mise` 或 `unknown`。它只描述
当前 PATH 中生效的命令；自定义安装目录、系统包管理器或手工复制的二进制可能显示为
“其他/未知”。latest 状态为 `current`、`outdated`、`ahead` 或 `unavailable`；只有本地版本
与官网响应相等时才显示“官网最新版”，网络或解析失败一律显示“官网版本不可用”。

latest 请求直接访问 catalog 中固定的 HTTPS URL，不调用 `npm view`、Homebrew 或上游
updater，也不受本机 npm registry 配置影响。`status --local` 完全跳过这些请求；可与
`--json` 组合。`status --json` 适合脚本读取，且不会进入交互。

### 安装与更新

缺失工具使用 [catalog](./src/catalog.ts) 中的唯一推荐入口；更新方式如下：

| 工具 | 推荐安装入口 | 更新命令 |
| --- | --- | --- |
| Claude Code | 官方安装脚本 | 标准 native 安装直连官网下载校验；其他来源 `claude update` |
| Codex | 官方安装脚本 | `codex update` |
| Kimi Code | 官方安装脚本 | `kimi update` |
| Pi | `npm install -g --ignore-scripts @earendil-works/pi-coding-agent` | `pi update --self` |
| OMP | 官方安装脚本 | `omp update` |
| MiniMax CLI | `npm install -g mmx-cli` | `mmx update` |
| Grok Build | 官方安装脚本 | `grok update` |

标准 macOS/Linux native Claude 安装会直连 downloads.claude.ai，校验 SHA-256 后原子切换
版本软链；已是最新版时跳过下载。连续 30 秒无数据即失败且不重试。非标准 launcher 会停止
并提示修复；其他来源和平台执行 `claude update`。相关请求不读取代理配置。

交互模式先选择安装、更新或卸载，再用复选框选择工具。安装默认全选；更新会跳过已确认是
官网最新版的工具，其余默认选中，并将需要特殊处理的 Claude Code 排在最后；卸载默认不选。
取消全部选项会直接结束，不执行动作，`Esc` 或 `q` 返回操作菜单。光标停在选项上时显示
精确命令，提交后仍会展示完整计划并等待默认 `No` 的确认。所有写操作都要求 stdin 与
stdout 连接真实终端；卸载在普通确认后还会要求一次默认 `No` 的二次确认。动作继承当前
终端，因此 Kimi 等上游工具可以显示进度或继续询问。多个动作逐个串行执行；单项失败不会
阻止后续动作。

官方安装器可能把新目录写入 shell profile，但无法修改已经运行的父进程环境。如果安装后
提示无法重新读取版本，请按安装器提示刷新当前 shell 或打开新终端，再运行
`ai-cli-manager status` 核验。

MiniMax CLI 的 `mmx update` 可能只打印 `npm update -g mmx-cli`；版本未变时仍按官网
latest 报告状态。

Grok Build 可能后台自动更新，因此两次扫描之间版本可能变化。

### 卸载

`uninstall` 必须显式列出工具名；交互清单默认不选，执行前经过两次默认 `No` 的确认。
不支持当前平台的工具会禁用并说明原因。

| 工具 | 卸载步骤 |
| --- | --- |
| Claude Code | `rm -f ~/.local/bin/claude`，`rm -rf ~/.local/share/claude` |
| Codex | `rm -f ~/.local/bin/codex`，`rm -rf ~/.codex/packages/standalone` |
| Kimi Code | `rm -f ~/.kimi-code/bin/kimi`（只删可执行文件，保留同根的用户数据目录） |
| Pi | `npm uninstall -g @earendil-works/pi-coding-agent` |
| OMP | `bun uninstall -g @oh-my-pi/pi-coding-agent`，`rm -f ~/.local/bin/omp`（官方未记载卸载方式，按安装来源推断） |
| MiniMax CLI | `npm uninstall -g mmx-cli` |
| Grok Build | `npm uninstall -g @xai-official/grok`，删除 `~/.grok/bin` 与 `~/.local/bin` 下的 `grok`/`agent` 链接，`rm -rf ~/.grok/downloads`（官方未记载卸载方式，按安装来源推断） |

卸载保留用户数据，只覆盖默认安装位置；多个步骤尽力串行执行。Pi 与 MiniMax CLI 支持
跨平台卸载，其余工具目前只支持 Unix。

### 结果与退出码

每个动作结束后都会重新执行 `--version`：

- 前后版本不同：显示版本变化；
- 动作成功但版本不变：再次直连官网核验，明确显示“官网最新版”“仍低于官网
  最新版”或“无法核验”；
- 上游非零退出、超时或动作后版本不可读：显示“失败”。

卸载动作的判定相反：命令从 PATH 中消失（`--version` 不再可执行）才算成功；执行后
命令仍在 PATH 中（可能由其他方式安装或存在残留副本）、或步骤超时，显示“失败”。

进程退出码：

- `0`：只读命令成功、用户取消，或全部动作均未失败；
- `1`：参数错误、缺少真实终端，或至少一个动作失败。

子进程输出直接显示在终端中；latest 结论只来自独立官网请求。

## 安全与执行边界

- 所有子进程均使用 `shell: false`，程序与参数分开传递；
- 上游动作继承终端，扫描与版本复检只捕获有限大小的输出；
- latest 请求超时为 5 秒；请求失败或正文超过 1 MiB 时降级为“无法核验”；
- 安装脚本只允许 catalog 中声明的 HTTPS 域名，每一跳重定向都会重新校验；
- 脚本下载限制为 2 MiB，写入权限受限的临时文件，执行后始终清理；
- Claude manifest 只接受 downloads.claude.ai 的最终响应；二进制按 manifest 的大小和
  SHA-256 校验，在唯一临时目录准备后原子落位，`finally` 只尝试清理本次临时制品；
- 下载和动作均有超时，下载停滞 30 秒即失败且不自动重试；子进程动作超时会先终止整个
  进程树，再强制终止；
- 卸载步骤复用同一执行器与计划确认流程，只删除 catalog 声明的安装路径，
  不清理用户数据目录；
- 同一进程内的批量动作串行执行，避免同时运行多个安装器或 updater。

本工具不提供跨进程锁。Claude 使用唯一临时路径隔离制品，其他动作依赖上游并发安全；请勿
同时执行多个写操作。
