# Grok Build（grok）安装与更新机制研究

研究日期：2026-08-19  
官方站点：[x.ai/cli](https://x.ai/cli)（产品页）、[docs.x.ai/build/overview](https://docs.x.ai/build/overview)（官方文档）  
上游仓库：[`xai-org/grok-build`](https://github.com/xai-org/grok-build)  
源码核对提交：[`d92c5b0b`](https://github.com/xai-org/grok-build/tree/d92c5b0b8582fda358de1f97446aa74af44a464f)（main @ 2026-08-19T00:29:49Z；crate 版本 `1.0.5`，与研究日 stable 渠道指针一致）

## 结论摘要

「gork build」应为 **Grok Build** 的误写——这是 xAI 官方的终端 AI 编码助手，CLI 命令名
是 **`grok`**，Rust 单二进制（产物名 `xai-grok-pager`，官方安装物命名为 `grok`，脚本
安装还附带别名 `agent`）。一手来源中没有名为「gork」的产品。

官方安装路径有两条（官方 README 并列记载）：

1. 安装脚本：`curl -fsSL https://x.ai/cli/install.sh | bash`（macOS/Linux/Git Bash）、
   `irm https://x.ai/cli/install.ps1 | iex`（Windows PowerShell）。无 Node.js 依赖。
2. npm：`npm i -g @xai-official/grok`（官方包，要求 Node.js `>=20`，依赖 postinstall
   解压平台二进制，**不能**加 `--ignore-scripts`）。

`grok update` 是**真实自更新命令**（与 mmx 只打印指引的占位实现本质不同）：脚本安装的
副本直接从 CDN 下载新二进制并原子切换符号链接；npm 安装的副本转而执行
`npm i -g @xai-official/grok@<解析后的版本>`。另有 `grok update --check` 只检查不安装。
注意：后台自动更新**默认开启**（启动时检查并安装更新），版本可能在管理器两次操作之间
自行漂移。

**没有原生卸载命令，官方文档与仓库也无任何卸载章节**；卸载只能按安装方式推断手动删除
（详见「卸载」一节，均为推断、无官方背书）。用户数据与安装物同根于 `~/.grok/`，卸载时
**严禁**整目录删除 `~/.grok`。

npm 上存在多个**第三方** grok 相关包，均与 xAI 无关，接入时切勿混用：

| 包 | 性质 | 依据 |
| --- | --- | --- |
| `@xai-official/grok` | **官方** | maintainer 为 `xai-security`（security@x.ai）；官方仓库内 [`npm/grok/package.json`](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager/npm/grok/package.json) 即为该包的打包模板；官方源码的 npm 重装指引写作 `npm i -g @xai-official/grok` |
| `grok-cli` | 第三方 | maintainer 为个人账号 `tomasmcm`（whitesmith.co），仓库 `whitesmith/grok-cli`，`bin` 把 `grok` 映射到 `bin/codex.js`（Codex 衍生），创建于 2025-07-11 |
| `grok-dev` | 第三方 | 仓库 `superagent-ai/grok-cli`，其 README 自带免责声明「not affiliated with, endorsed by, or sponsored by xAI Corp.」 |
| `grok` | 第三方（无关） | 2013 年起步的老 Node 框架（maintainer `azulus`），与 AI 无关 |

来源：npm 官方 registry [`@xai-official/grok`](https://registry.npmjs.org/@xai-official/grok)、
[`grok-cli`](https://registry.npmjs.org/grok-cli)、[`grok`](https://registry.npmjs.org/grok)，
固定提交的 [`auto_update.rs` L78](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-update/src/auto_update.rs#L78)、
[`superagent-ai/grok-cli` README](https://github.com/superagent-ai/grok-cli)（社区仓库，其自我声明与 npm metadata 互证）。

## 身份、命令、版本与 canonical 分发

| 项目 | 当前事实 |
| --- | --- |
| 产品 | Grok Build（官方文档与 CLI 自检输出均用此名；仓库 README 表述为 "SpaceXAI's terminal-based AI coding agent"） |
| 官方站点 | `https://x.ai/cli`（产品页）、`https://docs.x.ai/build/overview`（文档）、`https://x.ai/build/changelog`（更新日志，README 引用） |
| 官方仓库 | `https://github.com/xai-org/grok-build`（从 SpaceXAI monorepo 周期性同步，Apache-2.0） |
| 分发 1 | 安装脚本 `https://x.ai/cli/install.sh` / `install.ps1`（下载预编译二进制） |
| 分发 2 | npm `@xai-official/grok`（latest `1.0.5`，创建于 2025-10-22；另有 `alpha` dist-tag） |
| CLI 命令 | `grok`（脚本安装另链接 `agent` 别名） |
| 版本命令 | `grok --version` / `-v` / `grok version`，输出形如 `grok 1.0.5 (abc1234) [stable]` |
| 数据/安装根 | `~/.grok/`（`GROK_HOME` 可改；脚本安装目录可用 `GROK_BIN_DIR` 改） |
| 许可证 | Apache-2.0 |

来源：固定提交的
[README](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/README.md)、
[`xai-grok-pager-bin/Cargo.toml`](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager-bin/Cargo.toml)
（`version = "1.0.5"`、`authors = ["xAI"]`）、npm 官方 registry
[`@xai-official/grok`](https://registry.npmjs.org/@xai-official/grok)、研究日抓取的
`https://x.ai/cli/stable`（响应 `1.0.5`）。

`grok --version`（或 `-v`，另有短别名 `-V`）在解析子命令之前直接打印版本并退出；输出
格式为 `grok <版本> (<短 commit>) [<渠道>]`，其中渠道标签取自自动更新器缓存在
`~/.grok/version.json` 的 stable 指针，**首次运行无缓存时标签为空**（即只输出
`grok 1.0.5 (abc1234)`）；从源码自行构建时无 commit 段。另有子命令 `grok version`
（别名 `grok v`），`--json` 输出 `{"currentVersion":"1.0.5 (abc1234)","channel":"stable"}`。
来源：固定提交的
[`cli.rs` L432-L434](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager/src/app/cli.rs#L432-L434)、
[`main.rs` L1788-L1811](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager-bin/src/main.rs#L1788-L1811)、
[`xai-grok-version/src/lib.rs`](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-version/src/lib.rs)、
[`version.rs` L589-L603](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-update/src/version.rs#L589-L603)。

## 官方安装方式

### 安装脚本：官方推荐入口

官方仓库 README 与官方文档「Getting Started」给出的安装命令：

```bash
# macOS / Linux / Git Bash
curl -fsSL https://x.ai/cli/install.sh | bash            # 最新 stable
curl -fsSL https://x.ai/cli/install.sh | bash -s 0.1.42  # 指定版本
```

```powershell
# Windows PowerShell
irm https://x.ai/cli/install.ps1 | iex
```

来源：固定提交的
[README](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/README.md)、
固定提交的用户指南
[`01-getting-started.md`](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager/docs/user-guide/01-getting-started.md)
（即 docs.x.ai/build 的随包文档源）。

研究日（2026-08-19）实际抓取的脚本本体（未做内容修改，仅核对行为与哈希）：

- [`https://x.ai/cli/install.sh`](https://x.ai/cli/install.sh)：HTTP 200 直连、无重定向，
  460 行，SHA-256 `43d0943123edade1383a476a4f778674877acee7c1f98a00f094c4a0f7349321`
- [`https://x.ai/cli/install.ps1`](https://x.ai/cli/install.ps1)：HTTP 200，334 行，
  SHA-256 `9e995d8d6adaa425fd52ad89b5281d6d4d9076c1835d6cc65a666ec89288d5b6`

`install.sh` 的关键行为（全部以脚本本体为准）：

- 平台检测：`uname -s`（Darwin/Linux/MINGW/MSYS/Cygwin）× `uname -m`（x86_64/aarch64）；
  macOS 上额外用 `sysctl hw.optional.arm64` 识别 Rosetta 翻译环境，为其安装原生 arm64
  构建。不支持的 OS/架构直接报错退出。
- 下载源：主用 `https://x.ai/cli`（Cloudflare），失败时回退
  `https://storage.googleapis.com/grok-build-public-artifacts/cli`；版本由渠道指针文件
  `<base>/<channel>` 解析（`GROK_CHANNEL`：stable/alpha/enterprise，默认 stable），产物
  形如 `grok-<版本>-<平台>`。研究日实测两个来源的产物 URL 均可匿名访问（HEAD 200），
  即**安装不需要登录**；鉴权（`GROK_DEPLOYMENT_KEY` 或 `~/.grok/auth.json`）只用于拉取
  企业管理配置。
- 落点：二进制下载到 `~/.grok/downloads/grok-<平台>`，`~/.grok/bin/grok` 与
  `~/.grok/bin/agent` 以相对符号链接指向它；安装目录可用 `GROK_BIN_DIR` 覆盖。
  下载后会先执行 `<二进制> --version` 做冒烟测试，失败则保留旧安装。
- PATH 处理：若 `~/.grok/bin` 不在 PATH，优先尝试向已在 PATH 上的 `~/.local/bin` 或
  `/usr/local/bin` 创建 `grok`/`agent` 符号链接；同时向 `~/.bashrc` / `~/.zshrc` /
  fish 配置写入带 `# >>> grok installer >>>` / `# <<< grok installer <<<` 标记的
  PATH 区块（已有标记则原位替换）。
- 配置持久化：向 `~/.grok/config.toml` 的 `[cli]` 段写入 `installer = "internal"`
  （非 stable 渠道另写 `channel`），保留文件其余内容（awk 段级替换）。
- 脚本无卸载模式、无 uninstall 字样。

`install.ps1` 行为对称：下载到 `%USERPROFILE%\.grok\downloads`，把 `grok.exe` 与
`agent.exe` **复制**（不用符号链接）到 `%USERPROFILE%\.grok\bin`，并把该目录写入用户
PATH；同样写 `config.toml` 的 `installer = "internal"`。WSL 应使用 Linux 二进制（即
bash 脚本流程）。

### npm：官方第二入口

官方 npm 包 [`@xai-official/grok`](https://registry.npmjs.org/@xai-official/grok)
（仓库内打包模板见固定提交的
[`npm/grok/package.json`](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager/npm/grok/package.json)，
其 [`npm/grok/README.md`](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager/npm/grok/README.md)
记载 `npm i -g @xai-official/grok` 与脚本并列）：

```bash
npm i -g @xai-official/grok
```

研究日核对 `1.0.5` 的 registry metadata 与 tarball 内容：

- 主包仅约 17 KB：`bin/grok` 是 Node trampoline，`bin/postinstall.js` 从六个平台
  optionalDependencies（`@xai-official/grok-darwin-arm64` 等）中匹配当前平台的
  brotli 压缩二进制，解压安装为 `~/.grok/bin/grok-<版本>` 并原子切换
  `~/.grok/bin/grok` 符号链接（Windows 为复制 `grok.exe`）；同时向 `config.toml`
  写入 `cli.installer = "npm"`。研究日下载的 tarball 中 `postinstall.js` 与仓库
  固定提交的 [`npm/grok/bin/postinstall.js`](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager/npm/grok/bin/postinstall.js) 逐字节一致。
- `engines.node >= 20`；`os = [darwin, linux, win32]`、`cpu = [arm64, x64]`。
- **postinstall 是安装的必要环节**：`--ignore-scripts` 会得到一个没有二进制的空壳
  （trampoline 会尝试引导兜底，但正常语义依赖 postinstall），接入时**不要**加该 flag
  （与 Pi 的做法相反）。
- npm 途径只安装 `grok`，**不**安装 `agent` 别名（脚本安装才有）。

### Windows

- 原生方式即上述 `install.ps1`；脚本安装器注释与文档均说明 Git for Windows / MSYS2
  的 Bash 下也可走 `install.sh`（此时按 windows 平台检测落 `.exe`）。
- npm 途径同样支持 win32（x64/arm64）。
- npm README 的平台表只列了「Windows x86_64」，但 `install.ps1` 的架构检测与 npm 的
  optionalDependencies 都覆盖 win32-arm64；以脚本与包 metadata 为准，README 表格视为
  滞后。

### Node.js 版本要求

脚本途径**无 Node.js 依赖**（Rust 预编译二进制，运行期只需 curl 或 wget 下载器）。
Node.js `>=20` 只是 npm 途径的要求（npm metadata `engines`）。

## `grok update` 的准确语义

`grok update` 是真实自更新命令。子命令定义（固定提交
[`cli.rs` L91-L122](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager/src/app/cli.rs#L91-L122)）：

```text
grok update [--check [--json]] [--force-reinstall] [--version <semver>]
            [--alpha | --stable | --enterprise]
```

执行路径（固定提交
[`main.rs` L2404-L2459](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager-bin/src/main.rs#L2404-L2459)
→ [`auto_update.rs` L2640 `run_update`](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-update/src/auto_update.rs#L2640)）：

- `--check`：只查询并打印状态（如 `Grok Build - v1.0.5 (latest: 1.0.5) [stable]`），
  不安装；`--json` 只能与 `--check` 同用。来源：固定提交
  [`auto_update.rs` L193-L233](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-update/src/auto_update.rs#L193-L233)。
- 无参数：按 `config.toml` 中记录的 installer 分流。`internal`（脚本安装）直接走
  `install_internal`：从 CDN（主 x.ai、回退 GCS）下载目标版本、冒烟测试后原子切换
  `~/.grok/bin/grok` 符号链接（来源：固定提交
  [`auto_update.rs` L1374-L1408](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-update/src/auto_update.rs#L1374-L1408)）；
  `npm` 则执行 `npm i -g @xai-official/grok@<解析后的版本>`（来源：固定提交
  [`auto_update.rs` L2550-L2590](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-update/src/auto_update.rs#L2550-L2590)）。
- 已是最新时打印 `Already up to date.` 并以 0 退出；失败（下载失败、版本不合法等）
  走 `bail!`，**非零退出**。
- `--version <semver>`：跳过最新版检查直接安装指定版本，并把 `auto_update` 持久化为
  `false`（钉版即关闭自动更新）。
- `--alpha` / `--stable` / `--enterprise`：切换渠道并立即按新渠道安装。
- 安装成功后会让本机上版本更旧的运行中 leader 进程重启到新二进制（尽力而为，失败
  不致命）。

这与 MiniMax CLI v1.0.19 的 `mmx update`（只打印 `npm update -g mmx-cli` 指引）有本质
差别：Grok Build 的自更新在两种安装来源下都会真实落地新版本。

### 后台自动更新（默认开启）

release 构建默认在启动时后台检查并**下载安装**更新：`cli.auto_update` 为 `None` 时按
`true` 处理（首次运行即生效）。关闭方式：`grok update --version <ver>` 钉版、在设置中
关闭 Auto-update、环境变量 `GROK_DISABLE_AUTOUPDATER=1`、或单次运行加
`--no-auto-update`（隐藏 flag）。对管理器的影响见下节。来源：固定提交
[`auto_update.rs` L709-L710](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-update/src/auto_update.rs#L709-L710)、
[`main.rs` L2337-L2345](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager-bin/src/main.rs#L2337-L2345)、
[`cli.rs` L747-L749](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager/src/app/cli.rs#L747-L749)。

## 卸载

**没有原生卸载命令。** 固定提交的顶级子命令枚举（`Agent`、`Doctor`、`Login`、`Logout`、
`Update`、`Version`、`Plugin` 等）中不存在 `Uninstall`（来源：固定提交
[`cli.rs` L8-L154](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager/src/app/cli.rs#L8-L154)）；
全仓检索 uninstall 仅命中插件管理（`grok plugin uninstall`），与自身卸载无关。随包
用户指南全部 24 篇文档与官方文档站均无卸载章节；两个安装脚本也无卸载模式。

以下流程**均为按安装方式推断、未获官方文档背书**：

- **脚本安装**：删除 `~/.grok/bin/grok` 与 `~/.grok/bin/agent` 符号链接、删除
  `~/.grok/downloads/`（真实二进制所在）；若安装时 `~/.local/bin` 或 `/usr/local/bin`
  在 PATH 上，脚本还在那里创建了同名符号链接，需一并删除（`/usr/local/bin` 视权限
  可能需要提权）。shell 配置中的 `# >>> grok installer >>>` 标记块不会因此失效（只是
  把一个不再含 grok 的目录留在 PATH），是否删除由用户决定，不建议自动编辑 shell 配置。
- **npm 安装**：`npm uninstall -g @xai-official/grok`。注意它只移除 npm 全局 shim；
  postinstall 安放在 `~/.grok/bin/` 的版本化二进制与 `grok` 符号链接**会残留**——若
  `~/.grok/bin` 在 PATH 上（例如曾有脚本安装写入的 profile 区块），`grok` 仍能解析，
  需再按上一条删符号链接。

**用户数据不清理，且存在同根陷阱**：`~/.grok/` 同时是安装根（`bin/`、`downloads/`、
`completions/`）与用户数据根（`auth.json` 凭据、`config.toml`、`sessions/`、
`version.json`、企业管理配置 `managed_config.toml`/`requirements.toml` 等）。卸载时
**严禁** `rm -rf ~/.grok`；`grok logout` 只「登出并清除缓存凭据」，不删除目录。
来源：固定提交
[`cli.rs` L22-L23](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager/src/app/cli.rs#L22-L23)、
研究日抓取的安装脚本本体、固定提交的用户指南
[`01-getting-started.md`](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager/docs/user-guide/01-getting-started.md)（auth.json、sessions 路径）。

## 对 `ai-cli-manager` 当前实现的影响

### 建议的 catalog 条目

[`catalog.ts`](../../src/catalog.ts) 现有模型下建议：

```ts
{
  id: "grok",
  label: "Grok Build",
  command: "grok",
  versionArgs: ["--version"],
  install: {
    unix: script("https://x.ai/cli/install.sh", ["x.ai"], "bash"),
    win32: script("https://x.ai/cli/install.ps1", ["x.ai"], "powershell"),
  },
  updateArgs: ["update"],
  uninstall: {
    unix: [
      { kind: "command", program: "npm", args: ["uninstall", "-g", "@xai-official/grok"] },
      { kind: "command", program: "rm", args: ["-f", "~/.grok/bin/grok"] },
      { kind: "command", program: "rm", args: ["-f", "~/.grok/bin/agent"] },
      { kind: "command", program: "rm", args: ["-f", "~/.local/bin/grok"] },
      { kind: "command", program: "rm", args: ["-f", "~/.local/bin/agent"] },
      { kind: "command", program: "rm", args: ["-rf", "~/.grok/downloads"] },
    ],
  },
}
```

要点说明：

1. **`allowedHosts` 只需 `["x.ai"]`。** 研究日实测脚本 URL 直连 HTTP 200、无重定向；
   白名单约束的是管理器下载脚本本身的链条，脚本运行期回退 GCS
   （`storage.googleapis.com`）是脚本内部行为，不经管理器 fetch，无需也不应列入。
2. **shell 用 `bash`。** `install.sh` 使用 `[[ ]]` 等 bash 语法，官方命令也是
   `| bash`；管理器以 `bash <临时文件>` 执行等价（脚本不依赖管道执行，无参数时默认
   最新 stable，与 `| bash` 行为一致）。
3. **`updateArgs: ["update"]` 是真更新**，与管理器语义匹配：真实更新后版本号变化 →
   `changed`；已最新时 `grok update` 以 0 退出且版本不变 → `unchanged`（提示语「已是
   最新，或上游给出了手动步骤」恰好贴切）；失败非零退出 → `failed`。无 mmx 的虚报
   问题。
4. **卸载步骤适配「尽力串行 + 命令消失判成功」模型**（见
   [`native-uninstall.md`](native-uninstall.md) 末节实现决策）：首步 `npm uninstall -g`
   覆盖 npm 安装来源（未 npm 安装时该步失败但不阻断，omp 条目同例）；随后四步删除
   脚本安装器创建的全部默认 PATH 入口（`~/.grok/bin` 与 `~/.local/bin` 两处符号链接）；
   末步删除安装器拥有的 `~/.grok/downloads/` 真实二进制。**不**包含 `/usr/local/bin`
   （写权限因机器而异，删不掉时命令仍在 PATH，管理器如实报告失败并提示可能存在其他
   安装来源，与既有「只覆盖默认路径」裁决一致）；**严禁**加入任何 `rm -rf ~/.grok`
   形式步骤（数据同根陷阱）。
5. **win32 卸载第一版缺省**，与 claude/codex/kimi 条目一致；Windows 对应物为删除
   `%USERPROFILE%\.grok\bin\grok.exe` 与 `agent.exe`（脚本为复制安装、无符号链接），
   留待 runner 平台封装后补。

### 必须注意的语义落差与风险

1. **后台自动更新默认开启。** 用户日常运行 `grok` 本身就可能升级版本，管理器扫描到的
   版本会在两次操作间漂移；「update 后版本未变」也可能是因为后台更新已抢先完成。这是
   上游默认行为，接入时应在 UI 提示或文档中说明，而非当作异常。
2. **检测混淆风险。** 第三方包 `grok-cli`（whitesmith）与 `grok-dev`（superagent-ai）
   同样提供 `grok` 命令。管理器的发现逻辑只按命令名命中 PATH，无法区分官方 Grok Build
   与这些第三方工具；若命中第三方副本，`versionArgs`/`updateArgs` 行为均不可预期
   （第三方工具的 `grok update` 语义未调研）。当前模型下只能如实记录该风险。
3. **npm 途径不能加 `--ignore-scripts`**（postinstall 必需），且若未来把 npm 作为
   安装入口，需注意它不安装 `agent` 别名、并要求 Node `>=20`。
4. **版本解析兼容。** `grok --version` 输出 `grok 1.0.5 (abc1234) [stable]`，
   [`manager.ts`](../../src/manager.ts) L72-L74 的 `extractVersion` 正则可正确提取
   `1.0.5`（commit 段含括号、渠道段含方括号，均不干扰 `\bv?(\d+\.\d+...)` 匹配）。
5. **id 用 `grok`，label 用官方产品名 `Grok Build`**；不要使用 `gork`（误写）或
   `grok-cli`（第三方包名）。
6. **自定义目录不在卸载覆盖范围。** `GROK_BIN_DIR` / `GROK_HOME` 改过的安装与数据
   位置不会被上述步骤命中，卸载后命令可能仍在 PATH，管理器按既有语义如实报告失败。

## 未确认事项

- `https://x.ai/cli` 产品页与 `https://x.ai/build/changelog` 研究日被 Cloudflare
  拦截（HTTP 403，含浏览器 UA），未能直接核对其内容；产品页内容以仓库 README 转述与
  docs.x.ai 文档站为准。
- 官方文档站（docs.x.ai/build）只确认了安装/`grok update` 的记载；该站是否有未随包
  发布的独立卸载/运维页面，未能全站枚举确认（随包 24 篇用户指南已全文检索，无卸载
  章节）。
- 「gork build」除 Grok Build 外是否可能指其他产品：一手来源中未见名为 gork 的工具，
  本研究按误写处理；若用户实指他物，需重新调研。
- npm README 平台表（Windows 仅 x86_64）与安装脚本/npm metadata（覆盖 win32-arm64）
  不一致，上文以脚本与 metadata 为准；官方未就此作出说明。
- 源码中 `gh-release` 安装来源引用 `xai-org-shared/grok-build` 仓库（固定提交
  [`auto_update.rs` L79](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-update/src/auto_update.rs#L79)），
  该仓库研究日无法匿名访问（疑似私有），其分发形态未核实。
- enterprise 渠道（`GROK_CHANNEL=enterprise`、`enterprise-install.sh`）面向企业部署，
  未调研其差异。
- 上节全部卸载步骤均为按安装方式的推断，无任何官方文档背书；`~/.grok/downloads` 之外
  是否还有其他安装器独占残留（如 `completions/`）未做穷尽核验。
- 两个安装脚本是可变 CDN 端点，本文 SHA-256 仅对研究日抓取有效；接入前应重新抓取
  核对（尤其确认是否新增卸载模式）。

## 实际查阅的一手来源

- 官方仓库固定提交 `d92c5b0b`：
  [README](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/README.md)、
  [`cli.rs`（子命令枚举与 version flag）](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager/src/app/cli.rs)、
  [`main.rs`（version 输出、update 分发、自动更新开关）](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager-bin/src/main.rs)、
  [`auto_update.rs`（update 实现、installer 检测、npm 安装）](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-update/src/auto_update.rs)、
  [`version.rs`（渠道标签）](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-update/src/version.rs)、
  [`xai-grok-version/src/lib.rs`（版本字符串）](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-version/src/lib.rs)、
  [`01-getting-started.md`（安装/更新文档）](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager/docs/user-guide/01-getting-started.md)、
  [`npm/grok/`（npm 打包模板、README、postinstall）](https://github.com/xai-org/grok-build/tree/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager/npm/grok)
- 官方安装脚本本体（研究日 2026-08-19 抓取，SHA-256 见正文）：
  [`install.sh`](https://x.ai/cli/install.sh)、[`install.ps1`](https://x.ai/cli/install.ps1)；
  渠道指针 `https://x.ai/cli/stable`（响应 `1.0.5`）；产物 URL 匿名可达性实测（HEAD 200）
- npm 官方 registry 一手 metadata：[`@xai-official/grok`](https://registry.npmjs.org/@xai-official/grok)
  （含 `1.0.5` tarball 本体核对，postinstall 与仓库内版本逐字节一致）、
  [`grok-cli`](https://registry.npmjs.org/grok-cli)、[`grok`](https://registry.npmjs.org/grok)
- 官方文档站：[docs.x.ai/build/overview](https://docs.x.ai/build/overview)
- 社区来源（仅用于第三方身份互证，均已标注性质）：
  [`superagent-ai/grok-cli` README](https://github.com/superagent-ai/grok-cli)（其自我
  免责声明与 npm metadata 互证该包非官方）
