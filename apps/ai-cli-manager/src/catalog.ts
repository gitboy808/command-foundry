import type { ToolDefinition } from "./types.js";

export const CATALOG: ToolDefinition[] = [
  {
    id: "claude",
    label: "Claude Code",
    command: "claude",
    versionArgs: ["--version"],
    npmPackage: "@anthropic-ai/claude-code",
    homebrew: { name: "claude-code", kind: "cask" },
    homebrewAlternatives: [{ name: "claude-code@latest", kind: "cask" }],
    official: {
      unixUrl: "https://claude.ai/install.sh",
      windowsUrl: "https://claude.ai/install.ps1",
      scriptHosts: ["claude.ai", "downloads.claude.ai"],
      installShell: "bash",
      update: "command",
      updateArgs: ["update"],
      markers: [".local/share/claude"],
      latestUrls: ["https://downloads.claude.ai/claude-code-releases/latest"],
    },
  },
  {
    id: "codex",
    label: "Codex CLI",
    command: "codex",
    versionArgs: ["--version"],
    npmPackage: "@openai/codex",
    homebrew: { name: "codex", kind: "cask" },
    official: {
      unixUrl: "https://chatgpt.com/codex/install.sh",
      windowsUrl: "https://chatgpt.com/codex/install.ps1",
      scriptHosts: ["chatgpt.com", "release-assets.githubusercontent.com"],
      installShell: "sh",
      update: "command",
      updateArgs: ["update"],
      markers: [".codex/packages/standalone"],
      latestUrls: ["https://api.github.com/repos/openai/codex/releases/latest"],
    },
  },
  {
    id: "kimi",
    label: "Kimi Code",
    command: "kimi",
    versionArgs: ["--version"],
    npmPackage: "@moonshot-ai/kimi-code",
    legacyNpmPackages: ["kimi-cli"],
    legacyHomebrewPackages: ["kimi-cli"],
    homebrew: { name: "kimi-code", kind: "formula" },
    official: {
      unixUrl: "https://code.kimi.com/kimi-code/install.sh",
      windowsUrl: "https://code.kimi.com/kimi-code/install.ps1",
      scriptHosts: ["code.kimi.com", "cdn.kimi.com"],
      installShell: "bash",
      update: "script",
      markers: [".kimi-code/bin/kimi"],
      latestUrls: ["https://code.kimi.com/kimi-code/latest"],
    },
  },
  {
    id: "pi",
    label: "Pi",
    command: "pi",
    versionArgs: ["--version"],
    npmPackage: "@earendil-works/pi-coding-agent",
    legacyNpmPackages: ["@mariozechner/pi-coding-agent"],
    homebrew: { name: "pi-coding-agent", kind: "formula" },
    official: {
      unixUrl: "https://pi.dev/install.sh",
      scriptHosts: ["pi.dev"],
      installShell: "sh",
      update: "command",
      updateArgs: ["update", "--self"],
      markers: [],
      latestUrls: ["https://pi.dev/api/latest-version"],
    },
    npmInstallArgs: ["--ignore-scripts"],
  },
];

export function getTool(id: string): ToolDefinition | undefined {
  return CATALOG.find((tool) => tool.id === id);
}
