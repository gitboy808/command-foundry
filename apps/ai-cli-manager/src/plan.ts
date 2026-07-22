import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  ActionStep,
  CommandRunner,
  Plan,
  Source,
  SourceAvailability,
  ToolDefinition,
  ToolStatus,
} from "./types.js";

const SCRIPT_MAX_BYTES = 2 * 1024 * 1024;

function quote(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : JSON.stringify(value);
}

export function formatStep(step: ActionStep): string {
  if (step.kind === "script") return `下载 ${step.url}，然后使用 ${step.shell} 执行`;
  return [step.program, ...step.args].map(quote).join(" ");
}

async function commandAvailable(
  runner: CommandRunner,
  program: string,
  env: NodeJS.ProcessEnv,
  args: string[] = ["--version"],
): Promise<Pick<SourceAvailability, "available" | "reason">> {
  const result = await runner.run(program, args, { env, timeoutMs: 5_000, maxOutputBytes: 8_192 });
  if (result.code === 0 && !result.timedOut) return { available: true };
  // 探测结果会直接展示给用户，保留超时和启动错误以避免误报“未安装”。
  if (result.timedOut) return { available: false, reason: `${program} 响应超时` };
  if (result.error) return { available: false, reason: `${program} 不可用：${result.error}` };
  return { available: false, reason: `${program} 不可用（退出码 ${result.code ?? "未知"}）` };
}

export async function sourceAvailability(
  tool: ToolDefinition,
  runner: CommandRunner,
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SourceAvailability[]> {
  const sources: SourceAvailability[] = [];
  if (tool.official) {
    if (platform === "win32") {
      sources.push({ source: "official", available: Boolean(tool.official.windowsUrl), reason: tool.official.windowsUrl ? undefined : "官方未提供 Windows 安装脚本" });
    } else {
      const availability = await commandAvailable(runner, tool.official.installShell, env, ["-c", "exit 0"]);
      sources.push({ source: "official", ...availability });
    }
  }
  sources.push({ source: "npm", ...await commandAvailable(runner, "npm", env) });
  if (tool.homebrew) {
    const availability = platform === "win32"
      ? { available: false, reason: "Windows 不支持 Homebrew" }
      : await commandAvailable(runner, "brew", { ...env, HOMEBREW_NO_AUTO_UPDATE: "1" });
    sources.push({ source: "homebrew", ...availability });
  }
  return sources;
}

function officialScriptStep(tool: ToolDefinition, platform: NodeJS.Platform): ActionStep {
  if (!tool.official) throw new Error(`${tool.label} 没有官方安装源。`);
  const windows = platform === "win32";
  const url = windows ? tool.official.windowsUrl : tool.official.unixUrl;
  if (!url) throw new Error(`${tool.label} 不支持当前平台的官方安装源。`);
  return {
    kind: "script",
    url,
    allowedHosts: tool.official.scriptHosts,
    shell: windows ? "powershell" : tool.official.installShell,
    label: `${tool.label} 官方安装器`,
  };
}

export function createPlan(
  status: ToolStatus,
  operation: "install" | "update",
  source: Source,
  platform: NodeJS.Platform = process.platform,
): Plan {
  if (source === "unknown") throw new Error(`无法为 ${status.tool.label} 的未知来源生成操作。`);
  if (operation === "update" && status.active?.legacy) throw new Error(`${status.tool.label} 当前为旧版安装，需要手动迁移来源。`);
  const tool = status.tool;
  const steps: ActionStep[] = [];
  if (source === "official") {
    if (operation === "update" && tool.official?.update === "command") {
      steps.push({
        kind: "command",
        program: status.active?.path ?? tool.command,
        args: tool.official.updateArgs ?? ["update"],
        label: `${tool.label} 官方更新`,
      });
    } else {
      steps.push(officialScriptStep(tool, platform));
    }
  } else if (source === "npm") {
    steps.push({
      kind: "command",
      program: "npm",
      args: ["install", "-g", ...(tool.npmInstallArgs ?? []), `${tool.npmPackage}@latest`],
      label: `${tool.label} npm ${operation === "install" ? "安装" : "更新"}`,
    });
  } else if (source === "homebrew") {
    if (!tool.homebrew) throw new Error(`${tool.label} 没有 Homebrew 来源。`);
    const installedName = operation === "update" && status.active?.source === "homebrew" ? status.active.packageName : undefined;
    const brewDefinition = [tool.homebrew, ...(tool.homebrewAlternatives ?? [])].find((definition) => definition.name === installedName) ?? tool.homebrew;
    steps.push({
      kind: "command",
      program: "brew",
      args: [operation === "install" ? "install" : "upgrade", ...(brewDefinition.kind === "cask" ? ["--cask"] : []), brewDefinition.name],
      env: { HOMEBREW_NO_AUTO_UPDATE: "1" },
      label: `${tool.label} Homebrew ${operation === "install" ? "安装" : "更新"}`,
    });
  }
  const current = status.active?.version;
  const latest = status.latest[source];
  const versionText = operation === "update" && current ? `${current}${latest ? ` -> ${latest}` : ""}` : latest ?? "latest";
  return {
    tool: tool.id,
    label: tool.label,
    operation,
    source,
    currentVersion: current,
    latestVersion: latest,
    steps,
    summary: `${tool.label}：${operation === "install" ? "安装" : "更新"} ${versionText} [${source}]`,
  };
}

export function createInstalledUpdatePlans(statuses: ToolStatus[]): Plan[] {
  const plans: Plan[] = [];
  for (const status of statuses) {
    const active = status.active;
    if (!active || active.source === "unknown" || active.legacy) continue;
    plans.push(createPlan(status, "update", active.source));
  }
  return plans;
}

export function isAllowedScriptUrl(url: string, allowedHosts: readonly string[]): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && allowedHosts.includes(parsed.hostname);
  } catch {
    return false;
  }
}

