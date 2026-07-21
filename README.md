# Command Foundry

> 实用工具，一条命令即可使用。

Command Foundry 是一个面向开发者的开源命令行工具集合，专注于提供实用、
可靠且适合自动化的 CLI。每个工具独立维护和发布，同时遵循一致的终端交互、
配置处理与质量标准。

## 工具列表

| 工具 | 说明 | 状态 |
| --- | --- | --- |
| [codex-skills](./apps/codex-skills) | 通过交互式界面启用或禁用本地 Codex 技能 | 开发中 |

## 项目结构

```text
command-foundry/
├── apps/                 # 可以独立运行和发布的 CLI 工具
│   └── codex-skills/
├── packages/             # 多个工具共享的基础库（按需添加）
└── README.md
```

每个 `apps/<tool>` 目录都是一个相对独立的项目，包含自己的依赖、测试、构建配置
和使用文档。只有在多个工具产生稳定的共同需求后，才会将公共代码提取到
`packages/`，避免过早增加共享抽象。

## 开发

当前工具使用 Node.js 和 TypeScript。开发 `codex-skills` 需要 Node.js 20.17
或更高版本：

```bash
cd apps/codex-skills
npm install
npm test
npm run build
```

构建并建立本地命令链接：

```bash
npm link
codex-skills --list
```

具体用法和交互说明请参阅
[apps/codex-skills/README.md](./apps/codex-skills/README.md)。

## 命令行约定

Command Foundry 中的工具应尽量遵循以下约定：

- 提供 `--help` 和 `--version`。
- 正常结果写入标准输出，错误信息写入标准错误。
- 正常结束返回退出码 `0`，执行失败返回非零退出码。
- 涉及文件或配置修改时，优先提供预览、确认或 `--dry-run` 能力。
- 非交互环境中不依赖终端菜单或动画。
- 修改重要配置时采用校验、并发保护和原子写入。
- 每个 CLI 具备独立测试、版本和变更记录。

## 参与项目

欢迎通过 Issue 提交工具建议、缺陷报告和设计讨论。新增 CLI 前，应明确它解决的
具体问题、目标用户、命令接口和自动化使用场景，并保持工具职责单一。
