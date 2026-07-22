export type ToolId = "claude" | "codex" | "kimi" | "pi";
export type Source = "official" | "npm" | "homebrew" | "unknown";
export type HomebrewKind = "formula" | "cask";
export type ToolState =
  | "not_installed"
  | "installed_current"
  | "update_available"
  | "latest_unavailable"
  | "version_unknown"
  | "source_unknown"
  | "multiple_installations"
  | "broken"
  | "manager_unavailable"
  | "unsupported_platform";

export interface OfficialDefinition {
  unixUrl: string;
  windowsUrl?: string;
  scriptHosts: string[];
  installShell: "bash" | "sh";
  update: "script" | "command";
  updateArgs?: string[];
  markers: string[];
  latestUrls: string[];
}

export interface HomebrewDefinition {
  name: string;
  kind: HomebrewKind;
}

export interface ToolDefinition {
  id: ToolId;
  label: string;
  command: string;
  versionArgs: string[];
  npmPackage: string;
  npmInstallArgs?: string[];
  legacyNpmPackages?: string[];
  legacyHomebrewPackages?: string[];
  homebrew?: HomebrewDefinition;
  homebrewAlternatives?: HomebrewDefinition[];
  official?: OfficialDefinition;
}

export interface Installation {
  source: Source;
  path?: string;
  version?: string;
  active: boolean;
  confidence: "high" | "medium" | "low";
  evidence: string[];
  packageName?: string;
  managerVersion?: string;
  legacy?: boolean;
}

export interface ToolStatus {
  tool: ToolDefinition;
  state: ToolState;
  active?: Installation;
  installations: Installation[];
  latest: Partial<Record<Source, string>>;
  warnings: string[];
}

export interface CommandResult {
  code: number | null;
  signal?: NodeJS.Signals;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  error?: string;
}

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface CommandRunner {
  run(program: string, args: string[], options?: RunOptions): Promise<CommandResult>;
}

export interface CommandStep {
  kind: "command";
  program: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  label: string;
}

export interface ScriptStep {
  kind: "script";
  url: string;
  allowedHosts: string[];
  shell: "bash" | "sh" | "powershell";
  shellArgs?: string[];
  env?: NodeJS.ProcessEnv;
  label: string;
}

export type ActionStep = CommandStep | ScriptStep;

export interface Plan {
  tool: ToolId;
  label: string;
  operation: "install" | "update";
  source: Source;
  currentVersion?: string;
  latestVersion?: string;
  steps: ActionStep[];
  summary: string;
}

export interface SourceAvailability {
  source: Exclude<Source, "unknown">;
  available: boolean;
  reason?: string;
}