async function downloadScript(url: string, allowedHosts: readonly string[]): Promise<string> {
  if (!isAllowedScriptUrl(url, allowedHosts)) throw new Error(`拒绝执行未列入白名单的脚本：${url}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal });
    if (!isAllowedScriptUrl(response.url || url, allowedHosts)) throw new Error("官方安装脚本重定向到了不受信任的域名。");
    if (!response.ok) throw new Error(`下载官方安装脚本失败：HTTP ${response.status}`);
    const body = await response.text();
    if (Buffer.byteLength(body) > SCRIPT_MAX_BYTES) throw new Error("官方安装脚本超过允许的大小。");
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function executeStep(step: ActionStep, runner: CommandRunner): Promise<{ ok: boolean; message?: string }> {
  if (step.kind === "command") {
    const result = await runner.run(step.program, step.args, {
      env: { ...process.env, ...step.env },
      timeoutMs: 10 * 60_000,
      maxOutputBytes: 2 * 1024 * 1024,
      onStdout: (chunk) => process.stdout.write(chunk),
      onStderr: (chunk) => process.stderr.write(chunk),
    });
    return { ok: !result.timedOut && result.code === 0, message: result.error ?? (result.timedOut ? "命令执行超时。" : result.code === 0 ? undefined : `命令退出码：${result.code}`) };
  }

  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-"));
  const extension = step.shell === "powershell" ? ".ps1" : ".sh";
  const scriptPath = path.join(directory, `installer${extension}`);
  try {
    await writeFile(scriptPath, await downloadScript(step.url, step.allowedHosts), { encoding: "utf8", mode: 0o700, flag: "wx" });
    const args = step.shell === "powershell"
      ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...(step.shellArgs ?? [])]
      : [scriptPath, ...(step.shellArgs ?? [])];
    const result = await runner.run(step.shell, args, {
      env: { ...process.env, ...step.env },
      timeoutMs: 10 * 60_000,
      maxOutputBytes: 2 * 1024 * 1024,
      onStdout: (chunk) => process.stdout.write(chunk),
      onStderr: (chunk) => process.stderr.write(chunk),
    });
    return { ok: !result.timedOut && result.code === 0, message: result.error ?? (result.timedOut ? "官方安装脚本执行超时。" : result.code === 0 ? undefined : `安装脚本退出码：${result.code}`) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function executePlans(plans: Plan[], runner: CommandRunner): Promise<Array<{ plan: Plan; ok: boolean; message?: string }>> {
  const results: Array<{ plan: Plan; ok: boolean; message?: string }> = [];
  for (const plan of plans) {
    console.log(`\n==> ${plan.summary}`);
    let ok = true;
    let message: string | undefined;
    try {
      for (const step of plan.steps) {
        const result = await executeStep(step, runner);
        if (!result.ok) {
          ok = false;
          message = result.message;
          break;
        }
      }
    } catch (error: unknown) {
      ok = false;
      message = (error as Error).message;
    }
    results.push({ plan, ok, message });
  }
  return results;
}
