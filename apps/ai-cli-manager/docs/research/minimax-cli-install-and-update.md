# MiniMax CLI（mmx-cli）安装与更新机制研究

研究日期：2026-08-17  
官方文档（中文站）：[platform.minimaxi.com/docs/token-plan/minimax-cli](https://platform.minimaxi.com/docs/token-plan/minimax-cli)  
官方文档（国际站）：[platform.minimax.io/docs/token-plan/minimax-cli](https://platform.minimax.io/docs/token-plan/minimax-cli)  
上游仓库：[`MiniMax-AI/cli`](https://github.com/MiniMax-AI/cli)  
源码核对提交：[`ad234508`](https://github.com/MiniMax-AI/cli/tree/ad234508b05938738872c5134e0d474706d89907)（tag `v1.0.19`，与 npm latest `1.0.19` 对应）

## 结论摘要

MiniMax 官方 CLI 的产品名是 **MiniMax CLI / MMX-CLI**，npm 包名是 **`mmx-cli`**，
CLI 命令名是 **`mmx`**。注意：官方文档页面的 URL slug 是 `minimax-cli`，但 npm 上的
[`minimax-cli`](https://registry.npmjs.org/minimax-cli) 包（latest `0.0.2`，命令
`minimax`，maintainer 为个人账号 `dakkshin`，无仓库链接）**不是**官方产品，接入时必须
使用 `mmx-cli` / `mmx`。

来源：官方[中文站文档](https://platform.minimaxi.com/docs/token-plan/minimax-cli)、
[国际站文档](https://platform.minimax.io/docs/token-plan/minimax-cli)、npm 官方 registry
[`mmx-cli`](https://registry.npmjs.org/mmx-cli) 与
[`minimax-cli`](https://registry.npmjs.org/minimax-cli)。

安装只有一条官方路径：`npm install -g mmx-cli`，没有独立安装脚本，也没有 Windows 独立
安装方式。运行时要求 Node.js `>=18`，包 metadata 不限制操作系统。

`mmx` 有 `update` 子命令，但在当前版本 `1.0.19` 中它**不执行任何更新**：只打印当前版本
并提示用户手动运行 `npm update -g mmx-cli`。官方文档表格中
「`mmx update` / `mmx update latest`：检查更新 / 升级到最新版」的描述与该提交的实现
不一致——`mmx update latest` 中的位置参数会被忽略，行为与 `mmx update` 完全相同。

没有原生卸载命令，官方文档与仓库均未记载卸载流程；按 npm 惯例
`npm uninstall -g mmx-cli` 即可移除程序本身，但用户数据目录 `~/.mmx/`（含登录凭据）
不会被清理。

## 身份、命令、版本与 canonical 包

| 项目 | 当前事实 |
| --- | --- |
| 产品 | MiniMax CLI / MMX-CLI（"The official CLI for the MiniMax AI Platform"） |
| 官方站点 | `https://platform.minimaxi.com`（国内）/ `https://platform.minimax.io`（国际） |
| 官方仓库 | `https://github.com/MiniMax-AI/cli`（旧名 `MiniMax-AI-Dev/minimax-cli` 重定向至此） |
| canonical 包 | `mmx-cli`（latest `1.0.19`，创建于 2026-04-08） |
| CLI 命令 | `mmx`（`bin` 映射到 `dist/mmx.mjs`） |
| 版本命令 | `mmx --version` / `mmx -v`，输出形如 `mmx 1.0.19` |
| 许可证 | MIT（README 声明；package.json 无 `license` 字段） |

来源：固定提交的
[`package.json`](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/package.json)
（`bin`/`engines` 见 L14-L19）、npm 官方 registry
[`mmx-cli`](https://registry.npmjs.org/mmx-cli)、仓库
[README](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/README.md)。

旧仓库名 `MiniMax-AI-Dev/minimax-cli` 现在通过 GitHub 重定向解析到 `MiniMax-AI/cli`
（API 返回的 `full_name` 已是 `MiniMax-AI/cli`）。源码中更新检查仍引用旧名，但因重定向
而能正常工作。来源：固定提交的
[`checker.ts` L8](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/src/update/checker.ts#L8)、
GitHub API `https://api.github.com/repos/MiniMax-AI-Dev/minimax-cli`。

`mmx --version`（或 `-v`）在解析任何子命令之前直接打印 `mmx <版本>` 并退出，版本号取自
打包时内嵌的 `package.json` 的 `version` 字段。来源：固定提交的
[`main.ts` L39-L42](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/src/main.ts#L39-L42)、
[`version.ts`](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/src/version.ts)。

## 官方安装方式

### npm：唯一官方安装入口

中文站、国际站文档与仓库 README 给出的唯一 CLI 安装命令均为：

```bash
npm install -g mmx-cli
```

来源：官方[中文站文档「手动安装」](https://platform.minimaxi.com/docs/token-plan/minimax-cli)、
[国际站文档](https://platform.minimax.io/docs/token-plan/minimax-cli)、固定提交的
[README「Install」](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/README.md)、
[README_CN「安装」](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/README_CN.md)。

文档另有一条面向 Agent 的配套命令 `npx skills add MiniMax-AI/cli -y -g`，它安装的是官方
SKILL.md（symlink 到 `~/.claude/skills/` 等目录），**不是** CLI 本体；终端直接使用 `mmx`
的用户可跳过。来源：同上官方文档「安装 SKILL」一节。

没有发现任何独立安装脚本（`install.sh`/`install.ps1`），包也没有 install/postinstall
生命周期脚本（`scripts` 仅含 `prepublishOnly` 等开发脚本），因此 npm 安装即全部。
来源：固定提交的
[`package.json`](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/package.json)。

### Windows

文档未给出 Windows 独立安装方式；npm 全局安装就是跨平台安装方式。包 metadata 没有
`os`/`cpu` 限制，发布物是纯 JavaScript bundle（`dist/mmx.mjs`），由 Node.js 执行。
来源：npm 官方 registry [`mmx-cli`](https://registry.npmjs.org/mmx-cli)、固定提交的
[`package.json`](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/package.json)。

注：源码中存在一套从 GitHub Releases 下载独立二进制的自更新实现
（`src/update/self-update.ts`），其平台检测只覆盖 darwin/linux；但该模块在当前提交只被
测试文件引用，未接入任何 CLI 命令，且当前 release 不含二进制资产（latest release
`v1.0.19` 的 assets 为空），属于未启用的遗留代码。来源：固定提交的
[`self-update.ts` L28-L49](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/src/update/self-update.ts#L28-L49)、
GitHub API `https://api.github.com/repos/MiniMax-AI/cli/releases/latest`。

## `mmx update` 的准确语义

当前提交（v1.0.19）中 `mmx update` 的完整实现是：

```text
Current version: <当前版本>

Run:
  npm update -g mmx-cli
```

即：**只打印指引，不检查远端版本，也不执行更新**。命令的 `run()` 不接收参数，因此
`mmx update latest` 与 `mmx update` 行为一致。`update` 被列在免鉴权命令清单中，执行前
不需要登录。来源：固定提交的
[`commands/update.ts`](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/src/commands/update.ts)、
[`main.ts` 的 NO_AUTH_SETUP L27-L34](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/src/main.ts#L27-L34)。

两个官方文档站点的「更多运维命令」表格都写着
「`mmx update` / `mmx update latest`：检查更新 / 升级到最新版」，README 同样列出
`mmx update` 与 `mmx update latest` 两种写法。这是文档描述与 v1.0.19 实现之间的落差，
应以源码为准：**当前没有任何能真正完成自更新的原生命令**，实际更新路径是用户自行执行
`npm update -g mmx-cli`（或等价的 `npm install -g mmx-cli@latest`）。
来源：官方[中文站文档](https://platform.minimaxi.com/docs/token-plan/minimax-cli)、
[国际站文档](https://platform.minimax.io/docs/token-plan/minimax-cli)、固定提交的
[README](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/README.md)。

### 后台更新检查（提示，不更新）

每次执行任意命令后，CLI 会异步查询
`https://api.github.com/repos/MiniMax-AI-Dev/minimax-cli/releases/latest`（经重定向到
`MiniMax-AI/cli`），若有更新版则在 stderr 提示
`Update available: vX.Y.Z` 和 `npm update -g mmx-cli`。CI 环境或非 TTY 时跳过；结果缓存
在 `~/.mmx/update-state.json`，24 小时内不重复查询。来源：固定提交的
[`checker.ts` L30-L45](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/src/update/checker.ts#L30-L45)、
[`checker.ts` L53-L55](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/src/update/checker.ts#L53-L55)、
[`main.ts` L109-L118](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/src/main.ts#L109-L118)。

## 卸载

没有原生卸载子命令（命令注册表中无 uninstall），仓库全部文档与源码中也检索不到
"uninstall" 字样，即官方未记载任何卸载流程。按 npm 全局包的惯例：

```bash
npm uninstall -g mmx-cli
```

该命令只移除程序本身。用户数据目录 `~/.mmx/`（`config.json` 中的 API key / OAuth 凭据、
`update-state.json` 等）不会被清理，可用 `MMX_CONFIG_DIR` 改位置。
`mmx auth logout` 只清除 `config.json` 中的凭据字段，不删除目录。若需彻底卸载，需再手动
删除 `~/.mmx/`——这一步没有官方文档背书。来源：固定提交的
[`registry.ts`](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/src/registry.ts)、
[`paths.ts` L6-L9](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/src/config/paths.ts#L6-L9)、
[`auth/logout.ts`](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/src/commands/auth/logout.ts)、
固定提交全仓检索（该提交源码与文档中无 "uninstall" 匹配）。

## 平台支持与 Node.js 要求

- Node.js 下限：`engines.node >= 18`，README 同样写明 "Requires Node.js 18+"。
- 操作系统：包 metadata 无 `os`/`cpu` 限制，官方文档也没有平台矩阵；npm 安装在哪里的
  Node 18+ 上能用，`mmx` 就能在哪里运行（源码中仅 OAuth 打开浏览器一处对 `win32` 有
  分支处理）。

来源：固定提交的
[`package.json` L14-L16](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/package.json#L14-L16)、
[README](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/README.md)、
[`oauth.ts` L129](https://github.com/MiniMax-AI/cli/blob/ad234508b05938738872c5134e0d474706d89907/src/auth/oauth.ts#L129)。

## 对 `ai-cli-manager` 当前实现的影响

### 建议的 catalog 条目

[`catalog.ts`](../../src/catalog.ts) 现有模型（`install` 支持 npm command step，
`updateArgs` 会被拼成 `<command> <updateArgs>` 执行，见
[`manager.ts`](../../src/manager.ts) L81-L85）下，建议条目：

```ts
{
  id: "mmx",
  label: "MiniMax CLI",
  command: "mmx",
  versionArgs: ["--version"],
  install: {
    unix: { kind: "command", program: "npm", args: ["install", "-g", "mmx-cli"] },
    win32: { kind: "command", program: "npm", args: ["install", "-g", "mmx-cli"] },
  },
  updateArgs: ["update"],
}
```

### 必须注意的语义落差

1. **`updateArgs: ["update"]` 在当前上游版本不会真正更新。** v1.0.19 的 `mmx update`
   只打印「Run: npm update -g mmx-cli」并以 0 退出；管理器若把它当自更新命令执行，
   会报告更新成功而版本实际未变。这一点与 catalog 中其他四个工具（自更新命令真实生效）
   有本质差别。在管理器支持「npm 安装的工具用 npm 命令更新」之前，更诚实的临时做法是
   接受这个落差并在 UI 注明，或对该工具禁用自动更新、只给出
   `npm update -g mmx-cli` 的手动指引。
2. **不需要 `--ignore-scripts`。** 与 Pi 不同，`mmx-cli` 没有 lifecycle scripts，官方
   命令就是裸 `npm install -g mmx-cli`；加不加该 flag 与上游要求无关，按项目自身供应链
   策略决定。
3. **版本解析兼容。** `mmx --version` 输出 `mmx 1.0.19`，
   [`manager.ts`](../../src/manager.ts) L71-L73 的 `extractVersion` 正则可以正确提取
   `1.0.19`。
4. **id 用 `mmx` 而非 `minimax`。** 避免与 npm 上第三方 `minimax-cli` 包（命令
   `minimax`）混淆；label 用官方产品名 "MiniMax CLI"。
5. **卸载不在当前模型中。** 若未来支持卸载：`npm uninstall -g mmx-cli` 只移除程序；
   `~/.mmx/` 凭据目录需另行提示用户（官方无文档背书自动清理）。
6. **Node.js 下限不在当前模型中。** `engines.node >= 18` 无法用脚本安装器交互兜底
   （本工具根本没有官方脚本），npm install 在 Node < 18 上会直接报 EBADENGINE 类警告/
   错误；可在 source availability 中预检并给出中文原因。

## 未确认事项

- `mmx update latest` 在官方文档中被描述为「升级到最新版」，但 v1.0.19 源码中它只是
  打印指引。无法从一手来源确认这是「尚未实现的承诺」还是文档滞后；后续版本若接入了
  `src/update/self-update.ts` 那套机制，更新语义会改变，接入前应重新核对最新
  `commands/update.ts`。
- 官方文档未给出支持的操作系统清单（只有 Node 18+ 要求）；「Windows 可用 npm 安装」是
  从包 metadata 无平台限制推断，而非官方明示。
- 卸载后是否应删除 `~/.mmx/` 无任何官方说法；上面的卸载步骤中删目录一节是按惯例推断。
- 仓库 `v0.x` 阶段曾以 `MiniMax-AI-Dev/minimax-cli` 名义发布过带 manifest 的独立二进制
  （`self-update.ts` 与 tag `v0.1.0`–`v0.4.3` 可佐证）；该分发形态当前是否仍被官方视为
  受支持的安装来源，没有文档说明。
- npm 上第三方 `minimax-cli` 包与 MiniMax 官方无任何可见关联（无仓库链接、个人
  maintainer）；如官方日后启用该包名，需重新核对。
