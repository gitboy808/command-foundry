#!/usr/bin/env node
import { CATALOG } from "./catalog.js";
import { detectAll } from "./detector.js";
import { createPlan, executePlans, sourceAvailability } from "./plan.js";
import { NodeCommandRunner } from "./runner.js";
import type { Plan, ToolStatus } from "./types.js";
import { chooseActions, chooseInstallSource, confirmPlans, formatStatus, printPlans } from "./ui.js";

const VERSION = "0.1.0";

interface CliOptions {
  list: boolean;
  json: boolean;
  dryRun: boolean;
  offline: boolean;
  help: boolean;
  version: boolean;
}

function usage(): string {
  return `用法：ai-cli-manager [选项]\n\n检测、安装和更新 Claude Code、Codex CLI、Kimi Code 与 Pi。\n\n选项：\n  --list        只读显示状态\n  --json        以 JSON 输出状态\n  --dry-run     选择操作但不执行\n  --offline     不查询远程最新版\n  -h, --help    显示帮助\n  -v, --version 显示版本\n\n交互：Space 选择，Enter 继续，Esc 取消。`;
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { list: false, json: false, dryRun: false, offline: false, help: false, version: false };
  for (const argument of args) {
    if (argument === "--list") options.list = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--offline") options.offline = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--version" || argument === "-v") options.version = true;
    else throw new Error(`未知选项：${argument}`);
  }
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
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("交互模式需要 TTY；请使用 --list 或 --json。");

  const selected = await chooseActions(statuses);
  if (selected.length === 0) {
    console.log("没有选择任何操作。");
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
  if (options.dryRun) {
    console.log("\nDry run 完成，未执行任何命令。");
    return;
  }
  if (!(await confirmPlans())) {
    console.log("已取消，未执行任何操作。");
    return;
  }

  const results = await executePlans(plans, runner);
  console.log("\n执行结果：");
  for (const result of results) console.log(`${result.ok ? "[成功]" : "[失败]"} ${result.plan.label}${result.message ? `：${result.message}` : ""}`);

  console.log("\n重新检测：");
  printStatuses(await detectAll({ runner, network: !options.offline }));
  if (results.some((result) => !result.ok)) process.exitCode = 1;
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
