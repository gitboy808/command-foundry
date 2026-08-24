import type { ChildProcess } from "node:child_process";
import spawn from "cross-spawn";
import type { CommandResult, CommandRunner, RunOptions } from "./manager.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT = 256 * 1024;
const FORCE_KILL_GRACE_MS = 1_000;
const FORWARDED_SIGNALS = ["SIGHUP", "SIGINT", "SIGTERM"] as const;
type ForwardedSignal = typeof FORWARDED_SIGNALS[number];

const activeChildren = new Set<ChildProcess>();
const signalHandlers = new Map<ForwardedSignal, () => void>();

function terminateTree(child: ChildProcess, signal: NodeJS.Signals, done: () => void = () => {}): void {
  if (!child.pid) {
    child.kill(signal);
    done();
    return;
  }
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
    } catch {
      child.kill(signal);
    }
    done();
    return;
  }
  const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", ...(signal === "SIGKILL" ? ["/f"] : [])], {
    shell: false,
    stdio: "ignore",
    windowsHide: true,
  });
  let completed = false;
  const complete = (): void => {
    if (completed) return;
    completed = true;
    done();
  };
  killer.once("error", () => {
    child.kill(signal);
    complete();
  });
  killer.once("close", complete);
}

function removeSignalForwarding(): void {
  for (const [signal, handler] of signalHandlers) process.off(signal, handler);
  signalHandlers.clear();
}

function track(child: ChildProcess): void {
  activeChildren.add(child);
  if (process.platform === "win32" || signalHandlers.size > 0) return;
  for (const signal of FORWARDED_SIGNALS) {
    const handler = (): void => {
      const externallyHandled = process.listeners(signal).some((listener) => listener !== handler);
      for (const activeChild of activeChildren) terminateTree(activeChild, signal);
      removeSignalForwarding();
      if (!externallyHandled) process.kill(process.pid, signal);
    };
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }
}

function untrack(child: ChildProcess): void {
  activeChildren.delete(child);
  if (activeChildren.size === 0) removeSignalForwarding();
}

export class NodeCommandRunner implements CommandRunner {
  async run(program: string, args: readonly string[], options: RunOptions): Promise<CommandResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;
      let forceKillTimer: NodeJS.Timeout | undefined;
      const child = spawn(program, [...args], {
        detached: process.platform !== "win32",
        env: options.env ?? process.env,
        shell: false,
        stdio: options.stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
      });
      track(child);

      const append = (current: string, chunk: Buffer): string => {
        const currentBytes = Buffer.byteLength(current);
        if (currentBytes >= maxOutputBytes) return current;
        return current + chunk.subarray(0, maxOutputBytes - currentBytes).toString("utf8");
      };
      child.stdout?.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
      child.stderr?.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });

      const finish = (result: CommandResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        untrack(child);
        resolve(result);
      };
      const timer = setTimeout(() => {
        timedOut = true;
        terminateTree(child, "SIGTERM");
        forceKillTimer = setTimeout(() => {
          terminateTree(child, "SIGKILL", () => finish({ code: null, stdout, stderr, timedOut }));
        }, FORCE_KILL_GRACE_MS);
      }, timeoutMs);
      child.once("error", (error: NodeJS.ErrnoException) => {
        if (!timedOut) finish({ code: null, stdout, stderr, timedOut, error: error.message, errorCode: error.code });
      });
      child.once("close", (code) => {
        if (!timedOut) finish({ code, stdout, stderr, timedOut });
      });
    });
  }
}
