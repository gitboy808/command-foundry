import { createHash } from "node:crypto";
import {
  access,
  chmod,
  constants,
  mkdtemp,
  open,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
  type FileHandle,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { CATALOG, compareUpdateOrder, type ActionStep, type ToolId, type ToolRecipe } from "./catalog.js";
import { NodeCommandRunner } from "./runner.js";

const SCRIPT_MAX_BYTES = 2 * 1024 * 1024;
const METADATA_MAX_BYTES = 1024 * 1024;
const CLAUDE_RELEASES_URL = "https://downloads.claude.ai/claude-code-releases";
const DEFAULT_DOWNLOAD_STALL_MS = 30_000;

export type InstallSource = "official" | "homebrew" | "npm" | "bun" | "pnpm" | "mise" | "unknown";
export type UpdateState = "current" | "outdated" | "ahead" | "unavailable";
export type ToolState = "missing" | "installed" | "unreadable";
export type Operation = "install" | "update" | "uninstall";

export interface ToolStatus {
  id: ToolId;
  label: string;
  state: ToolState;
  version?: string;
  source?: InstallSource;
  latestVersion?: string;
  updateState?: UpdateState;
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
  scan(options?: { checkLatest?: boolean }): Promise<ToolStatus[]>;
  actionCandidates(statuses: ToolStatus[], operation: Operation): ToolStatus[];
  preview(action: Action): string;
  run(actions: Action[], options?: { verifyLatest?: boolean }): Promise<ActionResult[]>;
}

export interface ManagerOptions {
  runner?: CommandRunner;
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  actionTimeoutMs?: number;
  downloadStallMs?: number;
}

function extractVersion(value: string): string | undefined {
  return value.match(/\bv?(\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.-]+)?)(?:\+[0-9A-Za-z.-]+)?\b/)?.[1];
}

function compareVersions(left: string, right: string): number {
  const [leftCore, leftPre] = left.split("-", 2);
  const [rightCore, rightPre] = right.split("-", 2);
  const leftParts = leftCore!.split(".").map(Number);
  const rightParts = rightCore!.split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  if (!leftPre || !rightPre) return leftPre ? -1 : rightPre ? 1 : 0;
  return leftPre.localeCompare(rightPre, undefined, { numeric: true, sensitivity: "base" });
}

function unchangedMessage(status: ToolStatus): string {
  return status.updateState === "current" ? `已是官网最新版 ${status.latestVersion}。`
    : status.updateState === "outdated" ? `版本无变化，仍低于官网最新版 ${status.latestVersion}。`
      : status.updateState === "ahead" ? `本地版本高于官网最新版 ${status.latestVersion}。`
        : status.updateState === "unavailable" ? "版本无变化，无法核验官网最新版。"
          : "版本无变化（未核验官网最新版，或上游给出了手动步骤）。";
}

function actionCandidates(statuses: ToolStatus[], operation: Operation): ToolStatus[] {
  const candidates = statuses
    .filter((status) => operation === "install" ? status.state === "missing" : status.state !== "missing");
  if (operation === "update") candidates.sort((left, right) => compareUpdateOrder(left.id, right.id));
  return candidates;
}

async function commandPaths(
  command: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): Promise<readonly string[] | undefined> {
  const extensions = platform === "win32"
    ? (env.PATHEXT?.trim() || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean).map((extension) => extension.startsWith(".") ? extension : `.${extension}`)
    : [""];
  for (const directory of (env.PATH ?? "").split(path.delimiter)) {
    for (const extension of extensions) {
      const candidate = path.resolve(directory || ".", `${command}${extension}`);
      try {
        await access(candidate, platform === "win32" ? constants.F_OK : constants.X_OK);
        return [candidate, await realpath(candidate).catch(() => candidate)];
      } catch {
        // Try the next PATH entry.
      }
    }
  }
  return undefined;
}

function inferSource(tool: ToolRecipe, paths: readonly string[]): InstallSource {
  const value = paths.map((candidate) => candidate.replaceAll("\\", "/").toLowerCase()).join("\n");
  if (value.includes("/cellar/") || value.includes("/caskroom/")) return "homebrew";
  if (value.includes("/.bun/")) return "bun";
  if (value.includes("/pnpm/") || value.includes("/.pnpm/")) return "pnpm";
  if (value.includes("/.local/share/mise/") || value.includes("/.mise/")) return "mise";
  if (value.includes("/lib/node_modules/") || value.includes("/npm/node_modules/") || value.includes("/appdata/roaming/npm/")) return "npm";
  if (tool.officialPathHints?.some((hint) => value.includes(hint.toLowerCase()))) return "official";
  return "unknown";
}

