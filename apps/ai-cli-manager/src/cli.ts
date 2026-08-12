#!/usr/bin/env node
import {
  createCliManager,
  type Action,
  type ActionResult,
  type CliManager,
  type ToolStatus,
} from "./manager.js";
import { inquirerPrompts, type PromptAdapter } from "./ui.js";

const VERSION = "0.1.0";

interface CliIo {
  log(message?: string): void;
  isTTY: boolean;
}

const defaultIo: CliIo = {
  log: (message = "") => console.log(message),
  isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
};

function statusValue(status: ToolStatus): string {
  if (status.version) return status.version;
  return status.state === "unreadable" ? "版本不可读" : "—";
}

function printSummary(statuses: ToolStatus[], io: CliIo): void {
  const missing = statuses.filter((status) => status.state === "missing").length;
  io.log(`${statuses.length - missing} 已安装 · ${missing} 未安装`);
  io.log(statuses.map((status) => `${status.label} ${statusValue(status)}`).join(" · "));
}

function printDetails(statuses: ToolStatus[], io: CliIo): void {
  io.log("精确命令：");
  for (const status of statuses) io.log(`  ${status.label}：${status.preview}`);
}

function printPlan(actions: Action[], statuses: ToolStatus[], io: CliIo): void {
  io.log(`确认 ${actions.length} 个动作：`);
  for (const action of actions) {
    const status = statuses.find((candidate) => candidate.id === action.toolId)!;
    io.log(`  ${action.operation === "install" ? "安装" : "更新"} ${status.label}：${status.preview}`);
  }
}

function printResults(results: ActionResult[], io: CliIo): void {
  io.log("完成：");
  for (const result of results) {
    if (result.outcome === "changed") {
      const change = result.beforeVersion
        ? `${result.beforeVersion} → ${result.afterVersion}`
        : `已安装 ${result.afterVersion}`;
      io.log(`✓ ${result.label} ${change}`);
    } else if (result.outcome === "failed") {
      io.log(`✗ ${result.label} 失败：${result.message ?? "未知错误"}`);
    } else {
      io.log(`— ${result.label} ${result.message}`);
    }
  }
}

async function runPlanned(
  manager: CliManager,
  statuses: ToolStatus[],
  actions: Action[],
  io: CliIo,
  prompts: PromptAdapter,
): Promise<number> {
  if (!io.isTTY) throw new Error("安装和更新需要真实终端，以便上游 CLI 正常交互。");
  if (actions.length === 0) {
    io.log("没有可执行的操作。");
    return 0;
  }
  printPlan(actions, statuses, io);
  if (!(await prompts.confirm("确认执行以上操作？"))) {
    io.log("已取消，未执行任何操作。");
    return 0;
  }
  const results = await manager.run(actions);
  printResults(results, io);
  return results.some((result) => result.outcome === "failed") ? 1 : 0;
}

async function runInteractive(manager: CliManager, io: CliIo, prompts: PromptAdapter): Promise<number> {
  if (!io.isTTY) throw new Error("交互模式需要真实终端；请使用 status、install 或 update 子命令。");
  const statuses = await manager.scan();
  printSummary(statuses, io);
  let intent: "install" | "update";
  while (true) {
    const chosen = await prompts.chooseIntent({
      canInstall: statuses.some((status) => status.state === "missing"),
      canUpdate: statuses.some((status) => status.state !== "missing"),
    });
    if (chosen === "details") {
      printDetails(statuses, io);
      continue;
    }
    if (chosen === "cancel") {
      io.log("已取消，未执行任何操作。");
      return 0;
    }
    intent = chosen;
    break;
  }
  const actions: Action[] = statuses
    .filter((status) => intent === "install" ? status.state === "missing" : status.state !== "missing")
    .map((status) => ({ toolId: status.id, operation: intent }));
  return runPlanned(manager, statuses, actions, io, prompts);
}

function usage(): string {
  return `用法：
  ai-cli-manager
  ai-cli-manager status
  ai-cli-manager status --json
  ai-cli-manager install <tool...>
  ai-cli-manager update [tool...]

工具：claude、codex、kimi、pi、omp

扫描只读取 PATH 当前生效命令的本地版本；安装和更新执行前均会显示精确计划并确认。`;
}

function printStatuses(statuses: ToolStatus[], io: CliIo): void {
  for (const status of statuses) io.log(`${status.label.padEnd(12)} ${status.state === "missing" ? "未安装" : statusValue(status)}`);
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
  const io = defaultIo;
  const prompts = inquirerPrompts;
  if (args.length === 0) return runInteractive(manager, io, prompts);
  if (args[0] === "--help" || args[0] === "-h") {
    if (args.length !== 1) throw new Error("帮助选项不能与其他参数同时使用。");
    io.log(usage());
    return 0;
  }
  if (args[0] === "--version" || args[0] === "-v") {
    if (args.length !== 1) throw new Error("版本选项不能与其他参数同时使用。");
    io.log(VERSION);
    return 0;
  }
  if (args[0] === "status") {
    if (args.length > 2 || (args[1] && args[1] !== "--json")) throw new Error("status 只支持 --json 选项。");
    const statuses = await manager.scan();
    if (args[1] === "--json") io.log(JSON.stringify(statuses, null, 2));
    else printStatuses(statuses, io);
    return 0;
  }
  if (args[0] === "install" || args[0] === "update") {
    const operation = args[0];
    const ids = args.slice(1);
    if (operation === "install" && ids.length === 0) throw new Error("install 至少需要一个工具名。");
    const statuses = await manager.scan();
    const selected = ids.length > 0
      ? selectedStatuses(statuses, ids)
      : statuses.filter((status) => status.state !== "missing");
    for (const status of selected) {
      if (operation === "install" && status.state !== "missing") throw new Error(`${status.label} 已在 PATH 中生效，不能重复安装。`);
      if (operation === "update" && status.state === "missing") throw new Error(`${status.label} 未安装，不能更新。`);
    }
    return runPlanned(
      manager,
      statuses,
      selected.map((status) => ({ toolId: status.id, operation })),
      io,
      prompts,
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
