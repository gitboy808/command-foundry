import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CATALOG, type ActionStep, type ToolId, type ToolRecipe } from "./catalog.js";
import { NodeCommandRunner } from "./runner.js";

const SCRIPT_MAX_BYTES = 2 * 1024 * 1024;

export type { ToolId } from "./catalog.js";
export type ToolState = "missing" | "installed" | "unreadable";
export type Operation = "install" | "update";

export interface ToolStatus {
  id: ToolId;
  label: string;
  state: ToolState;
  version?: string;
  action: Operation;
  preview: string;
}

export interface Action {
  toolId: ToolId;
  operation: Operation;
}

export interface ActionResult {
  toolId: ToolId;
  label: string;
  operation: Operation;
  outcome: "changed" | "unchanged" | "failed";
  beforeVersion?: string;
  afterVersion?: string;
  message?: string;
}

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  signal?: NodeJS.Signals;
  error?: string;
  errorCode?: string;
}

export interface RunOptions {
  stdio: "capture" | "inherit";
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface CommandRunner {
  run(program: string, args: readonly string[], options: RunOptions): Promise<CommandResult>;
}

export interface CliManager {
  scan(): Promise<ToolStatus[]>;
  run(actions: Action[]): Promise<ActionResult[]>;
}

export interface ManagerOptions {
  runner?: CommandRunner;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  actionTimeoutMs?: number;
}

function extractVersion(value: string): string | undefined {
  return value.match(/\bv?(\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.-]+)?)(?:\+[0-9A-Za-z.-]+)?\b/)?.[1];
}

function installStep(tool: ToolRecipe, platform: NodeJS.Platform): ActionStep {
  const step = platform === "win32" ? tool.install.win32 : tool.install.unix;
  if (!step) throw new Error(`${tool.label} 不支持当前平台的推荐安装方式。`);
  return step;
}

function actionStep(tool: ToolRecipe, operation: Operation, platform: NodeJS.Platform): ActionStep {
  return operation === "install"
    ? installStep(tool, platform)
    : { kind: "command", program: tool.command, args: tool.updateArgs };
}

function quote(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : JSON.stringify(value);
}

function preview(step: ActionStep): string {
  if (step.kind === "script") return `下载 ${step.url}，然后使用 ${step.shell} 执行`;
  return [step.program, ...step.args].map(quote).join(" ");
}

function isAllowedScriptUrl(url: string, allowedHosts: readonly string[]): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && allowedHosts.includes(parsed.hostname);
  } catch {
    return false;
  }
}

async function readLimitedBody(response: Response): Promise<Buffer> {
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > SCRIPT_MAX_BYTES) {
    await response.body?.cancel();
    throw new Error("官方安装脚本超过允许的大小。");
  }
  if (!response.body) {
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > SCRIPT_MAX_BYTES) throw new Error("官方安装脚本超过允许的大小。");
    return body;
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > SCRIPT_MAX_BYTES) {
      await reader.cancel();
      throw new Error("官方安装脚本超过允许的大小。");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, size);
}

