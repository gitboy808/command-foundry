#!/usr/bin/env node
import { checkbox, confirm, select } from "@inquirer/prompts";
import {
  createCliManager,
  type Action,
  type ActionResult,
  type CliManager,
  type InstallSource,
  type ToolStatus,
} from "./manager.js";

const VERSION = "0.1.0";
const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);

const SOURCE_LABELS: Record<InstallSource, string> = {
  official: "官方安装器",
  homebrew: "Homebrew",
  npm: "npm",
  bun: "Bun",
  pnpm: "pnpm",
  mise: "mise",
  unknown: "其他/未知",
};

function statusValue(status: ToolStatus): string {
  const value = status.version ?? (status.state === "unreadable" ? "版本不可读" : "未安装");
  const update = status.updateState === "current" ? "官网最新版"
    : status.updateState === "outdated" ? `可更新至 ${status.latestVersion}`
      : status.updateState === "ahead" ? `高于官网 ${status.latestVersion}`
        : status.updateState === "unavailable" ? "官网版本不可用"
          : undefined;
  return [value, status.source ? SOURCE_LABELS[status.source] : undefined, update].filter(Boolean).join(" · ");
}

const OPERATION_LABELS: Record<Action["operation"], string> = {
  install: "安装",
  update: "更新",
  uninstall: "卸载",
};

function printPlan(manager: CliManager, actions: Action[], statuses: ToolStatus[]): void {
  console.log(`确认 ${actions.length} 个动作：`);
  for (const action of actions) {
    const status = statuses.find((candidate) => candidate.id === action.toolId)!;
    console.log(`  ${OPERATION_LABELS[action.operation]} ${status.label}：${manager.preview(action)}`);
  }
  if (actions.some((action) => action.operation === "uninstall")) {
    console.log("卸载只移除程序本身，保留各工具的用户数据目录。");
  }
}

function printResults(results: ActionResult[]): void {
  console.log("完成：");
  for (const result of results) {
    if (result.outcome === "changed") {
      const change = result.operation === "uninstall"
        ? `已卸载${result.beforeVersion ? `（${result.beforeVersion}）` : ""}`
        : result.beforeVersion
          ? `${result.beforeVersion} → ${result.afterVersion}`
          : `已安装 ${result.afterVersion}`;
      console.log(`✓ ${result.label} ${change}`);
    } else if (result.outcome === "failed") {
      console.log(`✗ ${result.label} 失败：${result.message ?? "未知错误"}`);
    } else {
      console.log(`— ${result.label} ${result.message}`);
    }
  }
}

async function chooseActions(
  manager: CliManager,
  statuses: ToolStatus[],
  operation: Action["operation"],
): Promise<Action[] | undefined> {
  const controller = new AbortController();
  const goBack = (_input: string, key: { name?: string }): void => {
    if (key.name === "escape" || key.name === "q") controller.abort();
  };
  process.stdin.on("keypress", goBack);
  try {
    const selectedIds = await checkbox<Action["toolId"]>({
      message: `选择要${OPERATION_LABELS[operation]}的工具`,
      choices: statuses
        .filter((status) => operation === "install" ? status.state === "missing" : status.state !== "missing")
        .map((status) => {
          const action: Action = { toolId: status.id, operation };
          try {
            return { name: `${status.label} ${statusValue(status)}`, value: status.id, checked: operation !== "uninstall", description: manager.preview(action) };
          } catch (error: unknown) {
            return { name: `${status.label} ${statusValue(status)}`, value: status.id, disabled: (error as Error).message };
          }
        }),
      loop: false,
      theme: { style: { keysHelpTip: () => "↑↓ 移动 • space 选择 • a 全选 • i 反选 • esc/q 返回 • ⏎ 提交" } },
    }, { signal: controller.signal });
    return selectedIds.map((toolId) => ({ toolId, operation }));
  } catch (error: unknown) {
    if ((error as Error).name === "AbortPromptError") return undefined;
    throw error;
  } finally {
    process.stdin.off("keypress", goBack);
  }
}

async function runPlanned(
  manager: CliManager,
  statuses: ToolStatus[],
  actions: Action[],
): Promise<number> {
  if (!isTTY) throw new Error("安装、更新和卸载需要真实终端，以便上游 CLI 正常交互。");
  if (actions.length === 0) {
    console.log("没有可执行的操作。");
    return 0;
  }
  printPlan(manager, actions, statuses);
  if (!(await confirm({ message: "确认执行以上操作？", default: false }))) {
    console.log("已取消，未执行任何操作。");
    return 0;
  }
  const uninstallCount = actions.filter((action) => action.operation === "uninstall").length;
  if (uninstallCount > 0 && !(await confirm({
    message: `再次确认卸载 ${uninstallCount} 个工具？`,
    default: false,
  }))) {
    console.log("已取消，未执行任何操作。");
    return 0;
  }
  const results = await manager.run(actions, { verifyLatest: true });
  printResults(results);
  return results.some((result) => result.outcome === "failed") ? 1 : 0;
}

