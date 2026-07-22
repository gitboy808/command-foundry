import { access, constants, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ToolDefinition, Installation, ToolState, ToolStatus, Source, CommandRunner } from "./types.js";
import { CATALOG } from "./catalog.js";
import { extractVersion, isUpdateAvailable } from "./versions.js";

export interface DetectOptions {
  runner: CommandRunner;
  env?: NodeJS.ProcessEnv;
  home?: string;
  platform?: NodeJS.Platform;
  network?: boolean;
  fetchText?: (url: string) => Promise<string>;
}

interface PathCandidate {
  path: string;
  realpath: string;
}

interface NpmInventory {
  available: boolean;
  root?: string;
  packages: Map<string, { version?: string; path: string; binPath?: string }>;
  warning?: string;
}

interface BrewInventory {
  available: boolean;
  basePrefix?: string;
  packages: Map<string, { version?: string; latest?: string; prefix?: string }>;
  warning?: string;
}

const DEFAULT_FETCH_TIMEOUT = 10_000;

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function executable(filePath: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    await access(filePath, platform === "win32" ? constants.F_OK : constants.X_OK);
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function pathCandidates(command: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): Promise<PathCandidate[]> {
  const pathValue = env.PATH ?? "";
  const extensions = platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  const candidates: PathCandidate[] = [];
  const seen = new Set<string>();
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`);
      if (seen.has(candidate) || !(await executable(candidate, platform))) continue;
      seen.add(candidate);
      let canonical = candidate;
      try {
        canonical = await realpath(candidate);
      } catch {
        // Keep the visible path when a broken symlink cannot be resolved.
      }
      candidates.push({ path: candidate, realpath: canonical });
    }
  }
  return candidates;
}

async function readNpmInventory(tool: ToolDefinition, runner: CommandRunner, env: NodeJS.ProcessEnv): Promise<NpmInventory> {
  const rootResult = await runner.run("npm", ["root", "-g"], { env });
  if (rootResult.code !== 0 || !rootResult.stdout.trim()) {
    return { available: false, packages: new Map(), warning: "npm 不可用或无法读取全局目录。" };
  }
  const root = rootResult.stdout.trim().split(/\r?\n/).pop()!.trim();
  const packages = new Map<string, { version?: string; path: string; binPath?: string }>();
  const names = [tool.npmPackage, ...(tool.legacyNpmPackages ?? [])];
  for (const name of names) {
    const packagePath = path.join(root, ...name.split("/"));
    try {
      const manifest = JSON.parse(await readFile(path.join(packagePath, "package.json"), "utf8")) as {
        version?: unknown;
        bin?: unknown;
      };
      const bin = typeof manifest.bin === "string"
        ? manifest.bin
        : manifest.bin && typeof manifest.bin === "object"
          ? (manifest.bin as Record<string, unknown>)[tool.command]
          : undefined;
      let binPath = typeof bin === "string" ? path.resolve(packagePath, bin) : undefined;
      if (binPath) {
        try {
          binPath = await realpath(binPath);
        } catch {
          // Keep the package-relative path for incomplete npm installations.
        }
      }
      packages.set(name, { version: typeof manifest.version === "string" ? manifest.version : undefined, path: packagePath, binPath });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return { available: true, root, packages, warning: `读取 npm 包 ${name} 失败。` };
      }
    }
  }
  return { available: true, root, packages };
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

async function readBrewInventory(tool: ToolDefinition, runner: CommandRunner, env: NodeJS.ProcessEnv): Promise<BrewInventory> {
  if (!tool.homebrew) return { available: true, packages: new Map() };
  const brewEnv = { ...env, HOMEBREW_NO_AUTO_UPDATE: "1" };
  const basePrefixResult = await runner.run("brew", ["--prefix"], { env: brewEnv, timeoutMs: 5_000 });
  const basePrefix = basePrefixResult.code === 0 ? basePrefixResult.stdout.trim() : undefined;
  const kindFlag = tool.homebrew.kind === "formula" ? "--formula" : "--cask";
  const result = await runner.run("brew", ["info", "--json=v2", kindFlag, tool.homebrew.name], { env: brewEnv });
  if (result.code !== 0) {
    if (result.error?.includes("ENOENT")) return { available: false, basePrefix, packages: new Map(), warning: "Homebrew 不可用。" };
    return { available: true, basePrefix, packages: new Map() };
  }
  const parsed = parseJsonObject(result.stdout);
  if (!parsed) return { available: true, basePrefix, packages: new Map(), warning: "Homebrew 返回了无法解析的 JSON。" };
  const entries = (tool.homebrew.kind === "formula" ? parsed.formulae : parsed.casks);
  const entry = Array.isArray(entries) ? entries[0] as Record<string, unknown> | undefined : undefined;
  if (!entry) return { available: true, basePrefix, packages: new Map() };
  const versions = entry.versions as Record<string, unknown> | undefined;
  const installed = entry.installed;
  let installedVersion: string | undefined;
  if (tool.homebrew.kind === "formula" && Array.isArray(installed)) {
    const first = installed[0] as Record<string, unknown> | undefined;
    installedVersion = typeof first?.version === "string" ? first.version : undefined;
  } else if (typeof installed === "string") {
    installedVersion = installed;
  }
  const stable = tool.homebrew.kind === "formula"
    ? (typeof versions?.stable === "string" ? versions.stable : undefined)
    : (typeof entry.version === "string" ? entry.version : undefined);
  if (!installedVersion) return { available: true, basePrefix, packages: new Map() };
  const prefixResult = await runner.run("brew", ["--prefix", tool.homebrew.name], { env: brewEnv });
  const prefix = prefixResult.code === 0
    ? prefixResult.stdout.trim()
    : basePrefix && tool.homebrew.kind === "cask"
      ? path.join(basePrefix, "Caskroom", tool.homebrew.name, installedVersion)
      : undefined;
  return { available: true, basePrefix, packages: new Map([[tool.homebrew.name, { version: installedVersion, latest: stable, prefix }]]) };
}

async function fetchWithTimeout(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: "application/json,text/plain" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseOfficialLatest(tool: ToolDefinition, body: string): string | undefined {
  if (tool.id === "codex") {
    const parsed = parseJsonObject(body);
    return typeof parsed?.tag_name === "string" ? extractVersion(parsed.tag_name) : extractVersion(body);
  }
  if (tool.id === "pi") {
    const parsed = parseJsonObject(body);
    return typeof parsed?.version === "string" ? extractVersion(parsed.version) : extractVersion(body);
  }
  return extractVersion(body);
}

async function readLatest(tool: ToolDefinition, source: Source, inventory: NpmInventory | BrewInventory, options: DetectOptions): Promise<string | undefined> {
  if (source === "npm") {
    const result = await options.runner.run("npm", ["view", tool.npmPackage, "dist-tags.latest", "--json"], { env: options.env });
    if (result.code !== 0) return undefined;
    try {
      const value = JSON.parse(result.stdout.trim()) as unknown;
      return typeof value === "string" ? extractVersion(value) : undefined;
    } catch {
      return extractVersion(result.stdout);
    }
  }
  if (source === "homebrew" && tool.homebrew) {
    return (inventory as BrewInventory).packages.get(tool.homebrew.name)?.latest;
  }
  if (source === "official" && tool.official) {
    const fetcher = options.fetchText ?? fetchWithTimeout;
    for (const url of tool.official.latestUrls) {
      try {
        const value = parseOfficialLatest(tool, await fetcher(url));
        if (value) return value;
      } catch {
        // Try the next official endpoint, then preserve a latest_unavailable state.
      }
    }
  }
  return undefined;
}

function samePath(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  return path.resolve(left) === path.resolve(right);
}

function pathMatchesPrefix(candidate: PathCandidate, prefix: string | undefined, basePrefix?: string, packageName?: string, kind?: "formula" | "cask"): boolean {
  if (prefix && (candidate.realpath === prefix || candidate.realpath.startsWith(`${prefix}${path.sep}`) || candidate.path.startsWith(`${prefix}${path.sep}`))) return true;
  return kind === "cask" && Boolean(basePrefix && packageName && candidate.realpath.startsWith(path.join(basePrefix, "Caskroom", packageName)));
}

function officialPathMatches(tool: ToolDefinition, candidate: PathCandidate, home: string): boolean {
  return Boolean(tool.official?.markers.some((marker) => candidate.realpath.includes(path.join(home, marker)) || candidate.path.includes(path.join(home, marker))));
}

async function officialMarkerExists(tool: ToolDefinition, home: string): Promise<string | undefined> {
  for (const marker of tool.official?.markers ?? []) {
    const markerPath = path.join(home, marker);
    if (marker.endsWith(`/${tool.command}`) || marker.endsWith(`\\${tool.command}`)) {
      if (await exists(markerPath)) return markerPath;
    }
  }
  return undefined;
}

function calculateState(status: Omit<ToolStatus, "state">): ToolState {
  const active = status.active;
  if (!active) return status.installations.length > 0 ? "source_unknown" : "not_installed";
  if (active.legacy) return "source_unknown";
  if (active.source === "unknown") return "source_unknown";
  if (!active.version) return "version_unknown";
  const latest = status.latest[active.source];
  if (!latest) return "latest_unavailable";
  if (isUpdateAvailable(active.version, latest)) return "update_available";
  return "installed_current";
}

export async function detectTool(tool: ToolDefinition, options: DetectOptions): Promise<ToolStatus> {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const platform = options.platform ?? process.platform;
  const candidates = await pathCandidates(tool.command, env, platform);
  const activeCandidate = candidates[0];
  const installations: Installation[] = [];
  const warnings: string[] = [];
  const npm = await readNpmInventory(tool, options.runner, env);
  const brewDefinitions = [tool.homebrew, ...(tool.homebrewAlternatives ?? [])].filter((definition): definition is NonNullable<typeof definition> => Boolean(definition));
  const brewInventories = platform === "win32"
    ? brewDefinitions.map((definition) => ({ definition, inventory: { available: false, packages: new Map<string, { version?: string; latest?: string; prefix?: string }>(), warning: "Windows 不支持 Homebrew 来源。" } as BrewInventory }))
    : await Promise.all(brewDefinitions.map(async (definition) => ({
      definition,
      inventory: await readBrewInventory({ ...tool, homebrew: definition }, options.runner, env),
    })));
  const brewAvailable = brewInventories.some(({ inventory }) => inventory.available);
  const brewBasePrefix = brewInventories.find(({ inventory }) => inventory.basePrefix)?.inventory.basePrefix;

  for (const [packageName, packageInfo] of npm.packages) {
    let packageBin = packageInfo.binPath;
    if (packageBin && !(await exists(packageBin))) packageBin = undefined;
    const active = Boolean(activeCandidate && (samePath(activeCandidate.realpath, packageBin) || activeCandidate.realpath.startsWith(`${packageInfo.path}${path.sep}`)));
    installations.push({
      source: "npm",
      path: packageBin ?? packageInfo.path,
      version: packageInfo.version,
      active,
      confidence: active ? "high" : "medium",
      evidence: [`npm 全局包 ${packageName}`],
      packageName,
      legacy: packageName !== tool.npmPackage,
    });
  }

  for (const { definition, inventory } of brewInventories) {
    const brewInfo = inventory.packages.get(definition.name);
    if (!brewInfo) continue;
    const active = Boolean(activeCandidate && pathMatchesPrefix(activeCandidate, brewInfo.prefix, inventory.basePrefix, definition.name, definition.kind));
    installations.push({
      source: "homebrew",
      path: brewInfo.prefix,
      version: brewInfo.version,
      managerVersion: brewInfo.latest,
      active,
      confidence: active ? "high" : "medium",
      evidence: [`Homebrew ${definition.kind} ${definition.name}`],
      packageName: definition.name,
    });
  }

  for (const legacyName of tool.legacyHomebrewPackages ?? []) {
    if (platform === "win32" || !brewAvailable) continue;
    const brewEnv = { ...env, HOMEBREW_NO_AUTO_UPDATE: "1" };
    const result = await options.runner.run("brew", ["info", "--json=v2", "--formula", legacyName], { env: brewEnv });
    if (result.code !== 0) continue;
    const parsed = parseJsonObject(result.stdout);
    const entries = parsed?.formulae;
    const entry = Array.isArray(entries) ? entries[0] as Record<string, unknown> | undefined : undefined;
    const installed = entry?.installed;
    const first = Array.isArray(installed) ? installed[0] as Record<string, unknown> | undefined : undefined;
    const version = typeof first?.version === "string" ? first.version : undefined;
    if (!version) continue;
    const prefixResult = await options.runner.run("brew", ["--prefix", legacyName], { env: brewEnv });
    const prefix = prefixResult.code === 0 ? prefixResult.stdout.trim() : undefined;
    installations.push({
      source: "homebrew",
      path: prefix,
      version,
      active: Boolean(activeCandidate && pathMatchesPrefix(activeCandidate, prefix, brewBasePrefix, legacyName, "formula")),
      confidence: "high",
      evidence: [`Homebrew 旧版 formula ${legacyName}`],
      packageName: legacyName,
      legacy: true,
    });
  }

  const officialCandidate = activeCandidate && officialPathMatches(tool, activeCandidate, home) ? activeCandidate : undefined;
  const markerPath = await officialMarkerExists(tool, home);
  if (officialCandidate || markerPath) {
    const versionResult = officialCandidate ? await options.runner.run(officialCandidate.path, tool.versionArgs, { env }) : undefined;
    installations.push({
      source: "official",
      path: officialCandidate?.path ?? markerPath,
      version: extractVersion(versionResult?.stdout ?? ""),
      active: Boolean(officialCandidate),
      confidence: officialCandidate ? "high" : "medium",
      evidence: [officialCandidate ? "官方安装路径" : "官方安装路径存在但未在 PATH 中"],
    });
  }

  if (activeCandidate && !installations.some((installation) => installation.active)) {
    const versionResult = await options.runner.run(activeCandidate.path, tool.versionArgs, { env });
    installations.push({
      source: "unknown",
      path: activeCandidate.path,
      version: extractVersion(versionResult.stdout),
      active: true,
      confidence: "low",
      evidence: ["PATH 中存在可执行文件，但无法匹配已知来源"],
    });
  }
  for (const installation of installations) {
    if (installation.legacy) warnings.push(`检测到旧版 ${installation.packageName ?? tool.command}，不会自动迁移到 ${tool.npmPackage}。`);
    if (!installation.active && activeCandidate && installation.source !== "unknown") warnings.push(`${tool.label} 同时存在多个来源，当前只会处理 PATH 中生效的实例。`);
  }
  if (npm.warning) warnings.push(npm.warning);
  for (const { inventory } of brewInventories) if (inventory.warning && inventory.available) warnings.push(inventory.warning);
  if (!brewAvailable && tool.homebrew && platform !== "win32") warnings.push(brewInventories[0]?.inventory.warning ?? "Homebrew 不可用。安装时可选择其他来源。");

  const active = installations.find((installation) => installation.active);
  const latest: Partial<Record<Source, string>> = {};
  if (options.network !== false) {
    const sources = new Set(installations.map((installation) => installation.source).filter((source): source is Source => source !== "unknown"));
    for (const source of sources) {
      const sourceInstallation = installations.find((installation) => installation.source === source && installation.active)
        ?? installations.find((installation) => installation.source === source);
      const value = source === "homebrew"
        ? sourceInstallation?.managerVersion
        : await readLatest(tool, source, npm, options);
      if (value) latest[source] = value;
    }
  }
  if (active?.source && active.source !== "unknown" && !latest[active.source] && options.network !== false) warnings.push(`${tool.label} 暂时无法获取 ${active.source} 最新版本。`);
  const partial: Omit<ToolStatus, "state"> = { tool, active, installations, latest, warnings };
  return { ...partial, state: calculateState(partial) };
}

export async function detectAll(options: DetectOptions): Promise<ToolStatus[]> {
  return Promise.all(CATALOG.map((tool) => detectTool(tool, options)));
}