export function createCliManager(options: ManagerOptions = {}): CliManager {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const runner = options.runner ?? new NodeCommandRunner();

  const scanTool = async (tool: ToolRecipe): Promise<ToolStatus> => {
    const result = await runner.run(tool.command, tool.versionArgs, {
      stdio: "capture",
      env,
      timeoutMs: 15_000,
      maxOutputBytes: 256 * 1024,
    });
    const missing = result.errorCode === "ENOENT";
    const version = result.code === 0 && !result.timedOut
      ? extractVersion(`${result.stdout}\n${result.stderr}`)
      : undefined;
    const state: ToolState = missing ? "missing" : version ? "installed" : "unreadable";
    const action: Operation = state === "missing" ? "install" : "update";
    const step = actionStep(tool, action, platform);
    return {
      id: tool.id,
      label: tool.label,
      state,
      ...(version ? { version } : {}),
      action,
      preview: preview(step),
    };
  };

  const resultBase = (tool: ToolRecipe, action: Action, before: ToolStatus, after: ToolStatus) => ({
    toolId: tool.id,
    label: tool.label,
    operation: action.operation,
    ...(before.version ? { beforeVersion: before.version } : {}),
    ...(after.version ? { afterVersion: after.version } : {}),
  });

  const runScript = async (step: Extract<ActionStep, { kind: "script" }>): Promise<CommandResult> => {
    if (!isAllowedScriptUrl(step.url, step.allowedHosts)) throw new Error(`拒绝执行未列入白名单的脚本：${step.url}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let body: Buffer;
    try {
      let currentUrl = step.url;
      let response: Response | undefined;
      for (let redirects = 0; redirects <= 5; redirects += 1) {
        response = await (options.fetch ?? fetch)(currentUrl, { redirect: "manual", signal: controller.signal });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        if (!location) throw new Error("官方安装脚本返回了无效重定向。");
        const nextUrl = new URL(location, currentUrl).toString();
        if (!isAllowedScriptUrl(nextUrl, step.allowedHosts)) {
          throw new Error("官方安装脚本重定向到了不受信任的域名。");
        }
        currentUrl = nextUrl;
      }
      if (!response || [301, 302, 303, 307, 308].includes(response.status)) throw new Error("官方安装脚本重定向次数过多。");
      if (!isAllowedScriptUrl(response.url || currentUrl, step.allowedHosts)) throw new Error("官方安装脚本重定向到了不受信任的域名。");
      if (!response.ok) throw new Error(`下载官方安装脚本失败：HTTP ${response.status}`);
      body = await readLimitedBody(response);
    } finally {
      clearTimeout(timer);
    }

    const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-"));
    const extension = step.shell === "powershell" ? ".ps1" : ".sh";
    const scriptPath = path.join(directory, `installer${extension}`);
    try {
      await writeFile(scriptPath, body, { mode: 0o700, flag: "wx" });
      const args = step.shell === "powershell"
        ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath]
        : [scriptPath];
      return await runner.run(step.shell, args, {
        stdio: "inherit",
        env,
        timeoutMs: options.actionTimeoutMs ?? 10 * 60_000,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };

  const runAction = async (action: Action): Promise<ActionResult> => {
    const tool = CATALOG.find((candidate) => candidate.id === action.toolId);
    if (!tool) throw new Error(`未知工具：${action.toolId}`);
    const before = await scanTool(tool);
    if (before.action !== action.operation) {
      return {
        ...resultBase(tool, action, before, await scanTool(tool)),
        outcome: "failed",
        message: action.operation === "install" ? `${tool.label} 已在 PATH 中生效。` : `${tool.label} 未安装。`,
      };
    }
    const step = actionStep(tool, action.operation, platform);
    let execution: CommandResult;
    try {
      execution = step.kind === "command"
        ? await runner.run(step.program, step.args, {
            stdio: "inherit",
            env,
            timeoutMs: options.actionTimeoutMs ?? 10 * 60_000,
          })
        : await runScript(step);
    } catch (error: unknown) {
      execution = { code: null, stdout: "", stderr: "", timedOut: false, error: (error as Error).message };
    }
    const after = await scanTool(tool);
    const base = resultBase(tool, action, before, after);
    if (execution.timedOut || execution.code !== 0) {
      const message = execution.error
        ?? (execution.timedOut ? "动作执行超时。" : `上游命令退出码：${execution.code ?? "未知"}`);
      return { ...base, outcome: "failed", message };
    }
    if (!after.version) return { ...base, outcome: "failed", message: "动作完成，但无法重新读取版本。" };
    if (after.version && after.version !== before.version) return { ...base, outcome: "changed" };
    return { ...base, outcome: "unchanged", message: "版本无变化（已是最新，或上游给出了手动步骤）。" };
  };

  return {
    scan: () => Promise.all(CATALOG.map(scanTool)),
    run: async (actions) => {
      const results: ActionResult[] = [];
      for (const action of actions) results.push(await runAction(action));
      return results;
    },
  };
}