async function runInteractive(manager: CliManager): Promise<number> {
  if (!isTTY) throw new Error("交互模式需要真实终端；请使用 status、install、update 或 uninstall 子命令。");
  const statuses = await manager.scan({ checkLatest: true });
  const missingCount = statuses.filter((status) => status.state === "missing").length;
  console.log(`${statuses.length - missingCount} 已安装 · ${missingCount} 未安装`);
  const canInstall = statuses.some((status) => status.state === "missing");
  const canManage = statuses.some((status) => status.state !== "missing");
  while (true) {
    const operation = await select<Action["operation"] | "cancel">({
      message: "现在要做什么？",
      choices: [
        ...(canInstall ? [{ name: "安装缺失工具", value: "install" as const, description: "使用 catalog 中唯一的推荐入口" }] : []),
        ...(canManage ? [{ name: "更新已安装工具", value: "update" as const, description: "把终端交给各 CLI updater" }] : []),
        ...(canManage ? [{ name: "卸载已安装工具", value: "uninstall" as const, description: "仅移除程序，保留用户数据" }] : []),
        { name: "退出", value: "cancel" as const },
      ],
      loop: false,
    });
    if (operation === "cancel") {
      console.log("已取消，未执行任何操作。");
      return 0;
    }
    const actions = await chooseActions(manager, statuses, operation);
    if (actions) return runPlanned(manager, statuses, actions);
  }
}

function usage(): string {
  return `用法：
  ai-cli-manager
  ai-cli-manager status [--local]
  ai-cli-manager status --json [--local]
  ai-cli-manager install <tool...>
  ai-cli-manager update [tool...]
  ai-cli-manager uninstall <tool...>

工具：claude、codex、kimi、pi、omp、mmx、grok

status 默认直接核验官网 latest，--local 只读取本地版本与路径；写操作执行前会显示精确计划并确认。
卸载只移除程序本身，保留各工具的用户数据目录。`;
}

function printStatuses(statuses: ToolStatus[]): void {
  for (const status of statuses) console.log(`${status.label.padEnd(12)} ${status.state === "missing" ? "未安装" : statusValue(status)}`);
}

function selectedStatuses(statuses: ToolStatus[], ids: string[]): ToolStatus[] {
  const uniqueIds = [...new Set(ids)];
  return uniqueIds.map((id) => {
    const status = statuses.find((candidate) => candidate.id === id);
    if (!status) throw new Error(`未知工具：${id}`);
    return status;
  });
}

async function runCli(args: string[]): Promise<number> {
  const manager = createCliManager();
  if (args.length === 0) return runInteractive(manager);
  if (args[0] === "--help" || args[0] === "-h") {
    if (args.length !== 1) throw new Error("帮助选项不能与其他参数同时使用。");
    console.log(usage());
    return 0;
  }
  if (args[0] === "--version" || args[0] === "-v") {
    if (args.length !== 1) throw new Error("版本选项不能与其他参数同时使用。");
    console.log(VERSION);
    return 0;
  }
  if (args[0] === "status") {
    const options = args.slice(1);
    if (new Set(options).size !== options.length || options.some((option) => option !== "--json" && option !== "--local")) {
      throw new Error("status 只支持 --json 和 --local 选项。");
    }
    const statuses = await manager.scan({ checkLatest: !options.includes("--local") });
    if (options.includes("--json")) console.log(JSON.stringify(statuses, null, 2));
    else printStatuses(statuses);
    return 0;
  }
  if (args[0] === "install" || args[0] === "update" || args[0] === "uninstall") {
    const operation = args[0];
    const ids = args.slice(1);
    if (operation !== "update" && ids.length === 0) throw new Error(`${operation} 至少需要一个工具名。`);
    const statuses = await manager.scan();
    const selected = ids.length > 0
      ? selectedStatuses(statuses, ids)
      : statuses.filter((status) => status.state !== "missing");
    for (const status of selected) {
      if (operation === "install" && status.state !== "missing") throw new Error(`${status.label} 已在 PATH 中生效，不能重复安装。`);
      if (operation !== "install" && status.state === "missing") {
        throw new Error(`${status.label} 未安装，不能${OPERATION_LABELS[operation]}。`);
      }
    }
    return runPlanned(
      manager,
      statuses,
      selected.map((status) => ({ toolId: status.id, operation })),
    );
  }
  throw new Error(`未知命令：${args[0]}`);
}

async function main(): Promise<void> {
  try {
    process.exitCode = await runCli(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(`ai-cli-manager: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

void main();
