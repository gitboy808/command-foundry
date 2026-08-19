# 五个 AI CLI 的原生卸载方式研究

研究日期：2026-08-17
调研对象：Claude Code（`claude`）、Codex CLI（`codex`）、Kimi Code（`kimi`）、
Pi（`pi`）、OMP / oh-my-pi（`omp`）
调研方法：只采用官方文档页面、官方安装脚本本体、官方仓库源码与研究日实际抓取
的响应；安装脚本均重新下载并核对 SHA-256。社区讨论仅在其内容与官方脚本可互相
印证时引用，并明确标注性质。

## 结论摘要

| 工具 | 精确卸载命令（对应该工具的主流安装方式） | 类型 | 是否清理用户数据 |
| --- | --- | --- | --- |
| Claude Code | native：`rm -f ~/.local/bin/claude && rm -rf ~/.local/share/claude`；npm：`npm uninstall -g @anthropic-ai/claude-code`；另有 brew/winget/apt/dnf/apk 命令 | **无原生卸载命令**；官方文档记载的手动删除 + 各包管理器卸载 | 默认**不清理**；`~/.claude`、`~/.claude.json` 的删除是文档中独立的可选步骤，并带数据丢失警告 |
| Codex | standalone：`rm ~/.local/bin/codex && rm -rf ~/.codex/packages/standalone`；npm：`npm uninstall -g @openai/codex`；Bun：`bun remove -g @openai/codex`；Homebrew：`brew uninstall --cask codex` | **无原生卸载命令，官方文档无卸载章节**；手动流程来自官方仓库 Discussion，路径与标记已对照安装脚本核实 | 保留；社区流程明确建议保留 `~/.codex` 其余内容（配置、凭据、会话） |
| Kimi Code | 脚本安装：删除 `kimi` 可执行文件（默认 `~/.kimi-code/bin/kimi`）；npm：`npm uninstall -g @moonshot-ai/kimi-code` | **无原生卸载命令**；官方入门文档记载的手动删除 + npm 卸载 | 保留；注意安装目录与用户数据同根（`~/.kimi-code`），官方只让删可执行文件 |
| Pi | `npm uninstall -g @earendil-works/pi-coding-agent`（curl 脚本安装同属 npm）；pnpm：`pnpm remove -g`；Yarn：`yarn global remove`；Bun：`bun uninstall -g` | **无原生卸载命令**；官方文档记载的包管理器卸载 | 文档卸载章节未提及 `~/.pi/agent`，即不清理用户数据 |
| OMP | **官方无任何卸载记载**；按安装方式推断：Bun `bun uninstall -g @oh-my-pi/pi-coding-agent`、npm `npm uninstall -g @oh-my-pi/pi-coding-agent`、Homebrew `brew uninstall can1357/tap/omp`、独立二进制删除 `$HOME/.local/bin/omp` | 无原生卸载命令、无文档流程；只有推断的包管理器/手动删除（均已标注） | 无官方记载；`~/.omp/agent` 用户数据应视为保留 |

**五个工具都没有 `xxx uninstall` 形式的原生自卸载命令。** 已逐一核实：Claude
Code 官方 CLI reference 研究日完整命令表无 uninstall；Codex 发布分支
`cli/src/main.rs` 的子命令枚举无 uninstall；Kimi Code 的命令注册表无
uninstall；Pi 官方文档只给包管理器命令；OMP 仓库中唯一的 uninstall 实现是
`omp plugin uninstall`（插件管理，与自身卸载无关）。

## Claude Code

### 是否有原生卸载命令

