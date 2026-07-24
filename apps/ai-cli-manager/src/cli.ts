#!/usr/bin/env node
import { detectAll } from "./detector.js";
import { createPlan, executePlans, sourceAvailability } from "./plan.js";
import { NodeCommandRunner } from "./runner.js";
import type { Plan, ToolStatus } from "./types.js";
import { chooseActions, chooseInstallSource, confirmPlans, formatStatus, printPlans } from "./ui.js";

const VERSION = "0.1.0";

interface CliOptions {
  list: boolean;
  json: boolean;
  update: boolean;
  offline: boolean;
  help: boolean;
  version: boolean;
}

function usage(): string {
  return `用法：ai-cli-manager [选项]\n\n检测、安装和更新 Claude Code、Codex CLI、Kimi Code 与 Pi。\n\n选项：\n  --list        只读显示状态\n  --json        以 JSON 输出状态\n  --update      更新所有已安装且来源明确的 CLI\n  --offline     不查询远程最新版\n  -h, --help    显示帮助\n  -v, --version 显示版本\n\n交互：Space 选择，Enter 继续，Esc 取消。`;
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { list: false, json: false, update: false, offline: false, help: false, version: false };
  for (const argument of args) {
    if (argument === "--list") options.list = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--update") options.update = true;
    else if (argument === "--offline") options.offline = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--version" || argument === "-v") options.version = true;
    else throw new Error(`未知选项：${argument}`);
  }
  if (options.update && (options.list || options.json)) throw new Error("--update 不能与 --list 或 --json 同时使用");
  return options;
}

function serializableStatus(status: ToolStatus): Record<string, unknown> {
  return {
    id: status.tool.id,
    name: status.tool.label,
    state: status.state,
    active: status.active,
    installations: status.installations,
    latest: status.latest,
    warnings: [...new Set(status.warnings)],
  };
}

function printStatuses(statuses: ToolStatus[]): void {
  for (const status of statuses) {
    console.log(formatStatus(status));
    for (const warning of new Set(status.warnings)) console.log(`  警告：${warning}`);
  }
}

async function runPlans(plans: Plan[], runner: NodeCommandRunner, network: boolean): Promise<void> {
  const results = await executePlans(plans, runner);
  console.log("\n执行结果：");
  for (const result of results) console.log(`${result.ok ? "[成功]" : "[失败]"} ${result.plan.label}${result.message ? `：${result.message}` : ""}`);

  console.log("\n重新检测：");
  printStatuses(await detectAll({ runner, network }));
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.version) {
    console.log(VERSION);
    return;
  }

  const runner = new NodeCommandRunner();
  if (!options.json) console.log(options.offline ? "正在检测本机安装..." : "正在检测本机安装和可用更新...");
  const statuses = await detectAll({ runner, network: !options.offline });
  if (options.json) {
    console.log(JSON.stringify(statuses.map(serializableStatus), null, 2));
    return;
  }
  if (options.list) {
    printStatuses(statuses);
    return;
  }
  if (!options.update && (!process.stdin.isTTY || !process.stdout.isTTY)) throw new Error("交互模式需要 TTY；请使用 --list、--json 或 --update。");

  // 批量更新只复用当前来源，避免非交互模式静默迁移安装方式。
  const selected = options.update
    ? statuses.flatMap((status) => {
      if (!status.active) return [];
      if (status.active.source === "unknown" || status.active.legacy) {
        console.error(`${status.tool.label} 的来源不明确或需要迁移，已跳过。`);
        return [];
      }
      return [{ toolId: status.tool.id, operation: "update" as const }];
    })
    : await chooseActions(statuses);
  if (selected.length === 0) {
    console.log(options.update ? "没有可安全更新的已安装 CLI。" : "没有选择任何操作。");
    return;
  }

  const plans: Plan[] = [];
  for (const action of selected) {
    const status = statuses.find((candidate) => candidate.tool.id === action.toolId)!;
    let source = status.active?.source;
    if (action.operation === "install") {
      source = await chooseInstallSource(status, await sourceAvailability(status.tool, runner));
    }
    if (!source || source === "unknown") {
      console.error(`${status.tool.label} 的来源不明确，已跳过。`);
      continue;
    }
    plans.push(createPlan(status, action.operation, source));
  }
  if (plans.length === 0) {
    console.log("没有可安全执行的操作。");
    return;
  }

  printPlans(plans);
  if (!options.update && !(await confirmPlans())) {
    console.log("已取消，未执行任何操作。");
    return;
  }

  await runPlans(plans, runner, !options.offline);
}

main().catch((error: unknown) => {
  if (error instanceof Error && (error.name === "ExitPromptError" || error.name === "AbortPromptError")) {
    console.log("已取消，未执行任何操作。");
    process.exitCode = 0;
    return;
  }
  console.error(`ai-cli-manager: ${(error as Error).message}`);
  process.exitCode = 1;
});
