# Claude Code 安装与更新机制研究

研究日期：2026-08-12  
上游产品：Claude Code  
上游仓库：[`anthropics/claude-code`](https://github.com/anthropics/claude-code)  
核对仓库提交：[`681a8be`](https://github.com/anthropics/claude-code/tree/681a8be245e7759a405e276b16ae69ea6b75076f)

> 说明：Claude Code 主程序是闭源分发物，公开仓库主要提供 README、CHANGELOG、
> 插件和问题跟踪，并不包含 native 安装/更新器的完整实现。因此，本文对内部更新
> 分派的结论只采用 Anthropic 当前官方文档、官方安装器端点、官方发布制品和包元
> 数据能够直接证明的部分，不根据二手文章或用户 issue 推断。

## 结论

Claude Code 的命令名是 `claude`，版本命令是 `claude --version`，当前输出格式为
`X.Y.Z (Claude Code)`；官方文档给出的示例是 `2.1.211 (Claude Code)`。当前
`ai-cli-manager` 的版本提取器可以直接处理这一格式。
[来源：官方安装验证文档](https://code.claude.com/docs/en/installation#verify-your-installation)

Anthropic 当前推荐 native 安装；官方仓库已明确把 npm 安装标记为 deprecated。
macOS/Linux/WSL 使用 `https://claude.ai/install.sh`，Windows 同时提供 PowerShell
和 CMD 安装器。Homebrew、WinGet、apt、dnf、apk 也是官方文档支持的来源。
[来源：固定提交的官方 README](https://github.com/anthropics/claude-code/blob/b640d94a49629ef004ecceb5e2bd6d8aebf067ce/README.md#L13-L46)、
[官方安装文档](https://code.claude.com/docs/en/installation#install-claude-code)

更新不是所有来源都应统一执行 `claude update`：

- native 安装使用后台自更新或 `claude update`；该命令遵循 `latest` / `stable`
  发布通道以及最低/最高版本约束。
- npm 的官方显式升级命令是
  `npm install -g @anthropic-ai/claude-code@latest`。
- Homebrew、WinGet、apt、dnf、apk 默认由各自包管理器更新；Claude Code 不应绕过
  这些包管理器覆盖其文件。

来源：官方[更新说明](https://code.claude.com/docs/en/installation#update-claude-code)、
[npm 安装说明](https://code.claude.com/docs/en/installation#install-with-npm)和
[Linux 包管理器说明](https://code.claude.com/docs/en/installation#install-with-linux-package-managers)。

对当前实现而言，目录中已有的 Claude Code 基础定义大体正确，但有三个需要优先
修正的问题：native marker 不能可靠覆盖“不在 PATH 中”和 Windows 的安装；native
最新版检测没有区分 `stable` 与 `latest`；`Source` 无法表达 WinGet 与 Linux 系统
包管理器。现有“official 用 `claude update`、npm 用 npm、Homebrew 用 brew”的更新
分派方向是符合上游约束的。

## 命令、包名与版本协议

| 项目 | 当前权威值 | 证据 |
| --- | --- | --- |
| 可执行命令 | `claude` | [官方 CLI reference](https://code.claude.com/docs/en/cli-reference) |
| 版本命令 | `claude --version` | [官方安装验证文档](https://code.claude.com/docs/en/installation#verify-your-installation) |
| 输出格式 | `X.Y.Z (Claude Code)` | [官方安装验证文档](https://code.claude.com/docs/en/installation#verify-your-installation) |
| npm 包 | `@anthropic-ai/claude-code` | [npm 官方 registry 元数据](https://registry.npmjs.org/@anthropic-ai/claude-code/latest) |
| npm `bin` | `claude -> bin/claude.exe` | [2.1.228 包元数据](https://registry.npmjs.org/@anthropic-ai/claude-code/2.1.228) |
| Homebrew stable cask | `claude-code` | [固定版本 cask](https://github.com/Homebrew/homebrew-cask/blob/f9522ad280b01b495bf3da24af5aad2fea6a20b0/Casks/c/claude-code.rb) |
| Homebrew latest cask | `claude-code@latest` | [固定版本 cask](https://github.com/Homebrew/homebrew-cask/blob/957c37fc9809dac672cd5a4a95aedd1bbd4b81a1/Casks/c/claude-code%40latest.rb) |
| WinGet package ID | `Anthropic.ClaudeCode` | [官方安装文档](https://code.claude.com/docs/en/installation#install-claude-code) |
| apt/dnf/apk 包名 | `claude-code` | [官方 Linux 包管理器文档](https://code.claude.com/docs/en/installation#install-with-linux-package-managers) |

截至研究日，Anthropic native `latest`、npm `latest` 和 Homebrew
`claude-code@latest` 都指向 `2.1.228`，native `stable` 与 Homebrew
`claude-code` 指向 `2.1.221`。这只是当日快照，不应编码成常量；两个通道本来就
允许不同步。官方把 stable 定义为通常滞后一周并跳过重大回归版本。
[来源：native `latest`](https://downloads.claude.ai/claude-code-releases/latest)、
[native `stable`](https://downloads.claude.ai/claude-code-releases/stable)、
[npm `latest`](https://registry.npmjs.org/@anthropic-ai/claude-code/latest)、
[stable cask](https://github.com/Homebrew/homebrew-cask/blob/f9522ad280b01b495bf3da24af5aad2fea6a20b0/Casks/c/claude-code.rb)、
[latest cask](https://github.com/Homebrew/homebrew-cask/blob/957c37fc9809dac672cd5a4a95aedd1bbd4b81a1/Casks/c/claude-code%40latest.rb)

## 官方安装方式

| 平台/来源 | 官方安装命令 | 后续升级 |
| --- | --- | --- |
| macOS / Linux / WSL native | `curl -fsSL https://claude.ai/install.sh \| bash` | 后台自更新或 `claude update` |
| Windows PowerShell native | `irm https://claude.ai/install.ps1 \| iex` | 后台自更新或 `claude update` |
| Windows CMD native | `curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd` | 后台自更新或 `claude update` |
| Homebrew stable | `brew install --cask claude-code` | `brew upgrade claude-code` |
| Homebrew latest | `brew install --cask claude-code@latest` | `brew upgrade claude-code@latest` |
| WinGet | `winget install Anthropic.ClaudeCode` | `winget upgrade Anthropic.ClaudeCode` |
| apt | 配置 Anthropic signed repo 后 `sudo apt install claude-code` | `sudo apt update && sudo apt upgrade claude-code` |
| dnf | 配置 Anthropic signed repo 后 `sudo dnf install claude-code` | `sudo dnf upgrade claude-code` |
| apk | 配置 Anthropic signed repo 后 `apk add claude-code` | `apk update && apk upgrade claude-code` |
| npm（deprecated） | `npm install -g @anthropic-ai/claude-code` | `npm install -g @anthropic-ai/claude-code@latest` |

来源：官方[安装文档](https://code.claude.com/docs/en/installation#install-claude-code)、
[Linux 包管理器文档](https://code.claude.com/docs/en/installation#install-with-linux-package-managers)和
[npm 文档](https://code.claude.com/docs/en/installation#install-with-npm)。

### native 安装器的实际行为

对 2026-08-12 返回内容的直接核对显示，三个 bootstrap 安装器都执行同一套核心
流程：

1. 接受 `latest`、`stable` 或具体 `X.Y.Z` 作为目标；默认目标是 `latest`。
2. 先读取 `https://downloads.claude.ai/claude-code-releases/latest`，下载最新版
   bootstrap binary。也就是说，即使最终目标是 stable 或固定版本，执行安装逻辑的
   bootstrap 自身仍取最新版本。
3. 读取该版本的 `manifest.json`，选择当前 OS、CPU、glibc/musl 对应的资产并校验
   SHA-256。
4. 从临时下载目录执行 `claude install [target]`，由 native binary 安装目标版本、
   launcher 和 shell 集成；bootstrap 文件随后被删除。

来源：Anthropic 官方的 [`install.sh`](https://claude.ai/install.sh)、
[`install.ps1`](https://claude.ai/install.ps1)、
[`install.cmd`](https://claude.ai/install.cmd)以及
[2.1.228 发布 manifest](https://downloads.claude.ai/claude-code-releases/2.1.228/manifest.json)。

这些安装器是可变端点。为便于复核，研究日响应的 SHA-256 为：

```text
install.sh   cde4f1702d3b1695f92b73d26888364e17bca476e17f0fd676484c951d36c125
install.ps1  cd17c6b555f761d60373659824bf805e1510538226e4c7028e19d7494937a333
install.cmd  35f8d38d0e96ee078c9ed375c9ce64c84641e7adc6d3970028f53ce7502dbd57
```

POSIX 安装器识别 `darwin-arm64`、`darwin-x64`、`linux-arm64`、
`linux-x64` 以及两个 musl 变体；在 Apple Silicon 上通过 Rosetta 运行 x64 shell 时会
选择原生 arm64 binary。Windows 安装器支持 x64 和 ARM64，并拒绝 32 位进程。
安装器先把 bootstrap 放到 `~/.claude/downloads`，但这只是临时下载区，不适合用作
“已安装” marker。[来源：同上三个官方安装器端点](https://claude.ai/install.sh)

官方发布 manifest 为每个平台提供资产名、大小和 SHA-256；2.1.89 起还提供签名后的
manifest。macOS 和 Windows binary 另有平台代码签名，Linux 应通过 manifest 签名或
系统包仓库签名验证。
[来源：官方 binary integrity 文档](https://code.claude.com/docs/en/installation#binary-integrity-and-code-signing)

### 指定通道或版本

native 安装器支持以下稳定接口：

```text
curl -fsSL https://claude.ai/install.sh | bash -s latest
curl -fsSL https://claude.ai/install.sh | bash -s stable
curl -fsSL https://claude.ai/install.sh | bash -s 2.1.89
```

PowerShell 和 CMD 安装器也接受同样的单个 target。安装时选择的 channel 会成为后续
native 自动更新和 `claude update` 的默认通道。
[来源：官方指定版本文档](https://code.claude.com/docs/en/installation#install-a-specific-version)

当前 `ScriptStep` 不支持向下载后的脚本传参，因此 `ai-cli-manager` 只能安装默认的
`latest`。如果产品只承诺“安装最新版”，无需立即扩展；若后续要提供 stable 或版本
固定，需给脚本步骤增加 `args`，并避免 shell 字符串拼接。

### npm 包实际行为

研究日的 `@anthropic-ai/claude-code@2.1.228` 是一个 native binary wrapper：它用
同版本的 per-platform optional dependency（例如
`@anthropic-ai/claude-code-darwin-arm64`）取得 binary，`postinstall` 再把它链接或
复制到包内 `bin/claude.exe`；Unix 同样使用这个带 `.exe` 后缀的包内文件，npm shim
仍暴露命令 `claude`。安装后的 CLI 不再以 Node.js 进程运行。
[来源：固定版本包元数据](https://registry.npmjs.org/@anthropic-ai/claude-code/2.1.228)、
[固定 tarball](https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.228.tgz)

因此 npm 检测必须保留 package manifest 的 `bin.claude` 解析，不能假定目标名是
`cli.js` 或不带扩展名。安装时也不能使用 `--ignore-scripts` 或 `--omit=optional`，否则
native binary 可能不会落位。
[来源：官方 npm 故障排查](https://code.claude.com/docs/en/troubleshoot-install#native-binary-not-found-after-npm-install)

## 官方更新语义

### `claude update`

官方 CLI reference 将 `claude update` 定义为“更新到最新版”，没有文档化
`--check`、`--force` 或 JSON 输出协议；另有 `claude install [version]` 用于安装或
重装 native binary。
[来源：官方 CLI reference](https://code.claude.com/docs/en/cli-reference)

native 更新的行为是：启动时及运行期间周期检查，后台下载安装，下一次启动生效；
手动 `claude update` 立即执行同一更新。`autoUpdatesChannel` 可选 `latest`（默认）或
`stable`，`minimumVersion` 和组织管理的最大版本约束也会限制更新目标。
[来源：官方更新与通道文档](https://code.claude.com/docs/en/installation#update-claude-code)

手动更新成功时会报告从旧版本到新版本；无需更新时报告当前已是最新版。
`DISABLE_AUTOUPDATER=1` 只关闭后台检查，仍允许 `claude update` 和
`claude install`；`DISABLE_UPDATES=1` 才会阻止包括手动命令在内的所有更新路径。
[来源：官方禁用与手动更新文档](https://code.claude.com/docs/en/installation#disable-auto-updates)

`claude update` 能识别 npm 安装。官方 CHANGELOG 记录了 2.1.153 修复 npm 安装
未遵循配置通道的问题，也记录了 npm 全局目录不可写时的诊断提示。不过，当前安装
文档仍把 npm 的确定性手动升级命令写成
`npm install -g @anthropic-ai/claude-code@latest`；对外部管理器而言，继续显式调用
npm 更容易保持安装归属和可审计性。
[来源：固定提交 CHANGELOG](https://github.com/anthropics/claude-code/blob/681a8be245e7759a405e276b16ae69ea6b75076f/CHANGELOG.md#L1403-L1418)、
[官方 npm 文档](https://code.claude.com/docs/en/installation#install-with-npm)

### 包管理器来源

Homebrew、WinGet、apt、dnf、apk 默认不使用 Claude Code 的 native 后台自更新，
而是沿包管理器更新。Homebrew 两个 cask 分别绑定 stable 和 latest；不能把
`claude-code` 的当前版本拿去和 native `latest` 比较，否则会长期制造“可更新”的
误报。官方 CHANGELOG 也专门记录过 Homebrew 更新提示应按 cask 通道判断。
[来源：官方更新文档](https://code.claude.com/docs/en/installation#update-claude-code)、
[固定提交 CHANGELOG](https://github.com/anthropics/claude-code/blob/681a8be245e7759a405e276b16ae69ea6b75076f/CHANGELOG.md#L2688-L2692)

设置 `CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE=1` 后，Claude Code 可以在后台代为
运行 Homebrew 或 WinGet 的包升级命令；apt、dnf、apk 因需要提权，仍要求手动包
管理器更新。`ai-cli-manager` 不应依赖这一可选环境变量，显式生成包管理器计划更
可控。[来源：官方包管理器自动更新说明](https://code.claude.com/docs/en/installation#auto-updates)

### 最新版本权威接口

| 来源/通道 | 应使用的接口 | 响应 |
| --- | --- | --- |
| native latest | `https://downloads.claude.ai/claude-code-releases/latest` | 纯 semver 文本 |
| native stable | `https://downloads.claude.ai/claude-code-releases/stable` | 纯 semver 文本 |
| npm | `npm view @anthropic-ai/claude-code dist-tags.latest --json` 或 registry `latest` | npm dist-tag / JSON `version` |
| Homebrew stable | `brew info --json=v2 --cask claude-code` | cask `version` |
| Homebrew latest | `brew info --json=v2 --cask claude-code@latest` | cask `version` |
| WinGet | `winget show --id Anthropic.ClaudeCode --exact` | WinGet 包元数据 |
| apt/dnf/apk | 各自已配置仓库的 candidate 版本 | 包管理器元数据 |

native 的两个文本端点由官方安装器直接使用；npm registry 和 Homebrew cask 则是各
安装来源自身的权威版本，不应假定它们在任意时刻相等。
[来源：官方安装器](https://claude.ai/install.sh)、
[npm registry](https://registry.npmjs.org/@anthropic-ai/claude-code/latest)、
[Homebrew stable cask](https://github.com/Homebrew/homebrew-cask/blob/f9522ad280b01b495bf3da24af5aad2fea6a20b0/Casks/c/claude-code.rb)、
[Homebrew latest cask](https://github.com/Homebrew/homebrew-cask/blob/957c37fc9809dac672cd5a4a95aedd1bbd4b81a1/Casks/c/claude-code%40latest.rb)

## 安装路径与 detector marker

官方 native 安装的稳定路径是：

| 平台 | launcher | 版本存储 |
| --- | --- | --- |
| macOS / Linux / WSL | `~/.local/bin/claude` | `~/.local/share/claude/versions/<version>` |
| Windows | `%USERPROFILE%\.local\bin\claude.exe` | `%USERPROFILE%\.local\share\claude` |

在 macOS/Linux 上，正常 launcher 是指向 `versions/<version>` 的符号链接。自
2.1.207 起，如果用户自己替换了 launcher，更新器会保留它，只在 versions 目录安装
新版本。[来源：官方更新说明](https://code.claude.com/docs/en/installation#auto-updates)、
[官方 PATH 排查](https://code.claude.com/docs/en/troubleshoot-install#verify-your-path)、
[官方卸载说明](https://code.claude.com/docs/en/installation#native-installation)

当前 catalog 只设置 `markers: [".local/share/claude"]`。这对 PATH 中的 POSIX native
symlink 能通过 `realpath` 命中，但存在两个缺口：

1. `officialMarkerExists` 只接受“可执行的普通文件”，`~/.local/share/claude` 是
   目录，所以 native 安装不在 PATH 时无法靠该 marker 被发现。
2. Windows 的 launcher 位于 `~/.local/bin/claude.exe`，其路径本身不包含
   `.local/share/claude`，会落成 `unknown`。

建议把 `~/.local/bin/claude` / `claude.exe` 建模为平台相关的 launcher marker，
并把版本目录另建成 directory marker，而不是复用当前“必须可执行”的 marker 字段。
活跃来源仍应由 PATH 第一项及其 realpath 决定；仅存在目录时只能给 medium confidence，
不能声称它是当前生效实例。

`~/.claude/downloads` 只是 bootstrap 临时区，`~/.claude` 也会被所有安装方式用于
设置和会话，二者都不能证明 native 来源。Homebrew 应继续通过 cask inventory 和
Caskroom prefix 判断，npm 应继续通过全局 package root、`bin.claude` 与 shim 判断。

## 平台与运行时要求

native 发行物当前支持：

- macOS 13.0+；
- Windows 10 1809+ 或 Windows Server 2019+；
- Ubuntu 20.04+、Debian 10+、Alpine 3.19+；
- x64 或 ARM64、至少 4 GB RAM，并需要网络连接。

Alpine 和其他 musl/uClibc 系统的安装命令需要 `bash` 与 `curl`，运行时还需
`libgcc`、`libstdc++` 和 `ripgrep`，并设置 `USE_BUILTIN_RIPGREP=0`。Windows native
现在可以直接使用 PowerShell；Git for Windows 是可选项，用于提供 Bash tool。
[来源：官方系统要求与 Alpine 说明](https://code.claude.com/docs/en/installation#system-requirements)

npm 包从 2.1.198 起声明 Node.js `>=22`；Node 只参与 npm 安装和 postinstall，最终
CLI 是 native binary。旧 Node 可能只让 npm 发出 `EBADENGINE` 警告而未阻止安装，
但集成层应按声明要求把 Node 22+ 视为可用性条件。
[来源：官方 npm 文档](https://code.claude.com/docs/en/installation#install-with-npm)、
[当前 npm 包元数据](https://registry.npmjs.org/@anthropic-ai/claude-code/latest)

## legacy 安装与迁移

Claude Code 曾使用 `~/.claude/local/` 保存旧的 local npm 安装；当前官方故障排查
把它明确列为 legacy，并建议在发现多份安装时只保留一个。当前推荐 native 安装在
`~/.local/bin/claude` 和 `~/.local/share/claude`。
[来源：官方冲突安装排查](https://code.claude.com/docs/en/troubleshoot-install#check-for-conflicting-installations)

当前官方仓库从 2.1.15 开始向 npm 安装显示弃用提示，迁移入口是 `claude install`；
当前 CLI reference 也只记录 `claude install [version]`，未记录旧文档曾出现的
`migrate-installer`。新实现不应再生成 `claude migrate-installer`。
[来源：固定提交 CHANGELOG](https://github.com/anthropics/claude-code/blob/681a8be245e7759a405e276b16ae69ea6b75076f/CHANGELOG.md#L3973-L3977)、
[当前 CLI reference](https://code.claude.com/docs/en/cli-reference)

迁移不应被普通 update 隐式执行。更安全的产品行为是：检测 PATH 中的
`~/.claude/local/` 为 legacy；提示用户运行 `claude install latest` 建立 native
安装，再确认 PATH 已切换后卸载 npm/legacy 副本。因为官方也警告多份安装会造成版本
错配，`ai-cli-manager` 应继续拒绝自动迁移和删除旧目录。

当前 `legacyNpmPackages` 只能表达“旧包名”，不能表达“相同工具的旧目录布局”。若要
把这一情形从 `unknown` 提升为可行动的 legacy 状态，需要增加 `legacyMarkers` 或更
通用的 detection rules。

## 对 ai-cli-manager 的具体集成影响

### `ToolDefinition` 与 catalog

当前 Claude 定义中以下字段正确，可以保留：

```ts
command: "claude"
versionArgs: ["--version"]
npmPackage: "@anthropic-ai/claude-code"
homebrew: { name: "claude-code", kind: "cask" }
homebrewAlternatives: [{ name: "claude-code@latest", kind: "cask" }]
official.unixUrl: "https://claude.ai/install.sh"
official.windowsUrl: "https://claude.ai/install.ps1"
official.updateArgs: ["update"]
official.latestUrls: ["https://downloads.claude.ai/claude-code-releases/latest"]
```

需要扩展的能力：

1. 把 native channel 纳入安装定义或安装实例；至少支持 `latest` 与 `stable`，否则
   pre-existing stable native 安装会被拿去和 latest 比较。
2. marker 区分 executable launcher、directory 和平台路径；Windows 需要
   `.local/bin/claude.exe`。
3. 如果目标是完整覆盖官方来源，`Source` 需要 `winget`、`apt`、`dnf`、`apk`，或
   抽象成一个带 manager 字段的 `systemPackage` 来源。若第一版不扩范围，应明确把
   这些实例报告为“已知但不受支持”，而不是普通 `unknown`。
4. 若支持 stable/固定版本安装，`ScriptStep` 需要参数；只支持 latest 时不必增加。
5. 增加 `legacyMarkers: [".claude/local"]` 一类的检测规则，不能把目录硬塞入现有
   executable markers。

### detector

- npm：当前执行 `npm root -g`、读取包 manifest 和 `bin.claude` 的方案仍正确；
  最新版继续使用 npm dist-tag。
- Homebrew：必须保留 active `packageName`，分别查询 stable 与 latest cask。当前
  alternative cask 设计已经满足这一点。
- native：PATH 候选为 `~/.local/bin/claude`（Windows 为 `.exe`）且 realpath 指向
  `~/.local/share/claude/versions/` 时可给 high confidence。
- native channel：若不读取 `~/.claude/settings.json`，只能知道默认安装器装的是
  latest，无法可靠断言既有安装的通道。读取设置又涉及用户配置兼容与 managed
  settings 合并，建议先把 channel 标为 `unknown`，获取最新版时避免直接断言
  update_available；或者委托只读的官方诊断能力，但 `claude update` 本身不是只读
  检查命令。
- legacy：PATH 指向 `~/.claude/local/` 时标为 legacy，禁止普通 update 计划。

### plan

建议保留来源分派：

| active source | 安装/更新计划 |
| --- | --- |
| native official | 安装器；更新用 active path 执行 `claude update` |
| npm | `npm install -g @anthropic-ai/claude-code@latest` |
| Homebrew stable | `brew upgrade --cask claude-code` |
| Homebrew latest | `brew upgrade --cask claude-code@latest` |
| WinGet（若支持） | `winget upgrade --id Anthropic.ClaudeCode --exact` |
| apt/dnf/apk（若支持） | 各包管理器的单包升级命令，必要提权必须由用户确认 |

不要对 Homebrew/WinGet/Linux 包来源统一执行 native 覆盖式安装。不要把
`claude update` 当作 `--check` 使用；官方没有承诺只读检查参数。native 更新应继续
使用当前 PATH 中 active instance 的绝对路径，避免同机多份安装时更新错对象。

### 建议的实现优先级

1. 修复 Claude native launcher/directory marker，补 Windows 检测测试。
2. 为 native latest/stable 建模，消除 stable 安装的假更新提示。
3. 增加 `~/.claude/local` legacy 检测与明确迁移提示。
4. 决定产品范围是否覆盖 WinGet 与 apt/dnf/apk；若覆盖，应先泛化 Source 和
   ToolDefinition，而不是为 Claude 写 detector 特例。
5. 保留当前按来源生成更新命令的 plan；npm 虽然 deprecated，仍需检测与安全更新，
   但新安装 UI 应把 native 放在首选位置并标注 npm 已弃用。

## 未能从一手资料确认的事项

- Anthropic 未公开 native updater 的完整源码，无法独立审计 `claude update` 内部的
  下载原子性、锁、失败回滚和所有来源分派细节。
- 当前文档没有稳定的机器可读命令用于“只检查 native 更新且不写入”；
  `claude update` 是安装命令，不能用于 detector 的只读阶段。
- 官方文档没有为第三方管理器提供一个直接输出“当前安装来源 + 当前 channel”的
  JSON 协议；`claude doctor` 是只读诊断，但其文本输出未被声明为稳定 API。
- 公开资料没有保证 native、npm、Homebrew、WinGet 与 Linux 仓库在发布时间上同步；
  实现必须按 active source 分别获取 candidate 版本。

## 实际查阅的一手来源

- Anthropic [Advanced setup / installation](https://code.claude.com/docs/en/installation)
- Anthropic [CLI reference](https://code.claude.com/docs/en/cli-reference)
- Anthropic [安装与登录故障排查](https://code.claude.com/docs/en/troubleshoot-install)
- Anthropic 官方 [`install.sh`](https://claude.ai/install.sh)、
  [`install.ps1`](https://claude.ai/install.ps1)、[`install.cmd`](https://claude.ai/install.cmd)
- Anthropic [native `latest`](https://downloads.claude.ai/claude-code-releases/latest)、
  [native `stable`](https://downloads.claude.ai/claude-code-releases/stable)及
  [发布 manifest](https://downloads.claude.ai/claude-code-releases/2.1.228/manifest.json)
- npm 官方 registry 的
  [`@anthropic-ai/claude-code@latest`](https://registry.npmjs.org/@anthropic-ai/claude-code/latest)、
  [2.1.228 元数据](https://registry.npmjs.org/@anthropic-ai/claude-code/2.1.228)和
  [2.1.228 tarball](https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.228.tgz)
- Anthropic 官方仓库固定提交的
  [README](https://github.com/anthropics/claude-code/blob/b640d94a49629ef004ecceb5e2bd6d8aebf067ce/README.md)与
  [CHANGELOG](https://github.com/anthropics/claude-code/blob/681a8be245e7759a405e276b16ae69ea6b75076f/CHANGELOG.md)
- Homebrew 官方仓库固定提交的
  [`claude-code`](https://github.com/Homebrew/homebrew-cask/blob/f9522ad280b01b495bf3da24af5aad2fea6a20b0/Casks/c/claude-code.rb)与
  [`claude-code@latest`](https://github.com/Homebrew/homebrew-cask/blob/957c37fc9809dac672cd5a4a95aedd1bbd4b81a1/Casks/c/claude-code%40latest.rb) cask
