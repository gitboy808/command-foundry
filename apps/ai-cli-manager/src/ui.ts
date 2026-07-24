import { checkbox, confirm, select } from "@inquirer/prompts";
import type { Plan, Source, SourceAvailability, ToolStatus } from "./types.js";
import { formatStep } from "./plan.js";

export interface SelectedAction {
  toolId: string;
  operation: "install" | "update";
}

export function statusAction(status: ToolStatus): SelectedAction["operation"] | undefined {
  if (status.state === "not_installed") return "install";
  if (status.state === "update_available") return "update";
  // Kimi 官方安装器会迁移旧命令，因此未知状态可以进入显式重装流程。
  if (status.tool.id === "kimi" && (status.state === "source_unknown" || status.state === "version_unknown")) return "install";
  return undefined;
}

export function sourceLabel(source: Source): string {
  return { official: "官方", npm: "npm", homebrew: "Homebrew", unknown: "未知" }[source];
}

export function formatStatus(status: ToolStatus): string {
  const current = status.active?.version ?? "版本未知";
  const source = sourceLabel(status.active?.source ?? "unknown");
  if (status.state === "not_installed") return `${status.tool.label.padEnd(12)} 未安装`;
  if (status.state === "update_available") return `${status.tool.label.padEnd(12)} ${current} -> ${status.latest[status.active!.source]} [${source}] 更新`;
  if (status.state === "installed_current") return `${status.tool.label.padEnd(12)} ${current} [${source}] 已是最新`;
  if (status.state === "latest_unavailable") return `${status.tool.label.padEnd(12)} ${current} [${source}] 无法检查最新版`;
  if (status.state === "version_unknown") return `${status.tool.label.padEnd(12)} [${source}] 无法读取版本${statusAction(status) === "install" ? "，可重新安装" : ""}`;
  if (status.state === "source_unknown") return `${status.tool.label.padEnd(12)} ${current} 来源不明或需要迁移${statusAction(status) === "install" ? "，可重新安装" : ""}`;
  return `${status.tool.label.padEnd(12)} ${status.state}`;
}

export async function chooseActions(statuses: ToolStatus[]): Promise<SelectedAction[]> {
  return checkbox<SelectedAction>({
    message: "AI CLI（Space 选择，Enter 继续，Esc 取消）",
    choices: statuses.map((status) => {
      const operation = statusAction(status);
      return {
        name: formatStatus(status),
        value: { toolId: status.tool.id, operation: operation ?? "update" },
        checked: false,
        disabled: operation ? false : "不可操作",
      };
    }),
    pageSize: Math.min(statuses.length, 12),
    loop: false,
    theme: { icon: { checked: "[x]", unchecked: "[ ]", cursor: ">" } },
  });
}

export async function chooseInstallSource(status: ToolStatus, sources: SourceAvailability[]): Promise<Source> {
  return select<Source>({
    message: `选择 ${status.tool.label} 的安装来源`,
    choices: sources.map((entry) => ({
      name: entry.source === "official" && status.tool.id === "pi" ? "官方安装器（npm 后端）" : sourceLabel(entry.source),
      value: entry.source,
      disabled: entry.available ? false : entry.reason ?? "不可用",
    })),
    loop: false,
  });
}

export function printPlans(plans: Plan[]): void {
  console.log("\n将执行以下操作：");
  for (const plan of plans) {
    console.log(`\n${plan.summary}`);
    console.log(`  ${formatStep(plan.step)}`);
  }
}

export async function confirmPlans(): Promise<boolean> {
  return confirm({ message: "确认执行以上操作？", default: false });
}
