import { spawn } from "node:child_process";
import type { CommandResult, CommandRunner, RunOptions } from "./types.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT = 256 * 1024;

export class NodeCommandRunner implements CommandRunner {
  async run(program: string, args: string[], options: RunOptions = {}): Promise<CommandResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;
      const child = spawn(program, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const append = (current: string, chunk: Buffer): string => {
        if (Buffer.byteLength(current) >= maxOutputBytes) return current;
        const remaining = maxOutputBytes - Buffer.byteLength(current);
        return current + chunk.toString("utf8", 0, remaining);
      };
      child.stdout.on("data", (chunk: Buffer) => {
        stdout = append(stdout, chunk);
        options.onStdout?.(chunk.toString("utf8"));
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = append(stderr, chunk);
        options.onStderr?.(chunk.toString("utf8"));
      });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);
      const finish = (result: CommandResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      child.on("error", (error: Error) => {
        finish({ code: null, stdout, stderr, timedOut, error: error.message });
      });
      child.on("close", (code, signal) => {
        finish({ code, signal: signal ?? undefined, stdout, stderr, timedOut });
      });
    });
  }
}
