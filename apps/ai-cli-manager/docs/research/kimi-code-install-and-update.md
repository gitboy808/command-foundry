# Kimi Code 安装与更新机制研究

研究日期：2026-08-12  
当前上游仓库：[`MoonshotAI/kimi-code`](https://github.com/MoonshotAI/kimi-code)  
当前上游核对提交：[`35d9a36`](https://github.com/MoonshotAI/kimi-code/tree/35d9a36a6982bffd038127d642a5ab9ffdbd0626)  
旧版上游仓库：[`MoonshotAI/kimi-cli`](https://github.com/MoonshotAI/kimi-cli)  
旧版上游核对提交：[`cbc15c0`](https://github.com/MoonshotAI/kimi-cli/tree/cbc15c076d17f70fec9f89c90c0502e68657f505)

## 结论

当前 Kimi Code 的 canonical npm 包是 `@moonshot-ai/kimi-code`，命令是 `kimi`；
`apps/kimi-code/package.json` 同时声明 Moonshot AI、官方仓库目录和 Node.js
`>=22.19.0`。npm 上未加 scope 的 `kimi-cli@0.0.2` 是另一位作者在 2018 年发布的
前端工具，且没有 `bin` 字段，**不是** Moonshot 的旧版 Kimi CLI，也不能作为迁移
识别依据。来源：当前上游的
[`package.json`](https://github.com/MoonshotAI/kimi-code/blob/35d9a36a6982bffd038127d642a5ab9ffdbd0626/apps/kimi-code/package.json#L1-L35)、
[`@moonshot-ai/kimi-code` registry 元数据](https://registry.npmjs.org/@moonshot-ai%2fkimi-code/latest)、
[`kimi-cli` registry 元数据](https://registry.npmjs.org/kimi-cli/latest)。

真正的旧版官方产品是 Python/PyPI 包 `kimi-cli`，由 `MoonshotAI/kimi-cli` 维护，
同时提供 `kimi` 和 `kimi-cli` 两个入口。它正在被 TypeScript 版 Kimi Code 替代；
旧仓库已明确建议新用户安装新产品，并说明安装后可迁移配置和会话。来源：旧版
[`pyproject.toml`](https://github.com/MoonshotAI/kimi-cli/blob/cbc15c076d17f70fec9f89c90c0502e68657f505/pyproject.toml#L1-L6)、
[`project.scripts`](https://github.com/MoonshotAI/kimi-cli/blob/cbc15c076d17f70fec9f89c90c0502e68657f505/pyproject.toml#L73-L75)、
旧版[安装文档](https://github.com/MoonshotAI/kimi-cli/blob/cbc15c076d17f70fec9f89c90c0502e68657f505/docs/en/guides/getting-started.md#L25-L60)。

## 当前 Kimi Code 的安装方式

| 来源 | 平台与官方命令 | 实际行为 |
| --- | --- | --- |
| 官方原生安装器（推荐） | macOS / Linux：`curl -fsSL https://code.kimi.com/kimi-code/install.sh \| bash`；Windows：`irm https://code.kimi.com/kimi-code/install.ps1 \| iex` | 下载当前平台的单文件二进制，校验 SHA-256，并安装到 Kimi 自有目录；无需预装 Node.js。 |
| npm | `npm install -g @moonshot-ai/kimi-code` | 要求 Node.js `>=22.19.0`。 |
| pnpm | `pnpm add -g @moonshot-ai/kimi-code` | 官方入门文档列出的 npm 兼容安装方式。 |
| Homebrew | `brew install kimi-code` | `homebrew/core` 的第三方分发；上游更新实现提示该 formula 可能落后于官方版本。 |

官方 README 和入门文档将原生安装器列为推荐方式，并把 npm/pnpm 作为另一类安装
方式。来源：官方 [README](https://github.com/MoonshotAI/kimi-code/blob/35d9a36a6982bffd038127d642a5ab9ffdbd0626/README.md#L12-L36)、
[入门文档](https://github.com/MoonshotAI/kimi-code/blob/35d9a36a6982bffd038127d642a5ab9ffdbd0626/docs/en/guides/getting-started.md#L15-L54)。
Homebrew formula 的名称、来源 tarball 和版本见
[`formulae.brew.sh` 官方元数据](https://formulae.brew.sh/api/formula/kimi-code.json)。

### 官方原生安装器的细节

- POSIX 默认根目录是 `${KIMI_INSTALL_DIR:-$HOME/.kimi-code}`，最终文件为
  `~/.kimi-code/bin/kimi`；Windows 默认根目录是 `%USERPROFILE%\.kimi-code`，最终
  文件为 `.kimi-code\bin\kimi.exe`。安装器会把该 `bin` 目录加入 PATH。
- POSIX 支持 x64/arm64 的 macOS 和 glibc Linux；脚本会拒绝 musl Linux，并建议
  改用 npm。Windows 脚本识别 x64/arm64 等目标，具体是否有资产仍由 manifest 决定。
- 两个平台都先读取纯文本 `https://code.kimi.com/kimi-code/latest`，再读取
  `binaries/<version>/manifest.json`，下载 manifest 指定的文件并校验 SHA-256。
- POSIX 可用 `KIMI_VERSION` 或 `--version` 固定版本，Windows 可用
  `KIMI_VERSION`；两者均支持 `KIMI_INSTALL_DIR` 和 `KIMI_NO_MODIFY_PATH`。
- 重跑安装器会覆盖同一目标，也就是官方原生安装的可脚本化更新方式；覆盖前会保留
  `.bak`。POSIX 使用 `install -m 0755`，Windows 为适应运行中的 exe，先重命名旧
  文件再复制新文件。

来源：实时官方 [`install.sh`](https://code.kimi.com/kimi-code/install.sh) 和
[`install.ps1`](https://code.kimi.com/kimi-code/install.ps1)。这些 CDN 脚本不是仓库内
固定文件，因此本研究按 2026-08-12 实际响应核对；后续实现时应重新检查。

## 当前 Kimi Code 的更新方式

`kimi upgrade` 是主命令，`kimi update` 是完全相同的 Commander alias。来源：固定提交
中的[命令注册](https://github.com/MoonshotAI/kimi-code/blob/35d9a36a6982bffd038127d642a5ab9ffdbd0626/apps/kimi-code/src/cli/commands.ts#L123-L130)。

该命令先请求 CDN 最新版，忽略被动更新的渐进 rollout 限制，然后按当前运行实例的
来源生成更新方式。上游能识别 `npm-global`、`pnpm-global`、`yarn-global`、
`bun-global`、Homebrew、原生二进制和 unsupported；对应方式分别为原包管理器安装
固定目标版本、`brew upgrade kimi-code`，或重跑官方原生脚本。来源：
[来源模型与识别](https://github.com/MoonshotAI/kimi-code/blob/35d9a36a6982bffd038127d642a5ab9ffdbd0626/apps/kimi-code/src/cli/update/source.ts#L40-L66)、
[更新命令映射](https://github.com/MoonshotAI/kimi-code/blob/35d9a36a6982bffd038127d642a5ab9ffdbd0626/apps/kimi-code/src/cli/update/preflight.ts#L68-L106)。

### TTY 与非 TTY 的真实语义

- 同时满足 `stdin.isTTY && stdout.isTTY`、来源可自动安装且存在新版本时，
  `kimi upgrade` / `kimi update` 会显示选择提示；用户选择安装后才执行更新。
- 非 TTY 时命令**不会安装**，只输出检测到的来源和应手动运行的更新命令，并以成功
  状态返回。这意味着不能把 `kimi update` 直接当成 `ai-cli-manager --update` 的
  无人值守更新步骤。
- Homebrew、Windows 原生安装以及无法识别的布局即使在 TTY 中也只显示手动命令；
  Unix 原生安装可在确认后自动重跑脚本。
- 若检查失败返回 `1`；已经是最新版返回 `0`；交互安装失败也返回 `1`。

这些行为直接定义在
[`handleUpgrade`](https://github.com/MoonshotAI/kimi-code/blob/35d9a36a6982bffd038127d642a5ab9ffdbd0626/apps/kimi-code/src/cli/sub/upgrade.ts#L51-L101)、
[TTY 判定](https://github.com/MoonshotAI/kimi-code/blob/35d9a36a6982bffd038127d642a5ab9ffdbd0626/apps/kimi-code/src/cli/sub/upgrade.ts#L175-L187)，
并由[非交互测试](https://github.com/MoonshotAI/kimi-code/blob/35d9a36a6982bffd038127d642a5ab9ffdbd0626/apps/kimi-code/test/cli/upgrade.test.ts#L160-L173)锁定。

### 最新版接口

- `https://code.kimi.com/kimi-code/latest`：纯文本 semver；安装脚本和更新逻辑的兼容
  fallback，也是 `ai-cli-manager` 当前最适合读取的端点。
- `https://code.kimi.com/kimi-code/latest.json`：包含 `version`、`publishedAt` 和渐进
  `rollout`；当前客户端优先读取它，失败后回退到纯文本 `/latest`。
- `https://registry.npmjs.org/@moonshot-ai%2fkimi-code/latest`：npm 来源的最新版元数据。

来源：上游的 [CDN 常量](https://github.com/MoonshotAI/kimi-code/blob/35d9a36a6982bffd038127d642a5ab9ffdbd0626/apps/kimi-code/src/constant/app.ts#L80-L86)和
[fallback 实现](https://github.com/MoonshotAI/kimi-code/blob/35d9a36a6982bffd038127d642a5ab9ffdbd0626/apps/kimi-code/src/cli/update/cdn.ts#L48-L96)。

## 旧版官方 Python `kimi-cli`

旧版跨平台脚本 `https://code.kimi.com/install.sh` / `install.ps1` 会先安装 uv，再运行
`uv tool install --python 3.13 kimi-cli`；已有 uv 时也可直接运行该命令。官方更新方式
是 `uv tool upgrade kimi-cli --no-cache`，卸载方式是 `uv tool uninstall kimi-cli`。
PyPI 元数据显示包要求 Python `>=3.12`。来源：旧版
[入门文档](https://github.com/MoonshotAI/kimi-cli/blob/cbc15c076d17f70fec9f89c90c0502e68657f505/docs/en/guides/getting-started.md#L25-L75)、
[POSIX 安装脚本](https://github.com/MoonshotAI/kimi-cli/blob/cbc15c076d17f70fec9f89c90c0502e68657f505/scripts/install.sh#L1-L31)、
[Windows 安装脚本](https://github.com/MoonshotAI/kimi-cli/blob/cbc15c076d17f70fec9f89c90c0502e68657f505/scripts/install.ps1#L1-L26)、
[PyPI 元数据](https://pypi.org/pypi/kimi-cli/json)。

`homebrew/core` 仍有旧版 `kimi-cli` formula，但官方元数据已标记 deprecated；它从
PyPI `kimi_cli` 源码包构建，所以这是旧版官方产品的分发，不是 npm 上的同名包。
来源：[`kimi-cli` formula 元数据](https://formulae.brew.sh/api/formula/kimi-cli.json)。

旧版源码还包含另一条自更新实现：从 Moonshot CDN 下载预编译 tarball 到
`~/.local/bin/kimi`；但普通包管理器安装的用户提示仍以
`uv tool upgrade kimi-cli` 为主。该实现和当前 TypeScript Kimi Code 的
`kimi upgrade` 不是同一套协议。来源：旧版
[`update.py`](https://github.com/MoonshotAI/kimi-cli/blob/cbc15c076d17f70fec9f89c90c0502e68657f505/src/kimi_cli/ui/shell/update.py#L24-L37)、
[下载与覆盖逻辑](https://github.com/MoonshotAI/kimi-cli/blob/cbc15c076d17f70fec9f89c90c0502e68657f505/src/kimi_cli/ui/shell/update.py#L224-L337)。

## 从旧版迁移到当前 Kimi Code

当前官方 `install.sh` / `install.ps1` 会扫描 PATH 上的 `kimi`，只把目标文件中含有
Python 模块标记 `kimi_cli` 的入口识别为旧版：第一个可操作入口重命名为
`kimi-legacy`，后续重复入口删除，以免遮蔽新命令；权限不足或会破坏用户自有文件时
有保护分支。这说明“重跑官方安装器能够迁移 legacy Python shim”是有明确识别条件
的结论，不能推广成“任何来源不明的 `kimi` 都会被安全迁移”。来源：实时官方
[`install.sh`](https://code.kimi.com/kimi-code/install.sh) 与
[`install.ps1`](https://code.kimi.com/kimi-code/install.ps1)。

安装命令迁移完成后，产品数据迁移是另一阶段：首次启动会检测 `~/.kimi/` 并提示，
也可运行 `kimi migrate`；可迁移配置、MCP、输入历史和会话，但不复制 OAuth/MCP
授权，也不迁移旧插件，且不会修改或删除旧数据。来源：官方
[迁移文档](https://github.com/MoonshotAI/kimi-code/blob/35d9a36a6982bffd038127d642a5ab9ffdbd0626/docs/en/guides/migration.md#L16-L38)和
[源/目标路径定义](https://github.com/MoonshotAI/kimi-code/blob/35d9a36a6982bffd038127d642a5ab9ffdbd0626/packages/migration-legacy/src/paths.ts#L3-L25)。

## 对当前 `ai-cli-manager` 实现的审查

| 当前定义/行为 | 判断 | 依据与建议 |
| --- | --- | --- |
| `npmPackage: "@moonshot-ai/kimi-code"` | 准确 | 是当前官方 npm 包和 `kimi` bin 的 owner。 |
| `legacyNpmPackages: ["kimi-cli"]` | **不准确，应删除** | npm `kimi-cli` 是无 `bin` 的第三方前端工具；官方 legacy 是 PyPI/uv 包，不是 npm 包。保留该定义会混淆产品身份，即便当前 detector 因其无 `bin` 通常不会把它识别为有效安装。 |
| `legacyHomebrewPackages: ["kimi-cli"]` | 准确 | Homebrew 公式来自官方 Python/PyPI 包且已 deprecated，适合标记为待迁移来源。 |
| `official.update: "script"` | 对无人值守更新是准确选择 | 官方原生安装器可幂等覆盖当前 native binary；`kimi update` 在非 TTY 中只打印命令而不安装，所以不适合直接替换脚本。npm/Homebrew 来源继续由对应包管理器更新也符合上游映射。 |
| `latestUrls: ["https://code.kimi.com/kimi-code/latest"]` | 准确 | 这是稳定的纯文本 semver 端点，官方安装器和客户端 fallback 都使用它。 |
| `markers: [".kimi-code/bin/kimi"]` | POSIX 准确，Windows 需测试确认 | 官方默认 POSIX 文件正是该路径；Windows 实际文件是 `kimi.exe`。当前 detector 是否自动补 `.exe` 决定 Windows marker 能否命中，建议保留 Windows 回归测试。自定义 `KIMI_INSTALL_DIR` 不在该 marker 能力内。 |
| Kimi 的 `source_unknown` / `version_unknown` 允许“重新安装” | **只在窄条件下准确** | 对 PATH 上可识别为 Python `kimi_cli` shim 的旧版，官方安装器会迁移并避免遮蔽；对任意第三方/自定义 `kimi`，安装器不会把它当 legacy，当前 shell 的 PATH 也不会自动刷新。因此 UI 文案应明确这是“使用官方安装器安装/尝试迁移旧版”，不能承诺修复所有未知来源。 |

一个额外缺口是：当前 detector 只建模 npm、Homebrew 和固定官方 marker，不能完整表达
上游 `kimi upgrade` 已识别的 pnpm、Yarn、Bun 及自定义安装布局。因此，PATH 上实际由
这些来源生效的 Kimi 仍可能被标记为来源不明；这应在加入 OMP 时一并纳入来源能力
模型，而不是继续增加工具特例。

## 未确认项

1. `code.kimi.com` 上的安装脚本没有在 `MoonshotAI/kimi-code` 固定提交中找到同路径
   的版本化副本；本文引用的是研究日期当天的官方 CDN 响应，未来可能无提交记录地变化。
2. 官方文档未把 Homebrew 列为首选安装入口；formula 属 `homebrew/core`，且 Kimi
   源码明确把它视为可能落后于官方 release 的第三方来源。
3. 未在真实 Windows 主机上执行安装器；`kimi.exe` marker、PowerShell 5.1 和运行中
   exe 替换语义仅按官方脚本与源码核对。
4. 未对自定义 `KIMI_INSTALL_DIR`、多个 npm/pnpm/Bun 全局目录共存或 PATH 动态变化
   做端到端实验；这些情况需要实现阶段用隔离 HOME/PATH 的测试覆盖。
