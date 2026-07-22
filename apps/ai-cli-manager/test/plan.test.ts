import assert from "node:assert/strict";
import test from "node:test";
import { getTool } from "../src/catalog.ts";
import { createPlan, formatStep, isAllowedScriptUrl } from "../src/plan.ts";
import type { ToolStatus } from "../src/types.ts";

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
  assert.deepEqual(plan.steps[0], {
    kind: "command",
    program: "npm",
    args: ["install", "-g", "--ignore-scripts", "@earendil-works/pi-coding-agent@latest"],
    label: "Pi npm 更新",
  });
  assert.match(formatStep(plan.steps[0]), /^npm install -g --ignore-scripts/);
});

test("官方安装计划固定使用目录中的 HTTPS 脚本 URL", () => {
  const plan = createPlan({ ...status("claude"), state: "not_installed", active: undefined }, "install", "official");
  assert.equal(plan.steps[0].kind, "script");
  if (plan.steps[0].kind === "script") {
    assert.equal(plan.steps[0].url, "https://claude.ai/install.sh");
    assert.equal(plan.steps[0].shell, "bash");
    assert.deepEqual(plan.steps[0].allowedHosts, ["claude.ai", "downloads.claude.ai"]);
  }
});

test("仅允许各官方安装器声明的重定向域名", () => {
  const kimi = createPlan({ ...status("claude"), tool: getTool("kimi")!, state: "not_installed", active: undefined }, "install", "official");
  const step = kimi.steps[0];
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