function actionSteps(tool: ToolRecipe, operation: Operation, platform: NodeJS.Platform): readonly ActionStep[] {
  if (operation === "install") {
    const step = platform === "win32" ? tool.install.win32 : tool.install.unix;
    if (!step) throw new Error(`${tool.label} 不支持当前平台的推荐安装方式。`);
    return [step];
  }
  if (operation === "update") return [{ kind: "command", program: tool.id, args: tool.updateArgs ?? ["update"] }];
  const steps = platform === "win32" ? tool.uninstall.win32 : tool.uninstall.unix;
  if (!steps) throw new Error(`${tool.label} 不支持当前平台的卸载方式。`);
  return steps;
}

function quote(value: string): string {
  return /^[A-Za-z0-9_./:@=~-]+$/.test(value) ? value : JSON.stringify(value);
}

function describeStep(step: ActionStep): string {
  if (step.kind === "script") return `下载 ${step.url}，然后使用 ${step.shell} 执行`;
  return [step.program, ...step.args].map(quote).join(" ");
}

// Claude 直连更新是唯一专用路径，catalog 保持通用。
function supportsClaudeDirectUpdate(tool: ToolRecipe, operation: Operation, platform: NodeJS.Platform): boolean {
  return tool.id === "claude"
    && operation === "update"
    && (platform === "darwin" || platform === "linux");
}

function expandHome(value: string, env: NodeJS.ProcessEnv): string {
  if (value !== "~" && !value.startsWith("~/")) return value;
  return path.join(env.HOME ?? homedir(), value.slice(1));
}

function isAllowedHttpsUrl(url: string, allowedHosts: readonly string[]): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && allowedHosts.includes(parsed.hostname);
  } catch {
    return false;
  }
}

