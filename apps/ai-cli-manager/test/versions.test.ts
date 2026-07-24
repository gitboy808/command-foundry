import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, extractVersion, isUpdateAvailable } from "../src/versions.ts";

test("解析常见 CLI 版本输出", () => {
  assert.equal(extractVersion("codex-cli 0.144.6"), "0.144.6");
  assert.equal(extractVersion("v2.1.216-beta.1"), "2.1.216-beta.1");
  assert.equal(extractVersion("tool 1.2"), "1.2");
  assert.equal(extractVersion("tool 1.2.3.4"), "1.2.3.4");
  assert.equal(extractVersion("1.2.3+build.456"), "1.2.3");
  assert.equal(extractVersion(""), undefined);
  assert.equal(extractVersion("no version"), undefined);
});

test("比较稳定版和预发布版本", () => {
  assert.equal(compareVersions("1.2.0", "1.1.9"), 1);
  assert.equal(compareVersions("1.2.0-beta.1", "1.2.0"), -1);
  assert.equal(compareVersions("1.2.0", "1.2.0"), 0);
  assert.equal(compareVersions("1.2.3.5", "1.2.3.4"), 1);
  assert.equal(isUpdateAvailable("1.0.0", "1.0.1"), true);
  assert.equal(isUpdateAvailable("1.0.0", "0.9.9"), false);
});
