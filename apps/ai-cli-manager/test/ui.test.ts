import assert from "node:assert/strict";
import test from "node:test";
import { getTool } from "../src/catalog.ts";
import type { ToolStatus } from "../src/types.ts";
import { formatStatus, statusAction } from "../src/ui.ts";

function unknownStatus(toolId: "claude" | "kimi", state: "source_unknown" | "version_unknown"): ToolStatus {
  const tool = getTool(toolId)!;
  return {
    tool,
    state,
    active: {
      source: state === "source_unknown" ? "unknown" : "official",
      path: `/tmp/${tool.command}`,
      active: true,
      confidence: "low",
      evidence: [],
    },
    installations: [],
    latest: {},
    warnings: [],
  };
}

test("Kimi 来源不明或版本未知时允许重新安装", () => {
  for (const state of ["source_unknown", "version_unknown"] as const) {
    const status = unknownStatus("kimi", state);
    assert.equal(statusAction(status), "install");
    assert.match(formatStatus(status), /可重新安装/);
  }
});

test("其他工具的未知状态仍保持不可操作", () => {
  const status = unknownStatus("claude", "source_unknown");
  assert.equal(statusAction(status), undefined);
  assert.doesNotMatch(formatStatus(status), /可重新安装/);
});
