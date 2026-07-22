import type { ChildProcess } from "node:child_process";
import spawn from "cross-spawn";
import type { CommandResult, CommandRunner, RunOptions } from "./types.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT = 256 * 1024;
const FORCE_KILL_GRACE_MS = 1_000;
const FORWARDED_SIGNALS = ["SIGHUP", "SIGINT", "SIGTERM"] as const;
type ForwardedSignal = typeof FORWARDED_SIGNALS[number];

const activeChildren = new Set<ChildProcess>();
const signalHandlers = new Map<ForwardedSignal, () => void>();

function terminateProcessTree(child: ChildProcess, signal: NodeJS.Signals, done: () => void = () => {}): void {
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

function trackChild(child: ChildProcess): void {
  activeChildren.add(child);
  if (process.platform === "win32" || signalHandlers.size > 0) return;
  // detached 进程组收不到终端信号；统一转发后恢复 Node 的默认退出行为。
  for (const signal of FORWARDED_SIGNALS) {
    const handler = (): void => {
      const hasExternalHandler = process.listeners(signal).some((listener) => listener !== handler);
      for (const activeChild of activeChildren) terminateProcessTree(activeChild, signal);
      removeSignalForwarding();
      if (!hasExternalHandler) process.kill(process.pid, signal);
    };
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }
}

function untrackChild(child: ChildProcess): void {
  activeChildren.delete(child);
  if (activeChildren.size === 0) removeSignalForwarding();
}

export class NodeCommandRunner implements CommandRunner {
  async run(program: string, args: string[], options: RunOptions = {}): Promise<CommandResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;
      let forceKillTimer: NodeJS.Timeout | undefined;
      // POSIX 子进程使用独立进程组，确保超时能终止安装器派生的所有进程。
      const child = spawn(program, args, {
        cwd: options.cwd,
        detached: process.platform !== "win32",
        env: options.env ?? process.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      trackChild(child);
      const append = (current: string, chunk: Buffer): string => {
        if (Buffer.byteLength(current) >= maxOutputBytes) return current;
        const remaining = maxOutputBytes - Buffer.byteLength(current);
        return current + chunk.toString("utf8", 0, remaining);
      };
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout = append(stdout, chunk);
        options.onStdout?.(chunk.toString("utf8"));
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = append(stderr, chunk);
        options.onStderr?.(chunk.toString("utf8"));
      });
      const timer = setTimeout(() => {
        timedOut = true;
        terminateProcessTree(child, "SIGTERM");
        forceKillTimer = setTimeout(() => {
          terminateProcessTree(child, "SIGKILL", () => {
            finish({ code: null, signal: "SIGKILL", stdout, stderr, timedOut });
          });
        }, FORCE_KILL_GRACE_MS);
      }, timeoutMs);
      const finish = (result: CommandResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        untrackChild(child);
        resolve(result);
      };
      child.on("error", (error: Error) => {
        if (timedOut) return;
        finish({ code: null, stdout, stderr, timedOut, error: error.message });
      });
      child.on("close", (code, signal) => {
        if (timedOut) return;
        finish({ code, signal: signal ?? undefined, stdout, stderr, timedOut });
      });
    });
  }
}
