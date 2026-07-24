import assert from "node:assert/strict";
import test from "node:test";
import { getTool } from "../src/catalog.ts";
import { createPlan, executePlans, formatStep, isAllowedScriptUrl, sourceAvailability } from "../src/plan.ts";
import type { CommandRunner, ToolStatus } from "../src/types.ts";

function status(id: "claude" | "pi"): ToolStatus {
  const tool = getTool(id)!;
  return {
    tool,
    state: "update_available",
    active: { source: "npm", path: "/tmp/bin/tool", version: "1.0.0", active: true, confidence: "high", evidence: [] },
    installations: [],
    latest: { npm: "1.1.0" },
    warnings: [],
  };
}

test("npm 计划使用最新版本且不拼接 shell", () => {
  const plan = createPlan(status("pi"), "update", "npm");
  assert.deepEqual(plan.step, {
    kind: "command",
    program: "npm",
    args: ["install", "-g", "--ignore-scripts", "@earendil-works/pi-coding-agent@latest"],
  });
  assert.match(formatStep(plan.step), /^npm install -g --ignore-scripts/);
});

test("官方安装计划固定使用目录中的 HTTPS 脚本 URL", () => {
  const plan = createPlan({ ...status("claude"), state: "not_installed", active: undefined }, "install", "official");
  assert.equal(plan.step.kind, "script");
  if (plan.step.kind === "script") {
    assert.equal(plan.step.url, "https://claude.ai/install.sh");
    assert.equal(plan.step.shell, "bash");
    assert.deepEqual(plan.step.allowedHosts, ["claude.ai", "downloads.claude.ai"]);
  }
});

test("仅允许各官方安装器声明的重定向域名", () => {
  const kimi = createPlan({ ...status("claude"), tool: getTool("kimi")!, state: "not_installed", active: undefined }, "install", "official");
  const step = kimi.step;
  assert.equal(step.kind, "script");
  if (step.kind !== "script") return;
  assert.equal(isAllowedScriptUrl("https://cdn.kimi.com/kimi-code/install.sh", step.allowedHosts), true);
  assert.equal(isAllowedScriptUrl("https://downloads.claude.ai/bootstrap.sh", step.allowedHosts), false);
  assert.equal(isAllowedScriptUrl("http://cdn.kimi.com/kimi-code/install.sh", step.allowedHosts), false);
});

test("旧版安装不会被静默迁移", () => {
  const current = status("pi");
  current.active = { ...current.active!, legacy: true };
  assert.throws(() => createPlan(current, "update", "npm"), /旧版安装/);
});

test("使用空命令而不是 --version 检查 POSIX shell", async () => {
  const calls: Array<{ program: string; args: string[] }> = [];
  const runner: CommandRunner = {
    async run(program, args) {
      calls.push({ program, args });
      const ok = program !== "sh" || args.join(" ") === "-c exit 0";
      return { code: ok ? 0 : 2, stdout: "", stderr: "", timedOut: false };
    },
  };

  const sources = await sourceAvailability(getTool("codex")!, runner, "linux", {});
  assert.equal(sources.find((source) => source.source === "official")?.available, true);
  assert.deepEqual(calls.find((call) => call.program === "sh")?.args, ["-c", "exit 0"]);
});

test("来源探测保留命令超时原因", async () => {
  const runner: CommandRunner = {
    async run() {
      return { code: null, stdout: "", stderr: "", timedOut: true };
    },
  };

  const sources = await sourceAvailability(getTool("kimi")!, runner, "linux", {});
  assert.equal(sources.find((source) => source.source === "npm")?.reason, "npm 响应超时");
});

test("命令超时后即使退出码为零也判定为失败", async () => {
  const runner: CommandRunner = {
    async run() {
      return { code: 0, stdout: "", stderr: "", timedOut: true };
    },
  };
  const plan = createPlan(status("pi"), "update", "npm");

  const [result] = await executePlans([plan], runner);
  assert.equal(result?.ok, false);
  assert.equal(result?.message, "命令执行超时。");
});
