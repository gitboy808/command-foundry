import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeCommandRunner } from "../src/runner.ts";

test("超时后强制终止忽略 SIGTERM 的子进程", async () => {
  const runner = new NodeCommandRunner();
  const startedAt = Date.now();
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-runner-test-"));
  const marker = path.join(directory, "descendant-alive");
  const descendantScript = `
    const { writeFileSync } = require("node:fs");
    process.on("SIGTERM", () => {});
    setTimeout(() => writeFileSync(${JSON.stringify(marker)}, "alive"), 1_400);
    setTimeout(() => process.exit(0), 1_600);
  `;
  const parentScript = `
    const { spawn } = require("node:child_process");
    spawn(process.execPath, ["-e", ${JSON.stringify(descendantScript)}], { stdio: "ignore" });
    process.on("SIGTERM", () => {});
    setInterval(() => {}, 1_000);
  `;
  const result = await runner.run(
    process.execPath,
    ["-e", parentScript],
    { timeoutMs: 200 },
  );

  assert.equal(result.timedOut, true);
  assert.equal(result.code, null);
  assert.ok(Date.now() - startedAt < 3_000);
  await new Promise((resolve) => setTimeout(resolve, 500));
  try {
    await assert.rejects(access(marker), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("用户中断时会把信号转发给独立进程组", { skip: process.platform === "win32" }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-runner-test-"));
  const marker = path.join(directory, "descendant-alive");
  const descendantScript = `
    const { writeFileSync } = require("node:fs");
    setTimeout(() => writeFileSync(${JSON.stringify(marker)}, "alive"), 700);
    setInterval(() => {}, 1_000);
  `;
  const managedScript = `
    const { spawn } = require("node:child_process");
    spawn(process.execPath, ["-e", ${JSON.stringify(descendantScript)}], { stdio: "ignore" });
    console.log("ready");
    setInterval(() => {}, 1_000);
  `;
  const managerScript = `
    import { NodeCommandRunner } from "./src/runner.ts";
    const runner = new NodeCommandRunner();
    await runner.run(process.execPath, ["-e", ${JSON.stringify(managedScript)}], {
      timeoutMs: 10_000,
      onStdout: (chunk) => process.stdout.write(chunk),
    });
  `;
  const manager = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", managerScript], {
    cwd: path.resolve(import.meta.dirname, ".."),
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await new Promise<void>((resolve, reject) => {
      manager.stdout.setEncoding("utf8");
      manager.stdout.on("data", (chunk: string) => {
        if (chunk.includes("ready")) resolve();
      });
      manager.once("error", reject);
      manager.once("exit", (code, signal) => reject(new Error(`管理进程提前退出：${code ?? signal}`)));
    });
    manager.kill("SIGINT");
    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      manager.once("exit", (code, signal) => resolve({ code, signal }));
    });
    assert.deepEqual(exit, { code: null, signal: "SIGINT" });
    await new Promise((resolve) => setTimeout(resolve, 900));
    await assert.rejects(access(marker), { code: "ENOENT" });
  } finally {
    manager.kill("SIGKILL");
    await rm(directory, { recursive: true, force: true });
  }
});
