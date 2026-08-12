# Pi 安装与更新机制研究

研究日期：2026-08-12  
官方站点：[`pi.dev`](https://pi.dev/)  
上游仓库：[`earendil-works/pi`](https://github.com/earendil-works/pi)  
源码核对提交：[`2e4d239`](https://github.com/earendil-works/pi/tree/2e4d23959485279aa2da1a45103de2ea22d46395)

## 结论摘要

本文调研的是命令为 `pi` 的 **Pi minimal terminal coding harness**，不是
`can1357/oh-my-pi` 的 OMP。Pi 当前 canonical npm 包是
`@earendil-works/pi-coding-agent`，官方源码仓库是 `earendil-works/pi`，包的
`author` 仍是 Mario Zechner。源码固定提交的包元数据将 `pi` 映射到
`dist/cli.js`，版本为 `0.84.1`，并要求 Node.js `>=22.19.0`。

来源：官方 [Pi 文档对产品的定义](https://pi.dev/docs/latest)、固定提交的
[`package.json`](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/package.json#L1-L10)、
[仓库、作者和 Node.js engine](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/package.json#L97-L106)。

Pi 的官方 POSIX 安装脚本目前**不是独立二进制安装器**：它最终执行 npm 全局安装。
因此通过 `curl -fsSL https://pi.dev/install.sh | sh` 和直接使用 npm 安装，在来源语义上
都属于 npm，而不应分别建模为 `official` 与 `npm` 两份安装。

Pi 有内置自更新，但 `pi update --self` 不是任意来源的通用更新器。它只会为可识别、
可写、由全局 npm、pnpm、Yarn 或 Bun 管理的安装生成更新命令；Homebrew、Bun 编译
独立二进制、源码 checkout 或未知来源必须沿原来源手动更新。

## 身份、命令、版本与 canonical 包

| 项目 | 当前事实 |
| --- | --- |
| 产品 | Pi，minimal terminal coding harness |
| 官方站点 | `https://pi.dev/` |
| 官方仓库 | `https://github.com/earendil-works/pi` |
| canonical 包 | `@earendil-works/pi-coding-agent` |
| CLI 命令 | `pi` |
| 版本命令 | `pi --version` / `pi -v`，输出包版本字符串 |
| 包作者 | Mario Zechner |
| 许可证 | MIT |

`package.json` 的 `bin` 字段直接声明 `pi: dist/cli.js`；命令解析后，`--version` 会
打印从当前包 `package.json` 读取的 `VERSION`。来源：固定提交的
[`package.json`](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/package.json#L1-L10)、
[`main.ts` 的版本输出](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/src/main.ts#L621-L624)、
[`config.ts` 的包名与版本来源](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/src/config.ts#L470-L492)。

## 官方安装方式

### npm：文档首选方式

官方 Quickstart 当前给出的主安装命令是：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

`--ignore-scripts` 是上游主动要求的供应链防护；文档明确说明 Pi 的正常 npm 安装
不需要 lifecycle scripts。来源：官方 [Quick start](https://pi.dev/docs/latest#quick-start)。

包 metadata 要求 Node.js `>=22.19.0`。这是当前包的运行时下限，而不是仅限开发环境的
要求。来源：固定提交的
[`engines`](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/package.json#L104-L106)。

虽然官方卸载文档同时列出了 pnpm、Yarn 和 Bun 的全局卸载命令，且自更新源码会识别
这三种来源，官方 Quickstart 的安装入口仍以 npm 和 POSIX 安装脚本为主。来源：官方
[安装和卸载说明](https://pi.dev/docs/latest#quick-start)、固定提交的
[`InstallMethod`](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/src/config.ts#L27-L94)。

### POSIX 官方脚本

macOS / Linux 的官方命令是：

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

来源：官方 [Quick start](https://pi.dev/docs/latest#quick-start)。

2026-08-12 获取到的 [`install.sh`](https://pi.dev/install.sh) SHA-256 为
`d3ad02c775a6b2a78974b242dd7742a3612cd8be6b58a977516053d9f9897a41`。该脚本由
`pi.dev` 动态提供，未在固定提交仓库中找到相同脚本，因此以下脚本细节按 URL 与哈希
记录，不能提供 Git commit 固定链接。

脚本的实际行为是：

- 目标包固定为 `@earendil-works/pi-coding-agent`，目标命令为 `pi`。
- 预检 Node.js `>=22.19.0` 和 npm；若缺失且有 TTY，会询问是否安装依赖。
- macOS 有 Homebrew 时用 Homebrew 安装/更新 **Node.js**，Linux 会尝试 apt 或 apk；
  否则从 nodejs.org 下载 `latest-v22.x` 独立 Node.js，并在可用时验证 SHA-256。
- 若 npm 全局 prefix 可写，就安装到该 prefix；否则通常选择 `$HOME/.local`，并可询问
  是否把其 `bin` 目录写入 shell profile。
- Pi 本身最终通过
  `npm install -g --ignore-scripts --min-release-age=0 @earendil-works/pi-coding-agent`
  安装。`PI_EXPERIMENTAL=1` 才启用额外的锁定依赖安装实验路径，否则是普通 npm 安装。
- 已存在 `pi` 时，交互菜单默认“重新安装”；无 TTY 时也会直接继续安装/重装。

来源：动态官方 [`install.sh`](https://pi.dev/install.sh)，对应本研究记录哈希见上。

这意味着现有 `ai-cli-manager` 将该脚本列为 `official` 来源是安装入口层面的分类，
并非最终安装归属。执行后检测到的实例应是 npm 来源；如果 npm prefix 是 `$HOME/.local`，
只查询默认 `npm root -g` 还可能找不到它。

### Homebrew

Homebrew/core 当前提供 formula：

```bash
brew install pi-coding-agent
```

formula 从 canonical npm tarball 构建，依赖 Node.js，并包装 `pi` 可执行文件。包装脚本设置
`PI_SKIP_VERSION_CHECK=1`，因此 Homebrew 安装不会在 Pi 启动时检查自身更新；应使用
`brew update && brew upgrade pi-coding-agent`（或用户通常使用的 `brew upgrade` 流程）。

来源：Homebrew 官方 [formula 页面](https://formulae.brew.sh/formula/pi-coding-agent)、
[formula JSON API](https://formulae.brew.sh/api/formula/pi-coding-agent.json)、
[formula 源码](https://github.com/Homebrew/homebrew-core/blob/HEAD/Formula/p/pi-coding-agent.rb#L1-L28)。

### GitHub Releases 独立二进制

上游 release 目前发布 macOS/Linux 的 x64、arm64 tarball 和 Windows 的 x64、arm64 zip，
也发布 `SHA256SUMS`。仓库说明这些是 Bun 编译的 standalone binaries；它们存在于官方
release，但当前 Quickstart 不把它们作为主要安装命令。来源：官方
[最新 release](https://github.com/earendil-works/pi/releases/latest)、
[从 release source 构建 standalone 的说明](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/README.md)。

独立二进制的路径由用户自行决定，没有单一默认 marker。`pi update --self` 明确不更新
这种 `bun-binary` 安装，只提示从 GitHub Releases 获取新版本。来源：固定提交的
[`detectInstallMethod` 与更新命令构造](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/src/config.ts#L15-L29)、
[`getSelfUpdateUnavailableInstruction`](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/src/config.ts#L315-L345)。

### Windows

官方文档没有列出 `pi.dev/install.ps1`。npm 安装是 Windows 的主要安装方式；另外可手动
使用 GitHub Releases 的 Windows standalone zip。Pi 的内置 bash 工具在 Windows 上
要求 bash shell，并依次查找用户配置、Git Bash、PATH 上的 `bash.exe`。来源：官方
[Windows setup](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/docs/windows.md#L1-L9)、
[release 资产](https://github.com/earendil-works/pi/releases/latest)。

## `pi update` / `pi update --self` 的准确语义

当前命令语义为：

```text
pi update                 # 默认只更新 Pi 自身；不会更新扩展包
pi update --self          # 只更新 Pi 自身
pi update pi              # 同上；self 也是位置参数别名
pi update --self --force  # 即使已是最新版也重装 Pi
pi update --all           # 更新 Pi 自身和安装的 Pi packages
pi update --extensions    # 只更新 Pi packages
pi update --models        # 只刷新模型目录
```

来源：固定提交的
[`package-manager-cli.ts` 帮助文本](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/src/package-manager-cli.ts#L150-L172)、
[默认 target 解析](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/src/package-manager-cli.ts#L318-L370)。

自更新先请求 `https://pi.dev/api/latest-version`。响应的 `version` 决定目标版本，
`packageName` 可决定要切换到的新包名；若未提供包名则保留当前包名。只有版本更新、
包名变化或传入 `--force` 时才执行安装。来源：固定提交的
[`version-check.ts`](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/src/utils/version-check.ts#L4-L11)、
[`getSelfUpdatePlan`](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/src/package-manager-cli.ts#L468-L503)。

自更新会识别当前 Pi 实例的实际运行方式：

| 识别来源 | 自更新命令核心行为 |
| --- | --- |
| npm | `npm install -g --ignore-scripts --min-release-age=0 <package>@<version>` |
| pnpm | `pnpm install -g --ignore-scripts --config.minimumReleaseAge=0 <package>@<version>` |
| Yarn | `yarn global add --ignore-scripts <package>@<version>` |
| Bun | `bun install -g --ignore-scripts --minimum-release-age=0 <package>@<version>` |
| Bun 编译二进制 | 不支持自更新，提示 GitHub Releases |
| unknown / Homebrew / 源码 checkout | 不支持自更新，提示沿提供该实例的来源更新 |

当 latest API 的 `packageName` 与当前包不同，命令先卸载旧包，再安装带精确版本的新包。
更新命令只在检测到当前包确实位于相应全局包目录、且包目录及父目录可写时才运行；否则
拒绝自更新。来源：固定提交的
[`InstallMethod` 与各包管理器命令](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/src/config.ts#L27-L187)、
[全局归属及可写校验](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/src/config.ts#L293-L345)。

Windows 上 Pi 进一步只允许 npm 与 pnpm 自更新。为避免正在加载的 native addon 阻止
npm 替换文件，会先把已加载依赖移到 quarantine，再执行安装。来源：固定提交的
[`package-manager-cli.ts` Windows 限制](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/src/package-manager-cli.ts#L836-L878)、
[`windows-self-update.ts`](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/src/utils/windows-self-update.ts#L45-L77)。

## latest 权威接口

Pi 自身使用：

```text
GET https://pi.dev/api/latest-version
Accept: application/json
```

2026-08-12 返回：

```json
{"ok":true,"version":"0.84.1","packageName":"@earendil-works/pi-coding-agent"}
```

该响应 SHA-256 为
`881cd284746c2a3067b15afe50ffb2a6dfd27ec5609b3a6202e4a6f21003dfa0`。
接口 URL、字段解析和 `PI_OFFLINE` 行为由固定提交源码定义，因而这是比抓 npm latest
更适合 Pi 自更新/迁移决策的官方接口。来源：固定提交的
[`version-check.ts`](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/src/utils/version-check.ts#L4-L85)。

如果只需要某个来源的可安装版本，npm registry 的
`@earendil-works/pi-coding-agent/latest` 和 Homebrew formula JSON 也分别是对应包管理器的
一手接口；但它们不携带 Pi 的包名迁移指令。

## 默认路径与 marker

- Pi 用户数据默认位于 `~/.pi/agent/`，可通过 `PI_CODING_AGENT_DIR` 覆盖；这里保存
  settings、auth、sessions、extensions 等。这是**用户数据 marker**，不是安装归属 marker。
- npm/pnpm/Yarn/Bun 的可执行路径由各自全局 prefix 决定；官方 `install.sh` 在 npm prefix
  不可写时通常使用 `$HOME/.local`，可执行文件为 `$HOME/.local/bin/pi`。
- Homebrew formula 的归属应通过 `brew info` / Cellar prefix 判断。
- standalone binary 没有固定安装目录，不能仅凭 `~/.pi/agent` 判断来源。

来源：固定提交的
[`getAgentDir`](https://github.com/earendil-works/pi/blob/2e4d23959485279aa2da1a45103de2ea22d46395/packages/coding-agent/src/config.ts#L510-L521)、
动态官方 [`install.sh`](https://pi.dev/install.sh)（本研究记录哈希见前文）、Homebrew
[formula 源码](https://github.com/Homebrew/homebrew-core/blob/HEAD/Formula/p/pi-coding-agent.rb#L25-L28)。

## 从 `@mariozechner` 到 `@earendil-works` 的迁移

旧包 `@mariozechner/pi-coding-agent` 最终版本为 `0.73.1`，npm metadata 已将它标记为
deprecated，并明确要求以后使用 `@earendil-works/pi-coding-agent`。新 scope 的首个版本
是 `0.74.0`。来源：npm 官方 registry
[`@mariozechner/pi-coding-agent`](https://registry.npmjs.org/@mariozechner%2fpi-coding-agent)、
[`@earendil-works/pi-coding-agent`](https://registry.npmjs.org/@earendil-works%2fpi-coding-agent)。

上游 `v0.73.1` release 专门加入迁移支持：旧版本执行 `pi update --self` 时，会信任
latest API 返回的 active package name，卸载旧全局包并安装新包。因此 upstream 的正常
自更新路径**可以完成 scope 迁移**。来源：官方
[`v0.73.1` release notes](https://github.com/earendil-works/pi/releases/tag/v0.73.1)。

## 对 `ai-cli-manager` 当前实现的影响

### 目录定义中正确的部分

当前 [`catalog.ts`](../../src/catalog.ts) 的以下字段与一手来源一致：

- `command: "pi"` 与 `versionArgs: ["--version"]`
- canonical `npmPackage: "@earendil-works/pi-coding-agent"`
- legacy npm 包 `@mariozechner/pi-coding-agent`
- Homebrew formula `pi-coding-agent`
- POSIX URL `https://pi.dev/install.sh`
- latest URL `https://pi.dev/api/latest-version`
- npm 安装参数 `--ignore-scripts`

### 需要修正或明确的部分

1. **`official` 不是独立安装来源。** `install.sh` 的最终产物是全局 npm 安装；安装后应
   检测为 npm。当前 `markers: []` 使它不会被误判为 official，这个结果碰巧正确，但
   UI 仍会把“官方”和“npm”显示成两个不同来源，容易让用户误解。
2. **`pi update --self` 当前实际上不会被调用。** 现有 detector 会把正常脚本安装和
   npm 安装识别为 `npm`，而 planner 只有当来源为 `official` 时才使用
   `official.updateArgs`；npm 来源走管理器自己的 `npm install -g ...@latest`。
3. **绕开上游自更新会失去 scope 迁移。** detector 把 legacy 包标为
   `source_unknown`，planner 又禁止更新 legacy 实例；但 upstream `v0.73.1` 的
   `pi update --self` 正是官方支持的自动迁移路径。当前警告“不会自动迁移”描述的是
   `ai-cli-manager` 的政策，不是 Pi 上游能力限制。
4. **不能让 Homebrew 调用 `pi update --self`。** Pi 不识别 Homebrew 为可自更新来源，
   而且 formula 设置 `PI_SKIP_VERSION_CHECK=1`；现有 `brew upgrade pi-coding-agent`
   路径是正确的。
5. **npm detector 只查一次默认 `npm root -g`。** 官方脚本可在默认 prefix 不可写时
   使用 `--prefix $HOME/.local`。如果调用者的 npm 默认 prefix 不再是该路径，现有检测
   会把 `$HOME/.local/bin/pi` 识别成 unknown。需要增加可见 PATH shim 反查包目录，或
   支持额外 npm prefix。
6. **`latest` 的来源语义要保持一致。** npm 来源目前查 npm dist-tag，official 来源才查
   `pi.dev/api/latest-version`。若将所有 Pi npm 更新委托 `pi update --self`，状态检查也应
   优先使用 Pi API，才能同步拿到 `packageName` 迁移信号。
7. **Node.js 下限不在当前模型中。** 官方脚本能交互安装 Node.js，但
   `ai-cli-manager` 的脚本 runner 将 stdin 设为 ignore；在 Node 缺失/过旧的机器上，
   安装器没有 TTY 后会退出并要求用户先装 Node。可在 source availability 中预检并给出
   清晰中文原因。
8. **独立二进制与 pnpm/Yarn/Bun 未建模。** 当前 `Source` 只有 official、npm、
   Homebrew、unknown。官方文档并不把这些都列为首选安装入口，但上游自更新明确支持
   pnpm/Yarn/Bun，而 Releases 也提供 standalone；若项目目标是识别所有已有安装，来源
   模型仍需扩展。

## 建议的 Pi 更新策略

基于当前上游行为，建议按活跃实例来源分派：

- Homebrew：继续使用 `brew upgrade pi-coding-agent`。
- canonical npm：可继续由 `ai-cli-manager` 执行带 `--ignore-scripts` 的 npm 更新；若要
  继承 Pi 的包名迁移协议与安装归属校验，则调用 `pi update --self` 更完整。
- legacy `@mariozechner/pi-coding-agent` 0.73.1：允许使用当前活跃 `pi` 执行
  `update --self` 完成官方迁移，但应显示将卸旧包、装新包的明确计划。
- pnpm、Yarn、Bun：在 detector 能可靠识别之前不要假装成 npm；可将它们标成
  package-manager 来源并委托 `pi update --self`。
- Homebrew、standalone 或 unknown：不要无条件调用 `pi update --self`；沿原来源更新，
  或在无法确认来源时只提供手动指引。

## 未确认事项

- `pi.dev/install.sh` 是动态服务内容，未在固定提交仓库中发现源文件。本研究记录了抓取
  日期和 SHA-256，但其实现会随服务更新；实现前应重新抓取并审查。
- 未发现官方 Windows PowerShell 安装脚本；Windows 自动安装体验是否计划新增，应以
  未来官方文档或仓库变更为准。
- standalone release 资产存在，但官方未规定统一安装目录，因此没有可依赖的路径 marker。
- Homebrew formula 的 Node 依赖当前解析为 Homebrew 当时的稳定 Node 版本；应依赖
  formula metadata，而不是在产品中硬编码该具体版本。
