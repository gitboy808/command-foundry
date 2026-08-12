# OMP 安装与更新机制研究

研究日期：2026-08-12  
上游仓库：[`can1357/oh-my-pi`](https://github.com/can1357/oh-my-pi)  
核对提交：[`06aecdd`](https://github.com/can1357/oh-my-pi/tree/06aecdd51f07e689e970ceaa180abe2be0c14bbb)

## 结论

OMP 的命令名是 `omp`，发布包是 `@oh-my-pi/pi-coding-agent`。包元数据把
`omp` 映射到 `src/cli.ts`，并声明 Bun `>=1.3.14`。官方 README 将 Bun 安装标为
推荐方式，但同时提供官方脚本、Homebrew、Windows PowerShell 和 mise 安装方式。

OMP 已内置完善的自更新命令。`omp update` 不只是重新安装 npm 包：它会以 PATH
中当前生效的 `omp` 为准，识别 Homebrew、mise、Bun、npm 或独立二进制安装，再沿
对应方式更新。因此，`ai-cli-manager` 若希望保留 OMP 上游的兼容与迁移逻辑，更新
阶段优先调用 `omp update` 比自行拼接单一包管理器命令更稳妥。

## 官方安装方式

| 来源 | 官方命令 | 备注 |
| --- | --- | --- |
| macOS / Linux 脚本 | `curl -fsSL https://omp.sh/install \| sh` | 脚本默认在可用且架构匹配时使用 Bun，否则安装预编译二进制。 |
| Homebrew | `brew install can1357/tap/omp` | 使用第三方 tap formula。 |
| Bun | `bun install -g @oh-my-pi/pi-coding-agent` | README 标记为推荐；要求 Bun `>=1.3.14`。 |
| Windows | `irm https://omp.sh/install.ps1 \| iex` | 默认有 Bun 时使用 Bun，否则安装预编译二进制。 |
| mise | `mise use -g github:can1357/oh-my-pi` | 用于固定/管理 GitHub release 版本。 |

来源：官方 [README 安装章节](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/README.md#L35-L69)、[包名与 `omp` bin](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/packages/coding-agent/package.json#L1-L32)、[Bun 版本要求](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/packages/coding-agent/package.json#L83-L88)。

### 官方脚本的实际行为

- POSIX 脚本支持 `--source`、`--binary` 和 `--ref`；默认独立二进制目录是
  `${PI_INSTALL_DIR:-$HOME/.local/bin}`。
- POSIX 默认模式不是固定来源：若 Bun 可用且架构匹配，执行 Bun 全局安装；否则
  从 GitHub Releases 下载与 OS、架构、glibc/musl 对应的二进制到
  `$HOME/.local/bin/omp`。
- Windows 脚本默认目录是 `$env:LOCALAPPDATA\omp`，Bun 不可用时下载
  `omp-windows-x64.exe` 并保存为 `omp.exe`。

来源：[`install.sh` 参数和目录](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/scripts/install.sh#L1-L67)、[`install.sh` 默认来源选择](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/scripts/install.sh#L302-L334)、[`install.ps1` 配置](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/scripts/install.ps1#L1-L23)、[`install.ps1` 默认来源选择](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/scripts/install.ps1#L241-L308)。

## 官方更新方式

支持的命令为：

```text
omp update              # 检查并安装最新版
omp update --check      # 只检查，不安装；短参数 -c
omp update --force      # 即使已是最新版也强制重装；短参数 -f
omp update --plugins    # 更新已安装插件；短参数 -l
```

命令及参数直接定义在官方 [`commands/update.ts`](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/packages/coding-agent/src/commands/update.ts#L11-L32)。

更新流程如下：

1. 从官方 npm registry 的
   `https://registry.npmjs.org/@oh-my-pi/pi-coding-agent/latest` 读取最新版和发布分发元数据。
2. 比较当前版本；`--check` 在报告结果后返回，不执行安装。
3. 按 PATH 中生效的 `omp` 识别安装归属：Homebrew、mise、Bun、npm、独立二进制。
4. 沿原来源更新，并在完成后再次运行 `omp --version` 校验目标版本。

对应实现见 [`update-cli.ts` 的来源常量和 registry](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/packages/coding-agent/src/cli/update-cli.ts#L19-L37)、[版本检查与分派](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/packages/coding-agent/src/cli/update-cli.ts#L1321-L1396)。

各来源的具体更新方式是：

- Bun：用官方 registry、禁用缓存并固定 OMP 及原生依赖到同一版本后全局安装。
- npm：用官方 registry，将 OMP 及原生依赖固定到同一版本后全局安装。
- Homebrew：先 `brew update`，再 `brew upgrade can1357/tap/omp`；强制模式改用
  `brew reinstall`。
- mise：`mise upgrade github:can1357/oh-my-pi --bump`；强制模式再执行带版本的
  `mise install --force`。
- 独立二进制：选择 GitHub release 资产，校验下载元数据，替换当前 PATH 对应文件；
  若安装后版本校验失败则回滚旧二进制。

来源：[`update-cli.ts` 的包管理器参数与实现](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/packages/coding-agent/src/cli/update-cli.ts#L994-L1132)、[二进制原子替换与回滚](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/packages/coding-agent/src/cli/update-cli.ts#L927-L992)。

## 对 ai-cli-manager 集成的影响

### 可以直接复用的部分

- `command: "omp"` 与 `versionArgs: ["--version"]` 能复用现有版本提取器；上游输出格式
  是 `omp/X.Y.Z`。
- 独立二进制可用 `$HOME/.local/bin/omp` 作为 POSIX 官方安装标记；Windows 可识别
  `%LOCALAPPDATA%\omp\omp.exe`，但现有 marker 只按 home 拼接，不能直接表达
  `LOCALAPPDATA`。
- Homebrew 定义可使用 formula `can1357/tap/omp`。
- 最新版可读取 npm registry `latest` JSON 的 `version` 字段。
- 更新命令可配置为 `omp update`；`omp update --check` 也可作为未来的只读检查能力，
  但当前输出不是稳定的 JSON 协议。

### 现有模型不能完整表达的部分

1. `Source` 只有 `official | npm | homebrew | unknown`，没有 Bun 和 mise。
2. `ToolDefinition` 强制每个工具同时声明 npm、Homebrew、官方安装器，且安装来源可用性
   会固定展示三类来源，不能表达“该工具不支持此来源”或 OMP 的额外来源。
3. 官方脚本默认可能落成 Bun 安装，但当前 `ScriptStep` 不能向脚本传 `--binary`。
   若直接执行默认脚本，安装结果可能无法被现有 npm/Homebrew/official detector 识别。
4. 当前自更新命令只用于 `official` 来源；npm 和 Homebrew 来源会被
   `ai-cli-manager` 改用各自包管理器更新。OMP 的 `omp update` 包含来源识别、原生依赖
   同版本安装、未来二进制分发迁移、安装后校验和回滚，直接绕开会丢失这些保护。
5. 上游包虽发布在 npm registry，也有 npm 更新分支，但 README 推荐 Bun，包的 engine
   声明也是 Bun。不能因为现有模型要求 `npmPackage` 就默认把 npm 当作首选安装体验。

## 后续设计决策

实现前需要先确定三个范围问题：

1. 第一版只支持官方独立二进制 + Homebrew，还是完整加入 Bun 和 mise 来源？
2. OMP 所有已识别来源是否统一委托 `omp update`，还是继续由
   `ai-cli-manager` 自己运行包管理器？基于上游实现，前者更能保留兼容性保护。
3. 官方安装是否必须固定为独立二进制？若是，需要让 `ScriptStep` 支持参数并执行
   `install --binary`，否则安装结果随本机 Bun 状态变化。
