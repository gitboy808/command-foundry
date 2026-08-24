export type ActionStep =
  | { readonly kind: "command"; readonly program: string; readonly args: readonly string[] }
  | { readonly kind: "script"; readonly url: string; readonly allowedHosts: readonly string[]; readonly shell: "bash" | "sh" | "powershell" };

export interface RecipeShape {
  readonly id: string;
  readonly label: string;
  readonly latest: { readonly url: string; readonly field?: "version" | "tag_name" };
  readonly officialPathHints?: readonly string[];
  readonly install: { readonly unix: ActionStep; readonly win32?: ActionStep };
  readonly updateArgs?: readonly string[];
  readonly uninstall: { readonly unix: readonly ActionStep[]; readonly win32?: readonly ActionStep[] };
}

const script = (
  url: string,
  allowedHosts: string[],
  shell: "bash" | "sh" | "powershell",
): ActionStep => ({ kind: "script", url, allowedHosts, shell });

const command = (program: string, ...args: string[]): ActionStep => ({ kind: "command", program, args });
const both = <T>(value: T): { readonly unix: T; readonly win32: T } => ({ unix: value, win32: value });

export const CATALOG = [
  {
    id: "claude",
    label: "Claude Code",
    latest: { url: "https://downloads.claude.ai/claude-code-releases/latest" },
    officialPathHints: ["/.local/share/claude/", "/.local/bin/claude"],
    install: {
      unix: script("https://claude.ai/install.sh", ["claude.ai", "downloads.claude.ai"], "bash"),
      win32: script("https://claude.ai/install.ps1", ["claude.ai", "downloads.claude.ai"], "powershell"),
    },
    uninstall: {
      unix: [
        command("rm", "-f", "~/.local/bin/claude"),
        command("rm", "-rf", "~/.local/share/claude"),
      ],
    },
  },
  {
    id: "codex",
    label: "Codex",
    latest: { url: "https://releases.openai.com/codex/channels/latest", field: "tag_name" },
    officialPathHints: ["/.codex/packages/standalone/"],
    install: {
      unix: script("https://chatgpt.com/codex/install.sh", ["chatgpt.com", "releases.openai.com"], "sh"),
      win32: script("https://chatgpt.com/codex/install.ps1", ["chatgpt.com", "releases.openai.com"], "powershell"),
    },
    uninstall: {
      unix: [
        command("rm", "-f", "~/.local/bin/codex"),
        command("rm", "-rf", "~/.codex/packages/standalone"),
      ],
    },
  },
  {
    id: "kimi",
    label: "Kimi Code",
    latest: { url: "https://code.kimi.com/kimi-code/latest" },
    officialPathHints: ["/.kimi-code/bin/kimi"],
    install: {
      unix: script("https://code.kimi.com/kimi-code/install.sh", ["code.kimi.com", "cdn.kimi.com"], "bash"),
      win32: script("https://code.kimi.com/kimi-code/install.ps1", ["code.kimi.com", "cdn.kimi.com"], "powershell"),
    },
    uninstall: {
      unix: [command("rm", "-f", "~/.kimi-code/bin/kimi")],
    },
  },
  {
    id: "pi",
    label: "Pi",
    latest: { url: "https://pi.dev/api/latest-version", field: "version" },
    install: both(command("npm", "install", "-g", "--ignore-scripts", "@earendil-works/pi-coding-agent")),
    updateArgs: ["update", "--self"],
    uninstall: both([command("npm", "uninstall", "-g", "@earendil-works/pi-coding-agent")]),
  },
  {
    id: "omp",
    label: "OMP",
    latest: { url: "https://registry.npmjs.org/@oh-my-pi%2fpi-coding-agent/latest", field: "version" },
    officialPathHints: ["/.local/bin/omp", "/appdata/local/omp/"],
    install: {
      unix: script("https://omp.sh/install", ["omp.sh", "raw.githubusercontent.com"], "sh"),
      win32: script("https://omp.sh/install.ps1", ["omp.sh", "raw.githubusercontent.com"], "powershell"),
    },
    uninstall: {
      unix: [
        command("bun", "uninstall", "-g", "@oh-my-pi/pi-coding-agent"),
        command("rm", "-f", "~/.local/bin/omp"),
      ],
    },
  },
  {
    id: "mmx",
    label: "MiniMax CLI",
    latest: { url: "https://registry.npmjs.org/mmx-cli/latest", field: "version" },
    install: both(command("npm", "install", "-g", "mmx-cli")),
    uninstall: both([command("npm", "uninstall", "-g", "mmx-cli")]),
  },
  {
    id: "grok",
    label: "Grok Build",
    latest: { url: "https://x.ai/cli/stable" },
    officialPathHints: ["/.grok/downloads/"],
    install: {
      unix: script("https://x.ai/cli/install.sh", ["x.ai"], "bash"),
      win32: script("https://x.ai/cli/install.ps1", ["x.ai"], "powershell"),
    },
    uninstall: {
      unix: [
        command("npm", "uninstall", "-g", "@xai-official/grok"),
        command("rm", "-f", "~/.grok/bin/grok"),
        command("rm", "-f", "~/.grok/bin/agent"),
        command("rm", "-f", "~/.local/bin/grok"),
        command("rm", "-f", "~/.local/bin/agent"),
        command("rm", "-rf", "~/.grok/downloads"),
      ],
    },
  },
] as const satisfies readonly RecipeShape[];

export type ToolId = typeof CATALOG[number]["id"];
export type ToolRecipe = RecipeShape & { readonly id: ToolId };
