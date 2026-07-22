import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getTool } from "../src/catalog.ts";
import { detectTool } from "../src/detector.ts";
import type { CommandResult, CommandRunner } from "../src/types.ts";

class FakeRunner implements CommandRunner {
  constructor(private readonly npmRoot: string) {}

  async run(program: string, args: string[]): Promise<CommandResult> {
    if (program === "npm" && args.join(" ") === "root -g") return this.result(this.npmRoot);
    if (program === "npm" && args[0] === "view") return this.result('"2.0.0"');
    if (program === "brew") return { code: null, stdout: "", stderr: "", timedOut: false, error: "spawn brew ENOENT" };
    if (program.endsWith("/claude") || program.endsWith("/kimi")) return this.result(`${program.includes("kimi") ? "kimi" : "claude"} 1.0.0`);
    return this.result("");
  }

  private result(stdout: string): CommandResult {
    return { code: 0, stdout, stderr: "", timedOut: false };
  }
}

test("识别 PATH 当前生效的 npm 安装并查询最新版", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-test-"));
  const npmRoot = path.join(directory, "lib", "node_modules");
  const packageRoot = path.join(npmRoot, "@anthropic-ai", "claude-code");
  const binDirectory = path.join(directory, "bin");
  await mkdir(packageRoot, { recursive: true });
  await mkdir(binDirectory, { recursive: true });
  const target = path.join(packageRoot, "cli.js");
  await writeFile(target, "#!/usr/bin/env node\n");
  await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({ version: "1.0.0", bin: { claude: "cli.js" } }));
  const visible = path.join(binDirectory, "claude");
  await symlink(target, visible);
  await chmod(target, 0o755);

  const status = await detectTool(getTool("claude")!, {
    runner: new FakeRunner(npmRoot),
    env: { PATH: binDirectory },
    home: directory,
    platform: "linux",
    fetchText: async () => "2.0.0",
  });
  assert.equal(status.state, "update_available");
  assert.equal(status.active?.source, "npm");
  assert.equal(status.active?.version, "1.0.0");
  assert.equal(status.latest.npm, "2.0.0");
});

test("官方路径可识别，离线时不产生写入计划", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-test-"));
  const binDirectory = path.join(directory, ".kimi-code", "bin");
  await mkdir(binDirectory, { recursive: true });
  const binary = path.join(binDirectory, "kimi");
  await writeFile(binary, "#!/bin/sh\nprintf 'kimi 1.0.0\\n'\n");
  await chmod(binary, 0o755);
  const status = await detectTool(getTool("kimi")!, {
    runner: new FakeRunner(path.join(directory, "empty")),
    env: { PATH: binDirectory },
    home: directory,
    platform: "linux",
    network: false,
  });
  assert.equal(status.active?.source, "official");
  assert.equal(status.state, "latest_unavailable");
});

test("空的 Codex standalone 目录不会阻止重新安装", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-test-"));
  await mkdir(path.join(directory, ".codex", "packages", "standalone"), { recursive: true });

  const status = await detectTool(getTool("codex")!, {
    runner: new FakeRunner(path.join(directory, "empty")),
    env: { PATH: "" },
    home: directory,
    platform: "linux",
    network: false,
  });

  assert.equal(status.state, "not_installed");
  assert.equal(status.installations.length, 0);
});

test("Windows 优先使用 PATHEXT 并识别 npm cmd shim", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-test-"));
  const npmRoot = path.join(directory, "node_modules");
  const packageRoot = path.join(npmRoot, "@moonshot-ai", "kimi-code");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(path.join(packageRoot, "cli.js"), "#!/usr/bin/env node\n");
  await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({ version: "1.0.0", bin: { kimi: "cli.js" } }));
  await writeFile(path.join(directory, "kimi"), "#!/bin/sh\n");
  await writeFile(path.join(directory, "kimi.cmd"), "@echo off\r\nnode %~dp0\\node_modules\\@moonshot-ai\\kimi-code\\cli.js %*\r\n");

  const status = await detectTool(getTool("kimi")!, {
    runner: new FakeRunner(npmRoot),
    env: { PATH: directory, PATHEXT: ".cmd;.exe" },
    home: directory,
    platform: "win32",
    network: false,
  });

  assert.equal(status.active?.source, "npm");
  assert.equal(status.active?.version, "1.0.0");
});

test("Windows npm cmd shim 只匹配实际指向的包", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-test-"));
  const npmRoot = path.join(directory, "node_modules");
  for (const [packageName, version] of [["@moonshot-ai/kimi-code", "1.0.0"], ["kimi-cli", "0.1.0"]]) {
    const packageRoot = path.join(npmRoot, ...packageName.split("/"));
    await mkdir(packageRoot, { recursive: true });
    await writeFile(path.join(packageRoot, "cli.js"), "#!/usr/bin/env node\n");
    await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({ version, bin: { kimi: "cli.js" } }));
  }
  await writeFile(path.join(directory, "kimi.cmd"), "@echo off\r\nnode %~dp0\\node_modules\\kimi-cli\\cli.js %*\r\n");

  const status = await detectTool(getTool("kimi")!, {
    runner: new FakeRunner(npmRoot),
    env: { PATH: directory, PATHEXT: ".cmd" },
    home: directory,
    platform: "win32",
    network: false,
  });

  assert.equal(status.active?.packageName, "kimi-cli");
  assert.equal(status.active?.legacy, true);
  assert.equal(status.state, "source_unknown");
});