function isInsideDirectory(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function claudePlatformKey(platform: NodeJS.Platform, arch: NodeJS.Architecture): Promise<string> {
  if (platform === "darwin" && (arch === "arm64" || arch === "x64")) return `darwin-${arch}`;
  if (platform === "linux" && (arch === "arm64" || arch === "x64")) {
    const muslLoader = `/lib/ld-musl-${arch === "arm64" ? "aarch64" : "x86_64"}.so.1`;
    const musl = await access(muslLoader).then(() => true, () => false);
    return `linux-${arch}${musl ? "-musl" : ""}`;
  }
  throw new Error(`不支持的系统或 CPU 架构：${platform}/${arch}`);
}

function parseClaudeAsset(manifest: unknown, platformKey: string) {
  const entry = (manifest as { platforms?: Record<string, Record<string, unknown>> })?.platforms?.[platformKey];
  const checksum = entry?.checksum;
  const size = entry?.size;
  if (!entry || typeof checksum !== "string" || !/^[0-9a-f]{64}$/.test(checksum)
    || typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) {
    throw new Error(`官方发布清单不包含当前平台（${platformKey}）或清单格式异常。`);
  }
  const binary = entry.binary;
  return {
    binary: typeof binary === "string" && /^[A-Za-z0-9._-]+$/.test(binary) ? binary : "claude",
    checksum,
    size,
  };
}

function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

function createProgressPrinter(total: number): { tick: (downloaded: number) => void; finish: () => void } {
  if (!process.stdout.isTTY) return { tick: () => {}, finish: () => {} };
  let lastWrite = 0;
  let wrote = false;
  return {
    tick(downloaded) {
      const now = Date.now();
      if (now - lastWrite < 100 && downloaded !== total) return;
      lastWrite = now;
      wrote = true;
      const percent = Math.min(100, Math.floor((downloaded / total) * 100));
      process.stdout.write(`\r下载中 ${formatMb(downloaded)}/${formatMb(total)} MB（${percent}%）  `);
    },
    finish() {
      if (wrote) process.stdout.write("\n");
    },
  };
}

// 同时限制单次停滞和整体下载时间。
async function downloadWithIntegrity(
  fetchImpl: typeof fetch,
  url: string,
  destination: string,
  expectedSize: number,
  stallMs: number,
  overallMs: number,
  onProgress: (downloaded: number) => void,
): Promise<string> {
  const controller = new AbortController();
  const overall = setTimeout(() => controller.abort(), overallMs);
  const stallText = stallMs % 1000 === 0 ? `${stallMs / 1000} 秒` : `${stallMs} 毫秒`;
  let handle: FileHandle | undefined;
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { "cache-control": "no-cache" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error("响应没有数据流。");
    const reader = response.body.getReader();
    const hash = createHash("sha256");
    let downloaded = 0;
    handle = await open(destination, "wx");
    try {
      while (true) {
        const pending = reader.read();
        pending.catch(() => {});
        let stallTimer: NodeJS.Timeout | undefined;
        const chunk = await Promise.race([
          pending,
          new Promise<never>((_, reject) => {
            stallTimer = setTimeout(
              () => reject(new Error(`下载停滞：超过 ${stallText} 没有收到数据`)),
              stallMs,
            );
          }),
        ]).finally(() => clearTimeout(stallTimer));
        if (chunk.done) break;
        downloaded += chunk.value.byteLength;
        if (downloaded > expectedSize) {
          throw new Error(`下载超过发布清单大小：应为 ${expectedSize} 字节`);
        }
        hash.update(chunk.value);
        onProgress(downloaded);
        await handle.write(chunk.value);
      }
    } catch (error: unknown) {
      controller.abort();
      await reader.cancel().catch(() => {});
      throw error;
    }
    await handle.close();
    handle = undefined;
    if (downloaded !== expectedSize) {
      throw new Error(`下载不完整：应为 ${expectedSize} 字节，实际 ${downloaded} 字节`);
    }
    return hash.digest("hex");
  } finally {
    clearTimeout(overall);
    if (handle) await handle.close().catch(() => {});
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
  const fetchImpl = options.fetch ?? fetch;
  const actionTimeoutMs = options.actionTimeoutMs ?? 10 * 60_000;

  const readLatest = async (tool: ToolRecipe): Promise<string | undefined> => {
    try {
      const response = await fetchImpl(tool.latest.url, {
        signal: AbortSignal.timeout(5_000),
        headers: { accept: "application/json,text/plain", "cache-control": "no-cache" },
      });
      if (!response.ok) return undefined;
      const body = await response.text();
      if (Buffer.byteLength(body) > METADATA_MAX_BYTES) return undefined;
      const value = tool.latest.field
        ? (JSON.parse(body) as Record<string, unknown>)[tool.latest.field]
        : body;
      return typeof value === "string" ? extractVersion(value) : undefined;
    } catch {
      return undefined;
    }
  };

  const scanTool = async (tool: ToolRecipe, checkLatest = false): Promise<ToolStatus> => {
    const result = await runner.run(tool.id, ["--version"], {
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
    const paths = missing ? undefined : await commandPaths(tool.id, env, platform);
    const latestVersion = checkLatest && version ? await readLatest(tool) : undefined;
    const updateState: UpdateState | undefined = checkLatest && version
      ? latestVersion
        ? compareVersions(version, latestVersion) < 0 ? "outdated" : compareVersions(version, latestVersion) > 0 ? "ahead" : "current"
        : "unavailable"
      : undefined;
    return {
      id: tool.id,
      label: tool.label,
      state,
      ...(version ? { version } : {}),
      ...(!missing ? { source: paths ? inferSource(tool, paths) : "unknown" as const } : {}),
      ...(latestVersion ? { latestVersion } : {}),
      ...(updateState ? { updateState } : {}),
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
    if (!isAllowedHttpsUrl(step.url, step.allowedHosts)) throw new Error(`拒绝执行未列入白名单的脚本：${step.url}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let body: Buffer;
    try {
      let currentUrl = step.url;
      let response: Response | undefined;
      for (let redirects = 0; redirects <= 5; redirects += 1) {
        response = await fetchImpl(currentUrl, { redirect: "manual", signal: controller.signal });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        if (!location) throw new Error("官方安装脚本返回了无效重定向。");
        const nextUrl = new URL(location, currentUrl).toString();
        if (!isAllowedHttpsUrl(nextUrl, step.allowedHosts)) {
          throw new Error("官方安装脚本重定向到了不受信任的域名。");
        }
        currentUrl = nextUrl;
      }
      if (!response || [301, 302, 303, 307, 308].includes(response.status)) throw new Error("官方安装脚本重定向次数过多。");
      if (!isAllowedHttpsUrl(response.url || currentUrl, step.allowedHosts)) throw new Error("官方安装脚本重定向到了不受信任的域名。");
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
        timeoutMs: actionTimeoutMs,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };

  // 标准 native Claude 绕过会停滞的内置下载器，直接校验并切换官方制品。
  const runClaudeNativeUpdate = async (tool: ToolRecipe, before: ToolStatus): Promise<CommandResult> => {
    const failure = (message: string): CommandResult => ({ code: 1, stdout: "", stderr: "", timedOut: false, error: message });
    const versionsDir = path.join(env.HOME ?? homedir(), ".local", "share", "claude", "versions");
    const paths = await commandPaths(tool.id, env, platform);
    if (!paths) return failure("PATH 中找不到 claude 命令。");
    const [launcher, resolved] = paths;
    const versionsDirReal = await realpath(versionsDir).catch(() => versionsDir);
    if (launcher === resolved || !isInsideDirectory(versionsDirReal, resolved)) {
      return failure(`当前 claude 实际指向 ${resolved}，不在 ${versionsDir} 下，属于非标准安装，已停止直连更新；可先执行 claude install latest 修复为标准 native 安装。`);
    }
    const latest = await readLatest(tool);
    if (!latest) return failure("无法获取官网最新版本，请检查网络后重试。");
    if (before.version && compareVersions(before.version, latest) >= 0) {
      return { code: 0, stdout: "", stderr: "", timedOut: false };
    }
    const platformKey = await claudePlatformKey(platform, options.arch ?? process.arch);
    const manifestUrl = `${CLAUDE_RELEASES_URL}/${latest}/manifest.json`;
    let manifest: unknown;
    try {
      const response = await fetchImpl(manifestUrl, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!isAllowedHttpsUrl(response.url || manifestUrl, ["downloads.claude.ai"])) {
        return failure("官方发布清单重定向到了不受信任的域名。");
      }
      const body = await response.text();
      if (Buffer.byteLength(body) > METADATA_MAX_BYTES) throw new Error("发布清单超过允许的大小。");
      manifest = JSON.parse(body);
    } catch {
      return failure(`无法获取 ${latest} 的官方发布清单，请检查网络后重试。`);
    }
    const asset = parseClaudeAsset(manifest, platformKey);
    const showProgress = Boolean(process.stdout.isTTY);
    if (showProgress) console.log(`下载 Claude Code ${latest}（${platformKey}，${formatMb(asset.size)} MB）…`);
    const targetPath = path.join(versionsDir, latest);
    // 唯一临时目录确保 finally 不会误删其他进程的文件。
    const temporaryDirectory = await mkdtemp(path.join(versionsDir, ".ai-cli-manager-"));
    const temporary = path.join(temporaryDirectory, "claude");
    let temporaryLinkDirectory: string | undefined;
    const binaryUrl = `${CLAUDE_RELEASES_URL}/${latest}/${platformKey}/${asset.binary}`;
    const stallMs = options.downloadStallMs ?? DEFAULT_DOWNLOAD_STALL_MS;
    try {
      const progress = createProgressPrinter(asset.size);
      let digest: string;
      try {
        digest = await downloadWithIntegrity(fetchImpl, binaryUrl, temporary, asset.size, stallMs, actionTimeoutMs, progress.tick);
      } catch (error: unknown) {
        return failure(`下载官方二进制失败：${(error as Error).message}`);
      } finally {
        progress.finish();
      }
      if (digest !== asset.checksum) {
        return failure("下载官方二进制失败：SHA-256 校验失败，下载内容与官方清单不一致。");
      }
      await chmod(temporary, 0o755);
      await rename(temporary, targetPath);
      // 临时软链必须与 launcher 位于同一文件系统，才能使用原子 rename。
      temporaryLinkDirectory = await mkdtemp(path.join(path.dirname(launcher), ".ai-cli-manager-"));
      const temporaryLink = path.join(temporaryLinkDirectory, "claude");
      await symlink(targetPath, temporaryLink);
      await rename(temporaryLink, launcher);
      if (showProgress) console.log(`校验通过，已切换 ${launcher} → ${targetPath}。`);
      return { code: 0, stdout: "", stderr: "", timedOut: false };
    } catch (error: unknown) {
      return failure(`安装 ${latest} 失败：${(error as Error).message}`);
    } finally {
      if (temporaryLinkDirectory) {
        await rm(temporaryLinkDirectory, { recursive: true, force: true }).catch(() => {});
      }
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
    }
  };

  const runStep = (step: ActionStep): Promise<CommandResult> =>
    step.kind === "script"
      ? runScript(step)
      : runner.run(step.program, step.args.map((arg) => expandHome(arg, env)), {
          stdio: "inherit",
          env,
          timeoutMs: actionTimeoutMs,
        });

  const runAction = async (action: Action, verifyLatest = false): Promise<ActionResult> => {
    const tool = CATALOG.find((candidate) => candidate.id === action.toolId);
    if (!tool) throw new Error(`未知工具：${action.toolId}`);
    const before = await scanTool(tool);
    const stateMatches = action.operation === "install" ? before.state === "missing" : before.state !== "missing";
    if (!stateMatches) {
      return {
        ...resultBase(tool, action, before, before),
        outcome: "failed",
        message: action.operation === "install" ? `${tool.label} 已在 PATH 中生效。` : `${tool.label} 未安装。`,
      };
    }
    if (action.operation === "uninstall") {
      // 卸载步骤尽力执行：单步失败（如未命中实际安装来源）不阻断后续步骤，
      // 最终以命令是否从 PATH 消失判定结果。
      let timedOut = false;
      for (const step of actionSteps(tool, "uninstall", platform)) {
        let result: CommandResult | undefined;
        try {
          result = await runStep(step);
        } catch {
          result = undefined;
        }
        if (result?.timedOut) {
          timedOut = true;
          break;
        }
      }
      const after = await scanTool(tool);
      const base = resultBase(tool, action, before, after);
      if (timedOut) return { ...base, outcome: "failed", message: "动作执行超时。" };
      if (after.state === "missing") return { ...base, outcome: "changed" };
      return { ...base, outcome: "failed", message: "卸载后命令仍在 PATH 中生效，可能由其他方式安装或存在残留副本。" };
    }
    let execution: CommandResult;
    try {
      execution = supportsClaudeDirectUpdate(tool, action.operation, platform) && before.source === "official"
        ? await runClaudeNativeUpdate(tool, before)
        : await runStep(actionSteps(tool, action.operation, platform)[0]);
    } catch (error: unknown) {
      execution = { code: null, stdout: "", stderr: "", timedOut: false, error: (error as Error).message };
    }
    const after = await scanTool(tool, verifyLatest && !execution.timedOut && execution.code === 0);
    const base = resultBase(tool, action, before, after);
    if (execution.timedOut || execution.code !== 0) {
      const message = execution.error
        ?? (execution.timedOut ? "动作执行超时。" : `上游命令退出码：${execution.code ?? "未知"}`);
      return { ...base, outcome: "failed", message };
    }
    if (!after.version) return { ...base, outcome: "failed", message: "动作完成，但无法重新读取版本。" };
    if (after.version !== before.version) return { ...base, outcome: "changed" };
    return { ...base, outcome: "unchanged", message: unchangedMessage(after) };
  };

  return {
    scan: ({ checkLatest = false } = {}) => Promise.all(CATALOG.map((tool) => scanTool(tool, checkLatest))),
    actionCandidates,
    preview: (action) => {
      const tool = CATALOG.find((candidate) => candidate.id === action.toolId);
      if (!tool) throw new Error(`未知工具：${action.toolId}`);
      if (supportsClaudeDirectUpdate(tool, action.operation, platform)) {
        return "标准 native 安装：直连 downloads.claude.ai 校验更新；其他来源：claude update";
      }
      return actionSteps(tool, action.operation, platform).map(describeStep).join(" && ");
    },
    run: async (actions, { verifyLatest = false } = {}) => {
      const results: ActionResult[] = [];
      for (const action of actions) results.push(await runAction(action, verifyLatest));
      return results;
    },
  };
}
