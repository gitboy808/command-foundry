# Codex CLI 安装与更新机制调研

> 调研日期：2026-08-12（Asia/Shanghai）  
> 调研对象：OpenAI Codex CLI 0.147.0；发布提交 `be6e8eac029b183056b7e4402879f15d2c85f61b`  
> 调研方法：只使用 OpenAI 官方文档、`openai/codex` 官方仓库与发布产物、OpenAI npm 包、Homebrew 官方 cask/API。源码链接固定到上述发布提交；Homebrew 链接固定到 cask 0.147.0 的提交。

## 结论摘要

1. Codex CLI 的命令名为 `codex`，npm 包名为 `@openai/codex`，Homebrew 当前是名为 `codex` 的 **cask**。`codex --version` 的稳定输出形态是 `codex-cli <semver>`；本次只读核验得到 `codex-cli 0.147.0`。Rust crate 名、二进制名和 Clap 的版本参数定义共同决定了该输出。[CLI crate 与二进制定义](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-rs/cli/Cargo.toml#L1-L13)、[Clap 版本定义](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-rs/cli/src/main.rs#L92-L106)
2. 官方当前提供 macOS/Linux shell standalone 安装器、Windows PowerShell standalone 安装器、npm、Homebrew cask，以及手动下载发布二进制；官方 README 没把 Bun/pnpm 列作安装入口，但 CLI 的更新源码能识别通过 Bun/pnpm 全局安装的 `@openai/codex`。[官方安装入口](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/README.md#L14-L64)、[Bun/pnpm 更新分派](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-rs/tui/src/update_action.rs#L8-L64)
3. **`codex update` 在 0.147.0 的正式发布版中确实存在。**它没有 `--check`、`--force`、目标版本等更新专属参数；它直接识别运行中的安装来源并执行对应包管理器或 standalone 安装器。debug build 明确禁用，无法识别来源时要求手动更新。[子命令定义](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-rs/cli/src/main.rs#L124-L165)、[执行与失败语义](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-rs/cli/src/main.rs#L779-L839)
4. `chatgpt.com/codex/install.sh` 与 `install.ps1` 仍是官方、有效的稳定入口。2026-08-12 实测它们分别 302 到 `https://releases.openai.com/codex/install.sh` 和 `install.ps1`；下载内容 SHA-256 与 0.147.0 发布提交内脚本完全一致：shell 为 `ba92dd27e5c06f0d3bbc58bfa4b9cfb6599cd2742fbb1f92a2765e6c07dedb5a`，PowerShell 为 `391f247de2c70c7e99041979ec02dae7e76be27ac9cfc1dfe7c1eb21d48d8b97`。官方 README 也仍明确推荐这两个入口。[官方 README](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/README.md#L16-L35)、[shell 入口](https://chatgpt.com/codex/install.sh)、[PowerShell 入口](https://chatgpt.com/codex/install.ps1)
5. 对 `ai-cli-manager` 最紧急的修正不是 URL，而是重定向白名单：当前 catalog 允许 `chatgpt.com`，但没有 `releases.openai.com`；runner 会检查最终响应域名，因此当前官方 Codex 安装会被安全检查拒绝。应将 `releases.openai.com` 加入 `scriptHosts`。

## 命令、包名与版本

| 项目 | 当前值 | 一手依据 |
| --- | --- | --- |
| 可执行命令 | `codex` | npm manifest 把 `codex` 映射到 `bin/codex.js`；Rust binary 也名为 `codex`。[npm manifest](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-cli/package.json#L1-L15) |
| npm 包 | `@openai/codex` | [官方 npm 包](https://www.npmjs.com/package/@openai/codex)、[官方 README](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/README.md#L38-L48) |
| Homebrew | cask `codex` | cask 同时声明 macOS 和 Linux 架构产物，并链接 `bin/codex`。[固定 cask](https://github.com/Homebrew/homebrew-cask/blob/f89042a5da74faf0463b86cd7128e19ec0423545/Casks/c/codex.rb#L1-L25) |
| 版本命令 | `codex --version` | CLI 使用 Clap 自动版本参数；官方安装器也用该命令读取和验证版本。[CLI 定义](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-rs/cli/src/main.rs#L92-L106)、[安装器解析](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.sh#L769-L792) |
| 输出格式 | `codex-cli 0.147.0`（形态为 `codex-cli <semver>`） | crate 名是 `codex-cli`，版本由 workspace 注入；安装器从输出末尾提取版本。[crate 定义](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-rs/cli/Cargo.toml#L1-L13) |

安装器接受 `latest`、`x.y.z`，以及受限的 `-alpha` / `-beta` 版本格式；同时会去掉 `rust-v` 或 `v` 前缀。[版本归一化与校验](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.sh#L41-L69)

## 官方安装来源

### Standalone（官方优先入口）

macOS / Linux：

```sh
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

Windows：

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
```

以上命令来自官方 README；同一 README 说明安装器默认从 `releases.openai.com/codex` 获取元数据和产物，不可用时回退 GitHub Releases。[官方安装说明](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/README.md#L14-L35)

### npm

```sh
npm install -g @openai/codex
```

npm 包只是 JS 启动器加平台专用可选依赖；启动器根据 OS/CPU 选择六种原生包：macOS、Linux、Windows × x64/arm64，然后启动原生二进制。[平台包映射和启动逻辑](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-cli/bin/codex.js#L16-L110)

### Homebrew

```sh
brew install --cask codex
```

当前 cask 同时包含 macOS 与 Linux 的 x64/arm64 产物，因此不能把 Homebrew 支持误写成仅 macOS；Windows 不支持 Homebrew。[官方 README](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/README.md#L38-L48)、[Homebrew cask](https://github.com/Homebrew/homebrew-cask/blob/f89042a5da74faf0463b86cd7128e19ec0423545/Casks/c/codex.rb#L1-L23)

### Bun、pnpm 与手动二进制

官方 README 没有把 Bun/pnpm 列为推荐安装命令，但 npm 启动器会识别 Bun/pnpm 布局并给原生 CLI 设置 `CODEX_MANAGED_BY_BUN` 或 `CODEX_MANAGED_BY_PNPM`；`codex update` 随后会沿该来源更新。因此它们是源码支持的包管理器来源，而非当前文档中的主要安装入口。[包管理器识别与环境标记](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-cli/bin/codex.js#L118-L195)

官方 README 还允许从 GitHub Release 手动下载 macOS/Linux 二进制并重命名为 `codex`。[手动下载说明](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/README.md#L52-L64) 当前发布中也存在 Windows x64/arm64 产物，但 README 的手动下载折叠区没有列出 Windows；对这种任意路径的手动二进制，内置更新来源通常会归类为 `Other`，不会擅自更新。[来源枚举](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-rs/install-context/src/lib.rs#L48-L81)

## Standalone 安装器行为

### macOS / Linux

- 默认可见命令为 `$HOME/.local/bin/codex`；受管根目录为 `${CODEX_HOME:-$HOME/.codex}/packages/standalone`，版本目录在 `releases/`，`current` 是指向当前版本目录的符号链接。`CODEX_INSTALL_DIR` 可覆盖可见命令目录。[默认路径](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.sh#L5-L24)
- 只支持 macOS/Linux 的 x86_64 和 arm64；Apple Silicon 上通过 Rosetta 运行时会改选 arm64。Linux 下载 musl 目标。[平台与架构映射](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.sh#L1070-L1125)
- `latest` 默认先读取 `https://releases.openai.com/codex/channels/latest`，失败则读取 `https://api.github.com/repos/openai/codex/releases/latest`；具体版本使用对应 release metadata。[版本解析与回退](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.sh#L306-L419)
- 下载 `codex-package-<target>.tar.gz` 和校验清单，验证发布元数据中的 SHA-256、清单自身和包摘要；`sha256sum`、`shasum`、`openssl` 三者均缺失时会失败。[产物选择与校验](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.sh#L421-L554)
- 使用安装锁、临时 staging 目录和切换 `current` 链接完成更新；安装后再次运行 `--version` 验证。它会为 shell profile 添加带标记的 PATH 区块。[安装与切换](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.sh#L935-L1066)、[主流程](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.sh#L1127-L1209)
- 如果发现另一个 Homebrew/npm/Bun 管理的 `codex`，交互模式会询问是否卸载；`CODEX_NON_INTERACTIVE=1` 时不卸载，并警告 PATH 顺序决定实际运行实例。[冲突迁移行为](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.sh#L795-L933)

脚本运行依赖 POSIX `sh`、`mktemp`、`tar`、`curl` 或 `wget`，以及上述任一 SHA-256 工具；standalone 本体不依赖 Node.js。[依赖检查](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.sh#L103-L162)、[主流程预检](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.sh#L1068-L1084)

### Windows

- 只接受 64 位 Windows，架构为 x64 或 arm64；安装目标分别是 `x86_64-pc-windows-msvc` 和 `aarch64-pc-windows-msvc`。[平台检查](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.ps1#L870-L899)
- 受管根目录同样是 `${CODEX_HOME:-%USERPROFILE%\.codex}\packages\standalone`；默认可见目录是 `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin`，`CODEX_INSTALL_DIR` 可覆盖。[Windows 默认路径](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.ps1#L901-L923)
- 使用 junction 指向 `current` 和其 `bin`，验证后更新用户 PATH；旧版可见目录布局会先征得同意、备份，再迁移。[Windows 安装与 PATH](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.ps1#L1003-L1088)

## `codex update` 的准确语义

`codex update` 是一个无专属参数的 unit subcommand。它不会只显示检查结果，也没有 `--check`、`--force`、`--plugins` 或版本选择；执行成功后要求重启 Codex。正式构建按以下映射直接运行命令：[完整更新动作源码](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-rs/tui/src/update_action.rs#L8-L77)

| 检测来源 | 实际命令 |
| --- | --- |
| npm | `npm install -g @openai/codex`（未写 `@latest`，包管理器默认使用 latest dist-tag） |
| Bun | `bun install -g @openai/codex` |
| pnpm | `pnpm add -g @openai/codex` |
| Homebrew | `brew upgrade --cask codex` |
| Unix standalone | `sh -c 'curl -fsSL https://chatgpt.com/codex/install.sh \| CODEX_NON_INTERACTIVE=1 sh'` |
| Windows standalone | PowerShell 设置 `CODEX_NON_INTERACTIVE=1` 后重新执行 `install.ps1` |
| `Other` / 无法识别 | 失败并提示手动更新 |

来源识别不是扫描所有包管理器清单：

- npm/Bun/pnpm 由 JS shim 设置的 `CODEX_MANAGED_BY_*` 环境变量覆盖识别；[安装上下文](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-rs/install-context/src/lib.rs#L83-L137)
- standalone 要求当前真实可执行文件位于 `${CODEX_HOME}/packages/standalone/releases` 下；[standalone 识别](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-rs/install-context/src/lib.rs#L291-L316)
- Homebrew 的路径识别当前只在 macOS 生效，并只检查 `/opt/homebrew` 或 `/usr/local`。因此虽然官方 cask 提供 Linux 产物，**Linuxbrew 安装运行 `codex update` 可能归类为 `Other`**；外部管理器应继续根据 `brew info` 和真实 prefix 自己生成 `brew upgrade --cask codex`，不要无条件委托内置命令。[Homebrew 识别条件](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-rs/install-context/src/lib.rs#L273-L289)

## 最新版本的权威接口

不同来源应优先读取各自管理器的版本，而不是假定所有渠道永远同步：

| 来源 | 首选接口 | 2026-08-12 结果 |
| --- | --- | --- |
| standalone | [`https://releases.openai.com/codex/channels/latest`](https://releases.openai.com/codex/channels/latest)，失败回退 [GitHub latest release API](https://api.github.com/repos/openai/codex/releases/latest) | `rust-v0.147.0` |
| npm / Bun / pnpm | [`@openai/codex` npm latest metadata](https://registry.npmjs.org/@openai%2fcodex/latest) 或 `npm view @openai/codex dist-tags.latest` | `0.147.0` |
| Homebrew | [Homebrew cask API](https://formulae.brew.sh/api/cask/codex.json) 或 `brew info --json=v2 --cask codex` | `0.147.0` |

OpenAI 自己的安装器明确把 `releases.openai.com` 设为 standalone 主渠道，并把 GitHub Releases 作为回退；所以当前 `latestUrls` 只写 GitHub API虽可工作，但没有反映官方优先级。[安装器发布源逻辑](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.sh#L5-L13)、[解析顺序](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.sh#L374-L419)

## 默认路径、marker 与检测建议

默认 standalone 布局为：

```text
Unix:
  ~/.local/bin/codex
    -> ~/.codex/packages/standalone/current/bin/codex
    -> ~/.codex/packages/standalone/releases/<version>-<target>/bin/codex

Windows:
  %LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe
    => %USERPROFILE%\.codex\packages\standalone\current\bin\codex.exe
    => ...\releases\<version>-<target>\bin\codex.exe
```

旧 standalone 发布布局允许 `current/codex`（Windows 为 `codex.exe`），新 package 布局使用 `current/bin/codex`；安装器会同时探测两者。[Unix 兼容探测](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.sh#L779-L792)、[安装上下文中的旧布局说明](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-rs/install-context/src/lib.rs#L54-L67)

`ai-cli-manager` 当前 marker `.codex/packages/standalone` 对“PATH 中的可执行文件 realpath 是否属于 standalone”是正确的；但 detector 的 `officialMarkerExists()` 只接受可执行文件，目录 marker 无法发现“已安装但不在 PATH”的 standalone。建议把模型拆成：

- `pathPrefixes`：默认 `${CODEX_HOME}/packages/standalone/releases`；
- `markerExecutables`：新旧布局、Unix/Windows 各自的 `current/.../codex[.exe]`；
- marker 根目录应读取传入环境中的 `CODEX_HOME`，不能永远只拼 `homedir()`；
- `Installation.path` 应保存可执行文件，不应保存 standalone 目录，以免未来生成更新计划时把目录当程序执行。

## 平台与运行时要求

- npm 包 manifest 声明 Node.js `>=16`；这是 JS shim 的要求，不是 standalone 原生二进制的要求。[npm engines](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-cli/package.json#L6-L15)
- npm shim 支持 Darwin/Linux/Windows 的 x64 与 arm64；其他平台/架构直接报错。[平台选择](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/codex-cli/bin/codex.js#L16-L77)
- 仓库 `docs/install.md` 仍写着 macOS 12+、Ubuntu 20.04+/Debian 10+、Windows 11 via WSL2、4 GB RAM；但当前 README 与官方 PowerShell standalone 安装器又明确支持原生 Windows。这两份官方材料存在时序不一致，不能据此断言原生 Windows 的最低版本。[系统要求页](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/docs/install.md#L1-L13)、[Windows standalone 入口](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/README.md#L22-L28)

## Legacy 与迁移

1. **旧 standalone 包布局**：新安装器优先 `codex-package-<target>.tar.gz`；如果该发布没有新 package 产物，会回退旧 `codex-npm-<platform>-<version>.tgz` 布局，并兼容 `current/codex` 路径。[发布产物回退](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.sh#L463-L494)、[旧布局安装](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.sh#L959-L1023)
2. **旧 Windows standalone 可见目录**：安装器识别旧的普通目录布局，取得用户确认后移到备份位置，再建立 junction；失败会恢复备份。[Windows 迁移主流程](https://github.com/openai/codex/blob/be6e8eac029b183056b7e4402879f15d2c85f61b/scripts/install/install.ps1#L1013-L1038)
3. **切换到 standalone**：安装器会发现 npm/Bun/Homebrew 冲突并询问是否卸载；非交互模式不会自动迁移来源。这与本项目“不自动迁移未知/旧来源”的安全原则一致。
4. **Homebrew formula → cask**：Homebrew 已删除旧 formula，并把 `codex` 迁移到 `homebrew/cask`；当前定义是 cask `codex`。[删除 formula 的官方提交](https://github.com/Homebrew/homebrew-core/commit/2de6c8ff614d0227e42e8d0b091375a3fd7572b5)、[tap migration 官方提交](https://github.com/Homebrew/homebrew-core/commit/d820286b0b551c542b0f4b71942c927668222cbf)、[当前 cask](https://github.com/Homebrew/homebrew-cask/blob/f89042a5da74faf0463b86cd7128e19ec0423545/Casks/c/codex.rb#L1-L25) 旧 formula 也叫 `codex`，仅靠 `packageName` 无法区分；建议在 catalog 把 `legacyHomebrewPackages: ["codex"]` 用于只读 formula 探测并标记 legacy，禁止自动把旧 formula 当作当前 cask 更新。若同时支持同名 formula/cask，`Installation` 最好保留 `HomebrewKind`，否则 plan 按名称查找会错误选中主 cask。
5. 未发现官方当前要求从另一个 npm 包名迁移到 `@openai/codex`，因此不应凭空添加 `legacyNpmPackages`。

## 对 `ai-cli-manager` 的具体集成影响

### `ToolDefinition` / catalog

- 保留：`command: "codex"`、`versionArgs: ["--version"]`、`npmPackage: "@openai/codex"`、Homebrew cask `codex`、两个 `chatgpt.com` 安装 URL、`updateArgs: ["update"]`。
- **必须修正**：`scriptHosts` 加入 `releases.openai.com`。2026-08-12 的稳定入口最终落到该域名，当前白名单会拒绝。
- 建议：standalone `latestUrls` 顺序改为 `releases.openai.com/codex/channels/latest` 在前、GitHub API 在后；现有 `tag_name` 解析可复用。
- 建议：显式检测同名旧 Homebrew formula，并保留 `kind` 证据，避免从 formula 静默迁移到 cask。
- 若项目希望完整识别 Codex 的包管理器安装，应将 `Source` 扩展为至少 `bun`、`pnpm`；否则这些实例会落入 `unknown`。这也支持把来源能力从“每个工具强制三来源”改成可选能力集合。

### detector

- npm 和 Homebrew 的 manager inventory 方式仍比仅信任 `codex update` 的内部启发式更适合外部管理器，尤其 Linuxbrew。
- standalone 应把“真实路径前缀”和“存在性 marker”分开，并尊重 `CODEX_HOME`。
- 当前 PATH realpath 落在 `.codex/packages/standalone/releases/...` 时，现有目录 marker 能正确识别 active standalone；不要简单把它替换成 `current/bin/codex` 字符串，否则 realpath 反而匹配不到。
- Bun/pnpm 不能仅靠 npm 全局 root 检测，需要独立 inventory 或可信 shim/layout 证据。

### plan

- 当前按来源生成 npm/Homebrew 命令，而仅对 `official` 调 `codex update`，是合理且可预测的：这些命令与上游 `codex update` 的分派结果一致。
- 不建议对 `unknown` 无条件执行 `codex update`；上游自身对 `Other` 也拒绝更新。
- 若增加 Bun/pnpm source，可直接分别生成 `bun install -g @openai/codex@latest`、`pnpm add -g @openai/codex@latest`；也可以在来源已高置信度时委托 `codex update`，但前者更容易展示和审计。
- standalone update 使用当前 active 可执行文件运行 `codex update` 没问题；它会以非交互方式重跑官方安装器。runner 的 10 分钟超时和输出上限也适合这一流程。

## 对现有两项假设的判定

| 假设 | 判定 | 说明 |
| --- | --- | --- |
| `codex update` 是有效更新命令 | **成立，但原先描述不完整** | 0.147.0 正式版存在，并能分派 npm、Bun、pnpm、Homebrew cask、Unix/Windows standalone；不是只用于 standalone。无更新专属参数，未知来源拒绝。 |
| `https://chatgpt.com/codex/install.{sh,ps1}` 是官方入口 | **成立** | 官方 README 仍推荐；当前重定向到 `releases.openai.com`，内容与发布提交脚本完全一致。catalog URL 可保留，但域名白名单必须补 `releases.openai.com`。 |

## 未确认与时效性事项

- 原生 Windows 的最低受支持版本：PowerShell 安装器只检查 Windows、64 位及 x64/arm64，没有声明最低 Windows 版本；仓库系统要求页仍写 WSL2，与当前原生安装入口冲突。
- Bun/pnpm 虽被发布源码的更新器明确支持，但未出现在官方 README 的推荐安装列表；产品文案宜称“可识别来源”，不要称“官方推荐安装方式”。
- 各渠道版本可能短暂不同步。本文记录 2026-08-12 三个主要接口均为 0.147.0，实际检测仍应逐来源查询。
- `chatgpt.com` 的重定向目标属于可变部署状态；白名单和集成测试应验证最终响应域名，而不应只断言初始 URL。