没有。研究日抓取的官方 CLI reference 完整命令表（`claude update`、
`claude install [version]`、`claude doctor`、`claude project purge` 等）中不存在
`claude uninstall`。`claude project purge` 只删除某个项目的本地状态，不是卸载。
[来源：官方 CLI reference](https://code.claude.com/docs/en/cli-reference)

### 官方文档的卸载流程

官方安装文档有独立的「Uninstall Claude Code」一节，按安装来源分别给出命令：

- **native 安装**（即 `https://claude.ai/install.sh` / `install.ps1` 安装，
  也是本工具 catalog 的安装入口）：

  ```bash
  # macOS / Linux / WSL
  rm -f ~/.local/bin/claude
  rm -rf ~/.local/share/claude
  ```

  ```powershell
  # Windows PowerShell
  Remove-Item -Path "$env:USERPROFILE\.local\bin\claude.exe" -Force
  Remove-Item -Path "$env:USERPROFILE\.local\share\claude" -Recurse -Force
  ```

- **Homebrew**：`brew uninstall --cask claude-code`（stable cask）或
  `brew uninstall --cask claude-code@latest`（latest cask）。
- **WinGet**：`winget uninstall Anthropic.ClaudeCode`。
- **apt**：`sudo apt remove claude-code`，并删除
  `/etc/apt/sources.list.d/claude-code.list` 与 `/etc/apt/keyrings/claude-code.asc`。
- **dnf**：`sudo dnf remove claude-code`，并删除
  `/etc/yum.repos.d/claude-code.repo`。
- **apk**：`apk del claude-code`，并从 `/etc/apk/repositories` 删除仓库行、删除
  `/etc/apk/keys/claude-code.rsa.pub`。
- **npm**：`npm uninstall -g @anthropic-ai/claude-code`。

[来源：官方安装文档 Uninstall 一节](https://code.claude.com/docs/en/installation#uninstall-claude-code)

### 用户数据处理

上述所有卸载命令都**不触碰用户数据**。配置与缓存的删除是文档中独立的
「Remove configuration files」小节，并带警告：会删除全部设置、允许的工具、
MCP 服务器配置和会话历史；且 VS Code 扩展、JetBrains 插件、桌面应用也会写
`~/.claude/`，需先卸载它们。命令为：

```bash
# macOS / Linux / WSL
rm -rf ~/.claude
rm ~/.claude.json
# 项目级（在项目目录执行）
rm -rf .claude
rm -f .mcp.json
```

[来源：同上](https://code.claude.com/docs/en/installation#uninstall-claude-code)

## Codex

### 是否有原生卸载命令

没有。研究日 `openai/codex` 仓库 main 分支 `codex-rs/cli/src/main.rs` 的
`Subcommand` 枚举包含 `Update`、`Doctor`、`Login`/`Logout`、`Delete`（删除已保存
会话）等，不存在 `Uninstall`。
[来源：main 分支 `cli/src/main.rs`](https://github.com/openai/codex/blob/main/codex-rs/cli/src/main.rs)

官方安装脚本也没有卸载模式：研究日抓取的
[`install.sh`](https://chatgpt.com/codex/install.sh)（SHA-256
`ba92dd27e5c06f0d3bbc58bfa4b9cfb6599cd2742fbb1f92a2765e6c07dedb5a`，与
2026-08-12 研究记录一致）只接受 `--release VERSION`；
[`install.ps1`](https://chatgpt.com/codex/install.ps1)（SHA-256
`391f247de2c70c7e99041979ec02dae7e76be27ac9cfc1dfe7c1eb21d48d8b97`）同样没有
standalone 卸载开关。两个脚本中出现的 uninstall 逻辑只用于**安装过程中发现
brew/bun/npm 管理的冲突安装**时询问是否卸载，命令分别为
`brew uninstall --cask codex`、`bun remove -g @openai/codex`、
`npm uninstall -g @openai/codex`。

### 官方文档的卸载流程

**官方文档没有卸载章节。** 研究日核对仓库 `docs/install.md`、
`docs/getting-started.md` 与 `README.md`，均无 uninstall/remove 内容；官方仓库
另有 issue 指出卸载文档缺失。目前可引用的流程来自官方仓库的
[Discussion #34373](https://github.com/openai/codex/discussions/34373)
（社区讨论，非正式文档；以下路径与标记已逐项对照安装脚本本体核实）：

```bash
# 1. 先确认 PATH 中的 codex 确为 standalone 安装器管理
readlink -- "$HOME/.local/bin/codex"
#    应指向 ~/.codex/packages/standalone/current/bin/codex（旧布局为 current/codex）

# 2. 只删除安装器拥有的文件
rm -- "$HOME/.local/bin/codex"
rm -rf -- "$HOME/.codex/packages/standalone"
hash -r

# 3. 验证
command -v codex || echo "Codex CLI removed"
```

安装器还可能向 `~/.bashrc` / `~/.zshrc` / `~/.profile` 写入带标记的 PATH 区块。
标记格式已对照脚本（`install.sh` 第 597–601 行）核实：

```text
# >>> Codex installer >>>
export PATH="$HOME/.local/bin:$PATH"
# <<< Codex installer <<<
```

仅在用户不需要 `~/.local/bin` 保留在 PATH 时才应手动删除该三行区块。自定义
`CODEX_INSTALL_DIR` / `CODEX_HOME` 时需替换上述默认路径（脚本中
`BIN_DIR="${CODEX_INSTALL_DIR:-$HOME/.local/bin}"`、
`STANDALONE_ROOT="${CODEX_HOME:-$HOME/.codex}/packages/standalone"`）。

npm / Bun / Homebrew 来源的卸载即上节安装脚本冲突处理中给出的三条包管理器命令。

### 用户数据处理

保留。Discussion 流程明确建议保留 `~/.codex` 的其余内容（配置、凭据、已保存
会话等本地状态），只删除 `packages/standalone` 子树。注意 Codex 的安装物与用户
数据同根：`~/.codex` 既是 `CODEX_HOME`（配置/数据）又包含 standalone 安装目录，
卸载时绝不能整目录删除 `~/.codex`。

## Kimi Code

### 是否有原生卸载命令

没有。研究日 `MoonshotAI/kimi-code` 仓库 main 分支
`apps/kimi-code/src/cli/commands.ts` 的命令注册只有 `upgrade`（`update` 为其
alias）和隐藏的 `__plugin_run_node` 等，不存在 uninstall。官方安装脚本
研究日响应中也不含任何 uninstall 逻辑（[`install.sh`](https://code.kimi.com/kimi-code/install.sh)
SHA-256 `638927825e96825edbb563de5e0cb06f8a0551c53e026ade8b717b0f25cb83d2`；
[`install.ps1`](https://code.kimi.com/kimi-code/install.ps1) SHA-256
`28a0473a7c56d41eae52cb4dbd3232f87a9133dd7af416a6a04dfbf7856fa9fc`，全文检索
无 uninstall）。

### 官方文档的卸载流程

官方入门文档「Upgrade and uninstall / 升级与卸载」一节（中英文内容一致）：

> **Uninstall**: if you installed via the script, delete the `kimi` executable.
> If you installed via npm:
>
> ```sh
> npm uninstall -g @moonshot-ai/kimi-code
> ```

即：脚本安装（`https://code.kimi.com/kimi-code/install.sh`，本工具 catalog 的
安装入口）只需删除 `kimi` 可执行文件，默认路径为
`${KIMI_INSTALL_DIR:-$HOME/.kimi-code}/bin/kimi`；Windows 为
`%USERPROFILE%\.kimi-code\bin\kimi.exe`。npm 安装用
`npm uninstall -g @moonshot-ai/kimi-code`。文档还列出 pnpm 安装方式，但卸载一节
未给出 pnpm 命令（对称命令 `pnpm remove -g @moonshot-ai/kimi-code` 未由官方文档
记载，实现时标注）。

来源：官方入门文档
[英文版](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/guides/getting-started.md)、
[中文版](https://github.com/MoonshotAI/kimi-code/blob/main/docs/zh/guides/getting-started.md)。

### 用户数据处理

保留，且有一个关键陷阱：Kimi Code 的**安装目录与用户数据同根**。数据迁移源码
把当前产品的数据目录定义为 `~/.kimi-code/`（sessions、config.toml、tui.toml、
mcp.json 等均在其下），而官方脚本安装的可执行文件也在 `~/.kimi-code/bin/kimi`。
官方卸载只要求删除可执行文件本身，不删除 `~/.kimi-code`。实现卸载时严禁
`rm -rf ~/.kimi-code`。
[来源：迁移模块路径定义 `packages/migration-legacy/src/paths.ts`](https://github.com/MoonshotAI/kimi-code/blob/main/packages/migration-legacy/src/paths.ts)

## Pi

### 是否有原生卸载命令

没有。Pi 提供 `pi update --self` 自更新，但官方文档与源码中不存在
`pi uninstall`。

### 官方文档的卸载流程

研究日抓取的现行官方文档（`https://pi.dev/docs/latest`）在 Quick start 中写明：

> To uninstall pi itself, use npm for curl and npm installs:
>
> ```bash
> npm uninstall -g @earendil-works/pi-coding-agent
> ```
>
> For pnpm, Yarn, or Bun installs, use the matching global remove command:
> `pnpm remove -g @earendil-works/pi-coding-agent`,
> `yarn global remove @earendil-works/pi-coding-agent`, or
> `bun uninstall -g @earendil-works/pi-coding-agent`.

[来源：官方文档 Quick start](https://pi.dev/docs/latest#quick-start)

要点：

- 官方 POSIX 安装脚本（`https://pi.dev/install.sh`）最终落地的就是 npm 全局
  安装，因此「curl 安装用 npm 卸载」与 2026-08-12 的安装研究结论一致；本工具
  catalog 的 Pi 安装入口本身就是 `npm install -g --ignore-scripts`，卸载与其对称。
- 文档卸载说明**未覆盖 Homebrew 与 standalone 二进制**：Homebrew formula
  安装的移除命令 `brew uninstall pi-coding-agent` 是 Homebrew 标准命令，未由 Pi
  文档记载；GitHub Releases 独立二进制无固定安装目录，只能删除对应文件（同样
  未见官方记载）。

### 用户数据处理

文档卸载章节未提及用户数据目录 `~/.pi/agent`（保存 settings、auth、sessions、
extensions，可用 `PI_CODING_AGENT_DIR` 覆盖），即上述卸载命令均不清理用户数据。

## OMP（oh-my-pi）

### 是否有原生卸载命令

没有。研究日对 `can1357/oh-my-pi` 仓库 main 分支做全树检索，唯一与 uninstall
相关的实现是 `omp plugin uninstall <package>`（插件管理，定义于
`packages/coding-agent/src/cli/plugin-cli.ts`），不存在卸载 OMP 自身的命令；
`src/commands/` 与 `src/cli/` 目录均无 uninstall 命令文件。
[来源：仓库 main 分支](https://github.com/can1357/oh-my-pi)

### 官方文档的卸载流程

**没有。** 研究日核对：官方 README 全文无 uninstall 内容；官方站点 `omp.sh`
首页 HTML 与其主 JS bundle（`/assets/index-BzcJmtQE.js`，约 290 KB）中均无
uninstall 字样；仓库 `docs/` 目录（约 70 篇文档）无卸载主题。官方安装脚本
[`https://omp.sh/install`](https://omp.sh/install)（研究日 SHA-256
`1b9a74f608a430977892c972ed071f3fc46bf6d09bbf81c8827a655beaa73df7`）也无卸载
模式。

因此下列命令均**按各安装方式推断、未由 OMP 官方记载**，实现与文案中应明确标注：

| 安装来源 | 推断的卸载命令 |
| --- | --- |
| Bun（README 推荐；官方脚本默认在有 Bun 时走此路） | `bun uninstall -g @oh-my-pi/pi-coding-agent`（或 `bun remove -g`） |
| npm | `npm uninstall -g @oh-my-pi/pi-coding-agent` |
| Homebrew（第三方 tap） | `brew uninstall can1357/tap/omp` |
| mise（`mise use -g github:can1357/oh-my-pi`） | mise 自身的卸载命令（具体语法未核实，建议实现前查 mise 文档） |
| 独立二进制（POSIX 脚本无 Bun 时的落点） | 删除 `${PI_INSTALL_DIR:-$HOME/.local/bin}/omp` |
| 独立二进制（Windows 脚本无 Bun 时的落点） | 删除 `%LOCALAPPDATA%\omp\omp.exe` |

### 用户数据处理

无官方记载。OMP 的用户级数据目录为 `~/.omp/agent`（另有项目级 `.omp`），应视为
卸载时保留。
[来源：仓库 `packages/coding-agent/src/config.ts` 路径注释](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/config.ts)

## 对 ai-cli-manager 实现卸载功能的影响

对照当前实现（[`src/catalog.ts`](../../src/catalog.ts)、
[`src/manager.ts`](../../src/manager.ts)、[`src/cli.ts`](../../src/cli.ts)），
卸载能力可以最大限度复用现有机制，但有三处必须改动的语义差异。

### 步骤建模：全部用 `command`，不需要 `script`

五个上游都**没有**官方卸载脚本，因此卸载步骤不需要 `script` 类型的
`ActionStep`（也就没有白名单/下载/临时目录那条路径的用武之地）。建议给
`RecipeShape` 增加：

```ts
readonly uninstall: { readonly unix: readonly ActionStep[]; readonly win32?: readonly ActionStep[] }
```

注意需要**步骤数组**而不是单个步骤：Claude 与 Codex 的卸载都要删两类路径
（launcher + 版本存储），现有 `Action`/`actionStep` 只携带一个步骤。各工具对应
catalog 安装入口的建议卸载步骤：

| 工具 | unix 卸载步骤（command 类型） | 说明 |
| --- | --- | --- |
| claude | `rm -f ~/.local/bin/claude`；`rm -rf ~/.local/share/claude` | 官方文档原文命令；runner 不经 shell，需在 manager 侧把 `~` 解析为 `env.HOME`/`os.homedir()` 的绝对路径 |
| codex | `rm -f <BIN_DIR>/codex`；`rm -rf <CODEX_HOME>/packages/standalone` | 默认 `~/.local/bin` 与 `~/.codex`；须尊重传入 env 的 `CODEX_INSTALL_DIR`/`CODEX_HOME`；**不得**整删 `~/.codex` |
| kimi | `rm -f ~/.kimi-code/bin/kimi` | 官方文档只让删可执行文件；**严禁** `rm -rf ~/.kimi-code`（数据同根）；自定义 `KIMI_INSTALL_DIR` 不在默认覆盖范围 |
| pi | `npm uninstall -g @earendil-works/pi-coding-agent` | 与 install 步骤（`npm install -g --ignore-scripts`）对称，单步骤即可 |
| omp | 二选一：`bun uninstall -g @oh-my-pi/pi-coding-agent` 或 `rm -f ~/.local/bin/omp` | 官方脚本默认「有 Bun 走 Bun，否则落二进制」，卸载前需先判定实际来源（如 realpath 命中 `~/.local/bin/omp` 为文件则删文件，否则尝试 bun 卸载），计划展示时如实说明 |

win32 对应物：claude 有官方 PowerShell 命令（`Remove-Item` 两条）；kimi/omp 删
对应 `.exe`；pi 的 npm 命令跨平台一致。`command` 步骤直接执行 `rm`，Windows
需经 PowerShell 或后续给 runner 加平台封装；第一版只支持 unix 卸载也是合理
切片。

### 成功判据要反转

`manager.ts` 的 `runAction` 目前以「执行后还能读到版本」为成功
（`if (!after.version) return { outcome: "failed" }`）。卸载恰好相反：执行后
`scanTool` 应返回 `state: "missing"`（`--version` 命中 `ENOENT`）才算成功。
`Operation` 增加 `"uninstall"` 后，`runAction` 需要为其分支：执行前要求
`state !== "missing"`，执行后 `after.state === "missing"` 判 `changed`，仍能读到
版本则判失败并提示「卸载后命令仍在 PATH 中」（可能是多份安装或 shell 别名残留，
Claude 官方卸载文档也专门提示了这种情形）。

### 计划与确认

`cli.ts` 的 `printPlan` + `prompts.confirm`（default: false）流程可以直接复用；
`preview()` 对 command 步骤本来就会展示精确命令行。建议卸载计划额外明确列出
「将删除的路径/包名」与「不会触碰的用户数据目录」，因为卸载是不可逆操作，比
安装/更新更需要知情确认。TTY 要求同样适用。

### 用户数据策略

五个上游的默认卸载**都不清理用户数据**（Claude 是文档明示的独立可选步骤；
Codex 社区流程明确建议保留；Kimi/Pi/OMP 文档均未提及）。ai-cli-manager 的卸载
第一版应沿用「只移除程序、保留数据」策略。若未来提供「连同数据删除」，应作为
独立的二次确认开关，且注意两个同根陷阱：

- Codex：数据在 `~/.codex`，安装物在 `~/.codex/packages/standalone`，只删子树；
- Kimi：数据与安装同根 `~/.kimi-code`，即使「删数据」也要逐文件处理，不能整目录
  `rm -rf`。

各工具数据目录清单（供未来实现参考）：`~/.claude` + `~/.claude.json`（另有项目级
`.claude`、`.mcp.json`）；`~/.codex`；`~/.kimi-code`（及旧版遗留 `~/.kimi`）；
`~/.pi/agent`（可被 `PI_CODING_AGENT_DIR` 覆盖）；`~/.omp/agent`（另有项目级
`.omp`）。

### 其他

- Codex 安装器可能向 shell profile 写入了 `# >>> Codex installer >>>` 标记块。
  卸载后可提示用户手动检查 profile，不建议自动编辑用户 shell 配置（该区块是否
  可删取决于用户是否还需要 `~/.local/bin` 在 PATH 中）。
- 卸载命令不经过 PATH 中当前生效的二进制自身（与 `updateArgs` 不同），全部是
  对外部包管理器或文件系统的操作，因此不存在「运行中的 exe 锁文件」类问题；
  Windows 删除正在运行的 exe 除外，可在文档中提示先退出相关终端会话。

## 未能从一手来源确认的事项

1. **Codex 没有官方卸载文档。** 上文 standalone 手动流程出自官方仓库的社区
   Discussion，虽路径与标记均已对照安装脚本核实，但 OpenAI 未在正式文档中承诺
   该流程；后续实现前应再查 `docs/` 是否新增卸载章节。
2. **OMP 的所有卸载命令均为推断。** 官方 README、站点、仓库文档均无卸载内容；
   Bun/npm/Homebrew/mise/二进制的移除命令是按安装方式的包管理器对称操作，未获
   OMP 官方确认。mise 卸载的精确语法未核实。
3. **Pi 的 Homebrew 与 standalone 卸载未见官方记载**；`brew uninstall
   pi-coding-agent` 与删除二进制文件是按来源推断的标准操作。
4. **Kimi 的 pnpm 卸载命令未由官方文档记载**（文档只写了 script 与 npm 两种）。
5. 各工具的用户数据目录清单基于研究日源码与文档；「连同数据删除」的具体行为
   （如 Claude 文档警告的扩展/桌面应用重建 `~/.claude`）在实现该功能前需重新
   核实。
6. Kimi/Codex/OMP 的安装脚本是可变 CDN 端点，本文记录了研究日 SHA-256；未来
   脚本可能无公告地变更（例如新增卸载模式），实现前建议重新抓取核对。

## 实际查阅的一手来源

- Claude Code：[官方安装文档（含 Uninstall 一节）](https://code.claude.com/docs/en/installation#uninstall-claude-code)、
  [官方 CLI reference](https://code.claude.com/docs/en/cli-reference)、
  官方 [`install.sh`](https://claude.ai/install.sh)（研究日 SHA-256
  `cde4f1702d3b1695f92b73d26888364e17bca476e17f0fd676484c951d36c125`）
- Codex：官方仓库 main 分支
  [`cli/src/main.rs`](https://github.com/openai/codex/blob/main/codex-rs/cli/src/main.rs)、
  [`docs/install.md`](https://github.com/openai/codex/blob/main/docs/install.md)、
  [`README.md`](https://github.com/openai/codex/blob/main/README.md)、官方
  [`install.sh`](https://chatgpt.com/codex/install.sh) 与
  [`install.ps1`](https://chatgpt.com/codex/install.ps1)（重定向至
  `releases.openai.com`，SHA-256 见正文）、
  [Discussion #34373](https://github.com/openai/codex/discussions/34373)
- Kimi Code：官方仓库 main 分支
  [`apps/kimi-code/src/cli/commands.ts`](https://github.com/MoonshotAI/kimi-code/blob/main/apps/kimi-code/src/cli/commands.ts)、
  [入门文档英文版](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/guides/getting-started.md)与
  [中文版](https://github.com/MoonshotAI/kimi-code/blob/main/docs/zh/guides/getting-started.md)、
  [`packages/migration-legacy/src/paths.ts`](https://github.com/MoonshotAI/kimi-code/blob/main/packages/migration-legacy/src/paths.ts)、
  官方 [`install.sh`](https://code.kimi.com/kimi-code/install.sh) 与
  [`install.ps1`](https://code.kimi.com/kimi-code/install.ps1)（SHA-256 见正文）
- Pi：[官方文档 Quick start（含卸载命令）](https://pi.dev/docs/latest#quick-start)
  （研究日实际抓取，全文检索 uninstall 共 3 处，均在卸载段落）
- OMP：官方仓库 main 分支全树检索（
  [`README.md`](https://github.com/can1357/oh-my-pi/blob/main/README.md)、
  [`src/cli/plugin-cli.ts`](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/cli/plugin-cli.ts)、
  [`src/config.ts`](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/config.ts)）、
  官方 [`install` 脚本](https://omp.sh/install)（SHA-256 见正文）、
  官方站点 `omp.sh` 首页与主 JS bundle 全文检索

## 实现决策补记（2026-08-18）

实现卸载功能时对本研究的两处建议做了有意偏离，经双轴代码审查后裁决记录如下：

1. **OMP 卸载不做来源判定，改为尽力串行。** 本研究建议「卸载前需先判定实际来源
   （如 realpath 命中 `~/.local/bin/omp` 为文件则删文件，否则尝试 bun 卸载）」；
   实现选择无条件串行执行 `bun uninstall -g @oh-my-pi/pi-coding-agent` 与
   `rm -f ~/.local/bin/omp` 两步：单步失败（如 Bun 未安装或 OMP 非 Bun 管理）
   不阻断后续步骤，最终以命令是否从 PATH 消失判定成败。理由：来源检测正是简化
   架构已删除的模块职责（见 `docs/design/simplified-architecture.md`），
   尽力模式 + 事后判据在不重新引入检测的前提下保持诚实。
2. **卸载不覆盖自定义安装目录。** 本研究建议 codex「须尊重传入 env 的
   `CODEX_INSTALL_DIR`/`CODEX_HOME`」；实现只覆盖各官方脚本的默认安装路径
   （kimi 的 `KIMI_INSTALL_DIR`、omp 的 `PI_INSTALL_DIR` 同理）。自定义目录下
   卸载后命令仍在 PATH 中，管理器如实报告失败并提示可能存在其他安装来源；
   README 已声明该排除范围。
