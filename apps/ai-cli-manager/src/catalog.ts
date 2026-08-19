export type ActionStep =
  | { readonly kind: "command"; readonly program: string; readonly args: readonly string[] }
  | { readonly kind: "script"; readonly url: string; readonly allowedHosts: readonly string[]; readonly shell: "bash" | "sh" | "powershell" };

export interface RecipeShape {
  readonly id: string;
  readonly label: string;
  readonly command: string;
  readonly versionArgs: readonly string[];
  readonly install: { readonly unix: ActionStep; readonly win32?: ActionStep };
  readonly updateArgs: readonly string[];
  readonly uninstall: { readonly unix: readonly ActionStep[]; readonly win32?: readonly ActionStep[] };
}

const script = (
  url: string,
  allowedHosts: string[],
  shell: "bash" | "sh" | "powershell",
): ActionStep => ({ kind: "script", url, allowedHosts, shell });

export const CATALOG = [
  {
    id: "claude",
    label: "Claude Code",
    command: "claude",
    versionArgs: ["--version"],
    install: {
      unix: script("https://claude.ai/install.sh", ["claude.ai", "downloads.claude.ai"], "bash"),
      win32: script("https://claude.ai/install.ps1", ["claude.ai", "downloads.claude.ai"], "powershell"),
    },
    updateArgs: ["update"],
    uninstall: {
      unix: [
        { kind: "command", program: "rm", args: ["-f", "~/.local/bin/claude"] },
        { kind: "command", program: "rm", args: ["-rf", "~/.local/share/claude"] },
      ],
    },
  },
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    versionArgs: ["--version"],
    install: {
      unix: script("https://chatgpt.com/codex/install.sh", ["chatgpt.com", "releases.openai.com"], "sh"),
      win32: script("https://chatgpt.com/codex/install.ps1", ["chatgpt.com", "releases.openai.com"], "powershell"),
    },
    updateArgs: ["update"],
    uninstall: {
      unix: [
        { kind: "command", program: "rm", args: ["-f", "~/.local/bin/codex"] },
        { kind: "command", program: "rm", args: ["-rf", "~/.codex/packages/standalone"] },
      ],
    },
  },
  {
    id: "kimi",
    label: "Kimi Code",
    command: "kimi",
    versionArgs: ["--version"],
    install: {
      unix: script("https://code.kimi.com/kimi-code/install.sh", ["code.kimi.com", "cdn.kimi.com"], "bash"),
      win32: script("https://code.kimi.com/kimi-code/install.ps1", ["code.kimi.com", "cdn.kimi.com"], "powershell"),
    },
    updateArgs: ["update"],
    uninstall: {
      unix: [
        { kind: "command", program: "rm", args: ["-f", "~/.kimi-code/bin/kimi"] },
      ],
    },
  },
  {
    id: "pi",
    label: "Pi",
    command: "pi",
    versionArgs: ["--version"],
    install: {
      unix: { kind: "command", program: "npm", args: ["install", "-g", "--ignore-scripts", "@earendil-works/pi-coding-agent"] },
      win32: { kind: "command", program: "npm", args: ["install", "-g", "--ignore-scripts", "@earendil-works/pi-coding-agent"] },
    },
    updateArgs: ["update", "--self"],
    uninstall: {
      unix: [{ kind: "command", program: "npm", args: ["uninstall", "-g", "@earendil-works/pi-coding-agent"] }],
      win32: [{ kind: "command", program: "npm", args: ["uninstall", "-g", "@earendil-works/pi-coding-agent"] }],
    },
  },
  {
    id: "omp",
    label: "OMP",
    command: "omp",
    versionArgs: ["--version"],
    install: {
      unix: script("https://omp.sh/install", ["omp.sh", "raw.githubusercontent.com"], "sh"),
      win32: script("https://omp.sh/install.ps1", ["omp.sh", "raw.githubusercontent.com"], "powershell"),
    },
    updateArgs: ["update"],
    uninstall: {
      unix: [
        { kind: "command", program: "bun", args: ["uninstall", "-g", "@oh-my-pi/pi-coding-agent"] },
        { kind: "command", program: "rm", args: ["-f", "~/.local/bin/omp"] },
      ],
    },
  },
  {
    id: "mmx",
    label: "MiniMax CLI",
    command: "mmx",
    versionArgs: ["--version"],
    install: {
      unix: { kind: "command", program: "npm", args: ["install", "-g", "mmx-cli"] },
      win32: { kind: "command", program: "npm", args: ["install", "-g", "mmx-cli"] },
    },
    updateArgs: ["update"],
    uninstall: {
      unix: [{ kind: "command", program: "npm", args: ["uninstall", "-g", "mmx-cli"] }],
      win32: [{ kind: "command", program: "npm", args: ["uninstall", "-g", "mmx-cli"] }],
    },
  },
  {
    id: "grok",
    label: "Grok Build",
    command: "grok",
    versionArgs: ["--version"],
    install: {
      unix: script("https://x.ai/cli/install.sh", ["x.ai"], "bash"),
      win32: script("https://x.ai/cli/install.ps1", ["x.ai"], "powershell"),
    },
    updateArgs: ["update"],
    uninstall: {
      unix: [
        { kind: "command", program: "npm", args: ["uninstall", "-g", "@xai-official/grok"] },
        { kind: "command", program: "rm", args: ["-f", "~/.grok/bin/grok"] },
        { kind: "command", program: "rm", args: ["-f", "~/.grok/bin/agent"] },
        { kind: "command", program: "rm", args: ["-f", "~/.local/bin/grok"] },
        { kind: "command", program: "rm", args: ["-f", "~/.local/bin/agent"] },
        { kind: "command", program: "rm", args: ["-rf", "~/.grok/downloads"] },
      ],
    },
  },
] as const satisfies readonly RecipeShape[];

export type ToolId = typeof CATALOG[number]["id"];
export type ToolRecipe = RecipeShape & { readonly id: ToolId };
