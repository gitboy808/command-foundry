# 仓库贡献指南

## 项目结构与模块组织

Command Foundry 是一组独立维护的 CLI 工具。应用放在 `apps/<tool>/`；只有多个工具形成稳定的共同需求后，才在 `packages/` 中提取共享库。

当前应用为 `apps/codex-skills`：

- `src/cli.ts`：参数解析和终端交互。
- `src/config.ts`：读取并安全更新 Codex TOML 配置。
- `src/skills.ts`：发现和解析技能清单。
- `src/types.ts`：共享 TypeScript 类型。
- `test/**/*.test.ts`：Node.js 测试。
- `dist/`：构建产物，不应提交。

每个 CLI 的依赖、测试、配置和 README 应保留在其应用目录内。

## 构建、测试与开发命令

以下命令在 `apps/codex-skills` 中执行，需要 Node.js 20.17 或更高版本：

- `npm ci`：按锁文件安装依赖。
- `npm run dev -- --list`：直接运行 TypeScript 源码。
- `npm test`：运行 `test/**/*.test.ts` 中的全部测试。
- `npm run build`：类型检查并编译到 `dist/`。
- `npm start -- --list`：运行编译后的 CLI。
- `npm link`：在本机链接 `codex-skills`，便于手动测试交互。

## 编码风格与命名

使用严格模式 TypeScript 和 ES 模块。遵循现有格式：两空格缩进、双引号、分号、多行结构保留尾逗号。重要函数应声明返回类型。变量和函数使用 `camelCase`，类型使用 `PascalCase`，测试文件使用 `*.test.ts`。源码中的本地导入路径使用 `.js` 后缀。

面向用户和贡献者的说明、帮助、错误提示、测试描述及必要注释优先使用简体中文；命令参数、代码标识符和外部协议字段保持原文。目前未配置格式化或 lint 工具，提交前以 `npm run build` 进行静态检查。

## 测试规范

使用 `node:test` 和 `node:assert/strict`。测试应覆盖可观察行为、失败路径、文件系统边界情况以及用户配置的完整保留。涉及配置写入时必须使用临时目录，禁止读写开发者真实的 `~/.codex` 数据。提交前运行 `npm test` 和 `npm run build`。当前没有强制覆盖率指标。

## 提交与拉取请求

仓库尚无提交历史。提交标题应简短、使用祈使句并可带作用域，例如 `codex-skills: 拒绝覆盖已变更的配置`。每个提交只处理一个明确主题。拉取请求应说明用户可见的变化、列出验证命令并关联 Issue；交互界面有变化时附终端输出或截图；配置格式或兼容性变化需明确标注。

## 配置安全

保留 TOML 中的注释和无关设置，不得削弱原子写入及并发修改检测。只读模式不得产生副作用。
