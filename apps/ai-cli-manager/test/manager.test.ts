import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import { access, chmod, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import {
  createCliManager,
  type CommandResult,
  type CommandRunner,
  type RunOptions,
} from "../src/manager.ts";

class LocalCliRunner implements CommandRunner {
  constructor(private readonly versions: Record<string, string | undefined>) {}

  async run(program: string, args: string[], options: RunOptions): Promise<CommandResult> {
    assert.deepEqual(args, ["--version"]);
    assert.equal(options.stdio, "capture");
    const output = this.versions[program];
    if (output === undefined) {
      return { code: null, stdout: "", stderr: "", timedOut: false, error: `spawn ${program} ENOENT`, errorCode: "ENOENT" };
    }
    return { code: 0, stdout: output, stderr: "", timedOut: false };
  }
}

async function scanSources(targets: Record<string, string>) {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-source-"));
  const bin = path.join(directory, "bin");
  try {
    await mkdir(bin, { recursive: true });
    for (const [command, relativeTarget] of Object.entries(targets)) {
      const target = path.join(directory, relativeTarget);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, `#!${process.execPath}\nconsole.log("1.0.0");\n`, { mode: 0o755 });
      await symlink(target, path.join(bin, command));
    }
    const statuses = await createCliManager({ platform: "linux", env: { PATH: bin, HOME: directory } }).scan();
    return statuses.filter((status) => status.version).map(({ id, source }) => ({ id, source }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("扫描只读取 PATH 当前生效命令的本地版本", async () => {
  const manager = createCliManager({
    runner: new LocalCliRunner({
      claude: "2.1.226 (Claude Code)",
      codex: "codex-cli 0.147.0",
      kimi: "kimi 0.34.0",
      pi: "0.84.1",
    }),
    platform: "linux",
    env: { PATH: "/test/bin" },
  });

  assert.deepEqual(await manager.scan(), [
    { id: "claude", label: "Claude Code", state: "installed", version: "2.1.226", source: "unknown" },
    { id: "codex", label: "Codex", state: "installed", version: "0.147.0", source: "unknown" },
    { id: "kimi", label: "Kimi Code", state: "installed", version: "0.34.0", source: "unknown" },
    { id: "pi", label: "Pi", state: "installed", version: "0.84.1", source: "unknown" },
    { id: "omp", label: "OMP", state: "missing" },
    { id: "mmx", label: "MiniMax CLI", state: "missing" },
    { id: "grok", label: "Grok Build", state: "missing" },
  ]);
});

test("扫描直接对比官网 latest 并标记可更新版本", async () => {
  const manager = createCliManager({
    runner: new LocalCliRunner({ claude: "1.0.0 (Claude Code)" }),
    platform: "linux",
    env: { PATH: "/test/bin" },
    fetch: async (input) => {
      assert.equal(String(input), "https://downloads.claude.ai/claude-code-releases/latest");
      return new Response("2.0.0");
    },
  });

  assert.deepEqual((await manager.scan({ checkLatest: true }))[0], {
    id: "claude",
    label: "Claude Code",
    state: "installed",
    version: "1.0.0",
    source: "unknown",
    latestVersion: "2.0.0",
    updateState: "outdated",
  });
});

test("扫描统一解析 catalog 中所有官方 latest 端点", async () => {
  const versions = {
    claude: "1.0.0", codex: "2.0.0", kimi: "3.0.0", pi: "4.0.0",
    omp: "5.0.0", mmx: "6.0.0", grok: "7.0.0",
  };
  const manager = createCliManager({
    runner: new LocalCliRunner(versions),
    platform: "linux",
    env: { PATH: "/test/bin" },
    fetch: async (input) => {
      const url = String(input);
      const bodies: Record<string, string | object> = {
        "https://downloads.claude.ai/claude-code-releases/latest": "1.0.0",
        "https://releases.openai.com/codex/channels/latest": { tag_name: "rust-v2.0.0" },
        "https://code.kimi.com/kimi-code/latest": "3.0.0",
        "https://pi.dev/api/latest-version": { version: "4.0.0" },
        "https://registry.npmjs.org/@oh-my-pi%2fpi-coding-agent/latest": { version: "5.0.0" },
        "https://registry.npmjs.org/mmx-cli/latest": { version: "6.0.0" },
        "https://x.ai/cli/stable": "7.0.0",
      };
      const body = bodies[url];
      assert.ok(body, `未声明的 latest URL：${url}`);
      return typeof body === "string" ? new Response(body) : Response.json(body);
    },
  });

  assert.deepEqual(
    (await manager.scan({ checkLatest: true })).map(({ id, latestVersion, updateState }) => ({ id, latestVersion, updateState })),
    Object.entries(versions).map(([id, latestVersion]) => ({ id, latestVersion, updateState: "current" })),
  );
});

test("扫描将同版本号的预发布版本判定为低于正式版", async () => {
  const manager = createCliManager({
    runner: new LocalCliRunner({ claude: "2.0.0-beta.1" }),
    platform: "linux",
    env: { PATH: "/test/bin" },
    fetch: async () => new Response("2.0.0"),
  });

  assert.equal((await manager.scan({ checkLatest: true }))[0]?.updateState, "outdated");
});

test("扫描从 PATH 当前命令的真实路径区分安装来源", { skip: process.platform === "win32" }, async () => {
  assert.deepEqual(await scanSources({
    claude: ".local/share/claude/versions/2.1.241",
    codex: "n/lib/node_modules/@openai/codex/bin/codex.js",
    kimi: ".local/share/mise/installs/kimi/1.0.0/bin/kimi",
    pi: "custom/pi",
    omp: "homebrew/Cellar/omp/1.0.0/bin/omp",
    mmx: ".bun/install/global/node_modules/mmx-cli/bin/mmx",
    grok: ".local/share/pnpm/global/5/node_modules/@xai-official/grok/bin/grok",
  }), [
    { id: "claude", source: "official" },
    { id: "codex", source: "npm" },
    { id: "kimi", source: "mise" },
    { id: "pi", source: "unknown" },
    { id: "omp", source: "homebrew" },
    { id: "mmx", source: "bun" },
    { id: "grok", source: "pnpm" },
  ]);
});

test("扫描识别 catalog 声明的官方安装目录", { skip: process.platform === "win32" }, async () => {
  assert.deepEqual(await scanSources({
    codex: ".codex/packages/standalone/releases/1.0.0/bin/codex",
    kimi: ".kimi-code/bin/kimi",
    omp: ".local/bin/omp",
    grok: ".grok/downloads/grok-darwin-arm64",
  }), [
    { id: "codex", source: "official" },
    { id: "kimi", source: "official" },
    { id: "omp", source: "official" },
    { id: "grok", source: "official" },
  ]);
});

test("扫描识别 Windows npm 全局命令 shim", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-npm-shim-"));
  const npmBin = path.join(directory, "AppData", "Roaming", "npm");
  try {
    await mkdir(npmBin, { recursive: true });
    await writeFile(path.join(npmBin, "codex.CMD"), "@echo off\r\n");
    const statuses = await createCliManager({
      runner: new LocalCliRunner({ codex: "codex-cli 0.149.1" }),
      platform: "win32",
      env: { PATH: npmBin, PATHEXT: ".CMD" },
    }).scan();
    assert.equal(statuses.find(({ id }) => id === "codex")?.source, "npm");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("更新委托给 PATH 中的上游命令并在继承终端后复检版本", async () => {
  const versions: Record<string, string> = {
    claude: "1.0.0",
    codex: "1.0.0",
    kimi: "1.0.0",
    pi: "1.0.0",
    omp: "1.0.0",
  };
  const updateArgs: Record<string, string> = {
    claude: "update",
    codex: "update",
    kimi: "update",
    pi: "update --self",
    omp: "update",
  };
  const runner: CommandRunner = {
    async run(program, args, options) {
      if (options.stdio === "capture") {
        assert.deepEqual(args, ["--version"]);
        return { code: 0, stdout: versions[program] ?? "", stderr: "", timedOut: false };
      }
      if (args.join(" ") !== updateArgs[program]) {
        return { code: 2, stdout: "", stderr: "错误的更新命令", timedOut: false };
      }
      versions[program] = "1.1.0";
      return { code: 0, stdout: "", stderr: "", timedOut: false };
    },
  };
  const manager = createCliManager({ runner, platform: "linux", env: { PATH: "/test/bin" } });

  assert.deepEqual(await manager.run([
    { toolId: "claude", operation: "update" },
    { toolId: "codex", operation: "update" },
    { toolId: "kimi", operation: "update" },
    { toolId: "pi", operation: "update" },
    { toolId: "omp", operation: "update" },
  ]), [
    { toolId: "claude", label: "Claude Code", operation: "update", outcome: "changed", beforeVersion: "1.0.0", afterVersion: "1.1.0" },
    { toolId: "codex", label: "Codex", operation: "update", outcome: "changed", beforeVersion: "1.0.0", afterVersion: "1.1.0" },
    { toolId: "kimi", label: "Kimi Code", operation: "update", outcome: "changed", beforeVersion: "1.0.0", afterVersion: "1.1.0" },
    { toolId: "pi", label: "Pi", operation: "update", outcome: "changed", beforeVersion: "1.0.0", afterVersion: "1.1.0" },
    { toolId: "omp", label: "OMP", operation: "update", outcome: "changed", beforeVersion: "1.0.0", afterVersion: "1.1.0" },
  ]);
});

test("批量动作严格串行执行", async () => {
  const versions: Record<string, string> = { claude: "1.0.0", codex: "1.0.0" };
  const events: string[] = [];
  let activeActions = 0;
  let maxActiveActions = 0;
  const runner: CommandRunner = {
    async run(program, _args, options) {
      if (options.stdio === "capture") {
        return versions[program]
          ? { code: 0, stdout: versions[program], stderr: "", timedOut: false }
          : { code: null, stdout: "", stderr: "", timedOut: false, errorCode: "ENOENT" };
      }
      events.push(`start:${program}`);
      activeActions += 1;
      maxActiveActions = Math.max(maxActiveActions, activeActions);
      await new Promise((resolve) => setTimeout(resolve, 20));
      versions[program] = "1.1.0";
      activeActions -= 1;
      events.push(`end:${program}`);
      return { code: 0, stdout: "", stderr: "", timedOut: false };
    },
  };
  const manager = createCliManager({ runner, platform: "linux", env: { PATH: "/test/bin" } });

  const results = await manager.run([
    { toolId: "claude", operation: "update" },
    { toolId: "codex", operation: "update" },
  ]);

  assert.equal(maxActiveActions, 1);
  assert.deepEqual(events, ["start:claude", "end:claude", "start:codex", "end:codex"]);
  assert.deepEqual(results.map((result) => result.outcome), ["changed", "changed"]);
});

test("并发只读扫描不会死锁或遗留信号监听器", { skip: process.platform === "win32" }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-scan-"));
  const source = `#!${process.execPath}\nsetTimeout(() => console.log("1.0.0"), 10);\n`;
  for (const command of ["claude", "codex", "kimi", "pi", "omp", "mmx", "grok"]) {
    const binary = path.join(directory, command);
    await writeFile(binary, source);
    await chmod(binary, 0o755);
  }
  const listenerCounts = Object.fromEntries(
    (["SIGHUP", "SIGINT", "SIGTERM"] as const).map((signal) => [signal, process.listenerCount(signal)]),
  );

  try {
    const manager = createCliManager({ env: { ...process.env, PATH: directory } });
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("并发扫描超时")), 5_000).unref();
    });
    const scans = await Promise.race([
      Promise.all(Array.from({ length: 10 }, () => manager.scan())),
      timeout,
    ]);
    assert.equal(scans.length, 10);
    assert.ok(scans.every((statuses) => statuses.every((status) => status.version === "1.0.0")));
    for (const [signal, count] of Object.entries(listenerCounts)) {
      assert.equal(process.listenerCount(signal as NodeJS.Signals), count);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("退出码为零但版本不变时保持中性，单项异常不阻断后续动作", async () => {
  const versions: Record<string, string> = { claude: "1.0.0", codex: "1.0.0", pi: "1.0.0" };
  const runner: CommandRunner = {
    async run(program, args, options) {
      if (options.stdio === "capture") {
        if (versions[program]) return { code: 0, stdout: versions[program], stderr: "", timedOut: false };
        return { code: null, stdout: "", stderr: "", timedOut: false, errorCode: "ENOENT", error: "ENOENT" };
      }
      if (program === "codex") throw new Error("无法启动更新器");
      if (program === "pi" && args.join(" ") === "update --self") versions.pi = "1.1.0";
      return { code: 0, stdout: "", stderr: "", timedOut: false };
    },
  };
  const manager = createCliManager({ runner, platform: "linux", env: { PATH: "/test/bin" } });

  assert.deepEqual(await manager.run([
    { toolId: "claude", operation: "update" },
    { toolId: "codex", operation: "update" },
    { toolId: "pi", operation: "update" },
  ]), [
    {
      toolId: "claude",
      label: "Claude Code",
      operation: "update",
      outcome: "unchanged",
      beforeVersion: "1.0.0",
      afterVersion: "1.0.0",
      message: "版本无变化（未核验官网最新版，或上游给出了手动步骤）。",
    },
    {
      toolId: "codex",
      label: "Codex",
      operation: "update",
      outcome: "failed",
      beforeVersion: "1.0.0",
      afterVersion: "1.0.0",
      message: "无法启动更新器",
    },
    {
      toolId: "pi",
      label: "Pi",
      operation: "update",
      outcome: "changed",
      beforeVersion: "1.0.0",
      afterVersion: "1.1.0",
    },
  ]);
});

test("更新器返回成功但仍低于官网版本时不报告最新版", async () => {
  const runner: CommandRunner = {
    async run(_program, _args, options) {
      return options.stdio === "capture"
        ? { code: 0, stdout: "1.0.0", stderr: "", timedOut: false }
        : { code: 0, stdout: "", stderr: "", timedOut: false };
    },
  };
  const manager = createCliManager({
    runner,
    platform: "linux",
    env: { PATH: "/test/bin" },
    fetch: async () => new Response("2.0.0"),
  });

  assert.deepEqual(await manager.run(
    [{ toolId: "claude", operation: "update" }],
    { verifyLatest: true },
  ), [{
    toolId: "claude",
    label: "Claude Code",
    operation: "update",
    outcome: "unchanged",
    beforeVersion: "1.0.0",
    afterVersion: "1.0.0",
    message: "版本无变化，仍低于官网最新版 2.0.0。",
  }]);
});

test("OMP 缺失时只执行 catalog 中的推荐安装脚本并复检版本", async () => {
  let ompVersion: string | undefined;
  const runner: CommandRunner = {
    async run(program, args, options) {
      if (options.stdio === "capture") {
        if (program === "omp" && ompVersion) return { code: 0, stdout: `omp/${ompVersion}`, stderr: "", timedOut: false };
        return { code: null, stdout: "", stderr: "", timedOut: false, errorCode: "ENOENT", error: "ENOENT" };
      }
      assert.equal(program, "sh");
      assert.equal(args.length, 1);
      ompVersion = "0.12.4";
      return { code: 0, stdout: "", stderr: "", timedOut: false };
    },
  };
  const redirect = new Response(null, {
    status: 302,
    headers: { location: "https://raw.githubusercontent.com/can1357/oh-my-pi/main/scripts/install.sh" },
  });
  Object.defineProperty(redirect, "url", { value: "https://omp.sh/install" });
  const response = new Response("#!/bin/sh\n");
  Object.defineProperty(response, "url", { value: "https://raw.githubusercontent.com/can1357/oh-my-pi/main/scripts/install.sh" });
  let fetchCount = 0;
  const manager = createCliManager({
    runner,
    platform: "linux",
    fetch: async (input) => {
      fetchCount += 1;
      assert.equal(String(input), fetchCount === 1
        ? "https://omp.sh/install"
        : "https://raw.githubusercontent.com/can1357/oh-my-pi/main/scripts/install.sh");
      return fetchCount === 1 ? redirect : response;
    },
  });

  assert.deepEqual(await manager.run([{ toolId: "omp", operation: "install" }]), [{
    toolId: "omp",
    label: "OMP",
    operation: "install",
    outcome: "changed",
    afterVersion: "0.12.4",
  }]);
});

test("动作超时会终止整个子进程树", { skip: process.platform === "win32" }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-tree-"));
  const marker = path.join(directory, "descendant-alive");
  const binary = path.join(directory, "claude");
  const descendant = `
    const { writeFileSync } = require("node:fs");
    process.on("SIGTERM", () => {});
    setTimeout(() => writeFileSync(${JSON.stringify(marker)}, "alive"), 1400);
    setTimeout(() => process.exit(0), 1600);
  `;
  const source = `#!${process.execPath}
    if (process.argv[2] === "--version") { console.log("1.0.0"); process.exit(0); }
    const { spawn } = require("node:child_process");
    spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}], { stdio: "ignore" });
    process.on("SIGTERM", () => {});
    setInterval(() => {}, 1000);
  `;
  await writeFile(binary, source);
  await chmod(binary, 0o755);

  try {
    const manager = createCliManager({
      platform: "linux",
      env: { ...process.env, PATH: directory },
      actionTimeoutMs: 200,
    });
    const [result] = await manager.run([{ toolId: "claude", operation: "update" }]);
    assert.deepEqual(result, {
      toolId: "claude",
      label: "Claude Code",
      operation: "update",
      outcome: "failed",
      beforeVersion: "1.0.0",
      afterVersion: "1.0.0",
      message: "动作执行超时。",
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await assert.rejects(access(marker), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("用户中断会转发给整个子进程树", { skip: process.platform === "win32" }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-signal-"));
  const marker = path.join(directory, "descendant-alive");
  const descendant = `
    const { writeFileSync } = require("node:fs");
    setTimeout(() => writeFileSync(${JSON.stringify(marker)}, "alive"), 700);
    setInterval(() => {}, 1000);
  `;
  const managed = `
    const { spawn } = require("node:child_process");
    spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}], { stdio: "ignore" });
    console.log("ready");
    setInterval(() => {}, 1000);
  `;
  const harness = `
    import { NodeCommandRunner } from "./src/runner.ts";
    const runner = new NodeCommandRunner();
    await runner.run(process.execPath, ["-e", ${JSON.stringify(managed)}], {
      stdio: "inherit",
      timeoutMs: 10000,
    });
  `;
  const manager = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", harness], {
    cwd: path.resolve(import.meta.dirname, ".."),
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        manager.stdout.setEncoding("utf8");
        manager.stdout.on("data", (chunk: string) => {
          if (chunk.includes("ready")) resolve();
        });
        manager.once("error", reject);
        manager.once("exit", (code, signal) => reject(new Error(`管理进程提前退出：${code ?? signal}`)));
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("等待子进程就绪超时")), 3_000)),
    ]);
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

test("Codex 安装允许 releases.openai.com 重定向并拒绝非白名单跳转", async () => {
  let codexVersion: string | undefined;
  const runner: CommandRunner = {
    async run(program, _args, options) {
      if (options.stdio === "capture") {
        if (program === "codex" && codexVersion) return { code: 0, stdout: `codex-cli ${codexVersion}`, stderr: "", timedOut: false };
        return { code: null, stdout: "", stderr: "", timedOut: false, errorCode: "ENOENT", error: "ENOENT" };
      }
      codexVersion = "0.147.0";
      return { code: 0, stdout: "", stderr: "", timedOut: false };
    },
  };
  const redirect = new Response(null, { status: 302, headers: { location: "https://releases.openai.com/codex/install.sh" } });
  Object.defineProperty(redirect, "url", { value: "https://chatgpt.com/codex/install.sh" });
  const installer = new Response("#!/bin/sh\n");
  Object.defineProperty(installer, "url", { value: "https://releases.openai.com/codex/install.sh" });
  const requested: string[] = [];
  const manager = createCliManager({
    runner,
    platform: "linux",
    fetch: async (input) => {
      requested.push(String(input));
      return requested.length === 1 ? redirect : installer;
    },
  });

  assert.equal((await manager.run([{ toolId: "codex", operation: "install" }]))[0]?.outcome, "changed");
  assert.deepEqual(requested, [
    "https://chatgpt.com/codex/install.sh",
    "https://releases.openai.com/codex/install.sh",
  ]);

  codexVersion = undefined;
  const unsafeRedirect = new Response(null, { status: 302, headers: { location: "https://example.com/installer.sh" } });
  Object.defineProperty(unsafeRedirect, "url", { value: "https://chatgpt.com/codex/install.sh" });
  const unsafeManager = createCliManager({ runner, platform: "linux", fetch: async () => unsafeRedirect });
  assert.deepEqual(await unsafeManager.run([{ toolId: "codex", operation: "install" }]), [{
    toolId: "codex",
    label: "Codex",
    operation: "install",
    outcome: "failed",
    message: "官方安装脚本重定向到了不受信任的域名。",
  }]);
});

test("安装脚本超过大小限制时取消下载且不执行", async () => {
  let cancelled = false;
  let inherited = false;
  const runner: CommandRunner = {
    async run(_program, _args, options) {
      if (options.stdio === "inherit") inherited = true;
      return { code: null, stdout: "", stderr: "", timedOut: false, errorCode: "ENOENT", error: "ENOENT" };
    },
  };
  const body = new ReadableStream<Uint8Array>({ cancel: () => { cancelled = true; } });
  const response = new Response(body, { headers: { "content-length": String(2 * 1024 * 1024 + 1) } });
  Object.defineProperty(response, "url", { value: "https://omp.sh/install" });

  const manager = createCliManager({ runner, platform: "linux", fetch: async () => response });
  assert.deepEqual(await manager.run([{ toolId: "omp", operation: "install" }]), [{
    toolId: "omp",
    label: "OMP",
    operation: "install",
    outcome: "failed",
    message: "官方安装脚本超过允许的大小。",
  }]);
  assert.equal(cancelled, true);
  assert.equal(inherited, false);
});

test("上游退出码为零但动作后版本不可读时报告失败", async () => {
  let readable = true;
  const runner: CommandRunner = {
    async run(program, _args, options) {
      if (options.stdio === "inherit") {
        readable = false;
        return { code: 0, stdout: "", stderr: "", timedOut: false };
      }
      if (program === "kimi" && readable) return { code: 0, stdout: "kimi 1.0.0", stderr: "", timedOut: false };
      return { code: 1, stdout: "", stderr: "版本错误", timedOut: false };
    },
  };
  const manager = createCliManager({ runner, platform: "linux" });

  assert.deepEqual(await manager.run([{ toolId: "kimi", operation: "update" }]), [{
    toolId: "kimi",
    label: "Kimi Code",
    operation: "update",
    outcome: "failed",
    beforeVersion: "1.0.0",
    message: "动作完成，但无法重新读取版本。",
  }]);
});

test("preview 返回任意操作的精确计划，多步骤用 && 连接", () => {
  const manager = createCliManager({ platform: "linux" });
  assert.equal(
    manager.preview({ toolId: "claude", operation: "uninstall" }),
    "rm -f ~/.local/bin/claude && rm -rf ~/.local/share/claude",
  );
  assert.equal(
    manager.preview({ toolId: "pi", operation: "uninstall" }),
    "npm uninstall -g @earendil-works/pi-coding-agent",
  );
  assert.equal(manager.preview({ toolId: "mmx", operation: "update" }), "mmx update");
  assert.equal(
    manager.preview({ toolId: "mmx", operation: "install" }),
    "npm install -g mmx-cli",
  );
  assert.equal(
    manager.preview({ toolId: "grok", operation: "uninstall" }),
    "npm uninstall -g @xai-official/grok && rm -f ~/.grok/bin/grok && rm -f ~/.grok/bin/agent && rm -f ~/.local/bin/grok && rm -f ~/.local/bin/agent && rm -rf ~/.grok/downloads",
  );

  const windowsManager = createCliManager({ platform: "win32" });
  assert.equal(
    windowsManager.preview({ toolId: "pi", operation: "uninstall" }),
    "npm uninstall -g @earendil-works/pi-coding-agent",
  );
  assert.throws(
    () => windowsManager.preview({ toolId: "claude", operation: "uninstall" }),
    /Claude Code 不支持当前平台的卸载方式。/,
  );
  assert.throws(
    () => windowsManager.preview({ toolId: "grok", operation: "uninstall" }),
    /Grok Build 不支持当前平台的卸载方式。/,
  );
});

test("卸载执行原生步骤并在命令从 PATH 消失后判成功", async () => {
  const versions: Record<string, string | undefined> = { claude: "2.1.226", mmx: "1.0.19" };
  const steps: string[] = [];
  const runner: CommandRunner = {
    async run(program, args, options) {
      if (options.stdio === "capture") {
        const output = versions[program];
        if (output === undefined) {
          return { code: null, stdout: "", stderr: "", timedOut: false, errorCode: "ENOENT", error: "ENOENT" };
        }
        return { code: 0, stdout: output, stderr: "", timedOut: false };
      }
      steps.push([program, ...args].join(" "));
      if (program === "rm" && args.some((arg) => arg.endsWith(".local/bin/claude"))) versions.claude = undefined;
      if (program === "npm" && args.includes("mmx-cli")) versions.mmx = undefined;
      return { code: 0, stdout: "", stderr: "", timedOut: false };
    },
  };
  const manager = createCliManager({ runner, platform: "linux", env: { PATH: "/test/bin" } });

  assert.deepEqual(await manager.run([
    { toolId: "claude", operation: "uninstall" },
    { toolId: "mmx", operation: "uninstall" },
  ]), [
    { toolId: "claude", label: "Claude Code", operation: "uninstall", outcome: "changed", beforeVersion: "2.1.226" },
    { toolId: "mmx", label: "MiniMax CLI", operation: "uninstall", outcome: "changed", beforeVersion: "1.0.19" },
  ]);
  const home = homedir();
  assert.deepEqual(steps, [
    `rm -f ${path.join(home, ".local/bin/claude")}`,
    `rm -rf ${path.join(home, ".local/share/claude")}`,
    "npm uninstall -g mmx-cli",
  ]);
});

test("卸载步骤尽力执行，单步启动失败不阻断后续步骤", async () => {
  let ompVersion: string | undefined = "0.12.4";
  const steps: string[] = [];
  const runner: CommandRunner = {
    async run(program, _args, options) {
      if (options.stdio === "capture") {
        if (program === "omp" && ompVersion) return { code: 0, stdout: `omp/${ompVersion}`, stderr: "", timedOut: false };
        return { code: null, stdout: "", stderr: "", timedOut: false, errorCode: "ENOENT", error: "ENOENT" };
      }
      steps.push(program);
      if (program === "bun") {
        return { code: null, stdout: "", stderr: "", timedOut: false, error: "spawn bun ENOENT", errorCode: "ENOENT" };
      }
      if (program === "rm") ompVersion = undefined;
      return { code: 0, stdout: "", stderr: "", timedOut: false };
    },
  };
  const manager = createCliManager({ runner, platform: "linux", env: { PATH: "/test/bin" } });

  assert.deepEqual(await manager.run([{ toolId: "omp", operation: "uninstall" }]), [{
    toolId: "omp",
    label: "OMP",
    operation: "uninstall",
    outcome: "changed",
    beforeVersion: "0.12.4",
  }]);
  assert.deepEqual(steps, ["bun", "rm"]);
});

test("卸载命令退出码为零但命令仍在 PATH 中时报告失败", async () => {
  const runner: CommandRunner = {
    async run(_program, _args, options) {
      if (options.stdio === "capture") return { code: 0, stdout: "codex-cli 0.147.0", stderr: "", timedOut: false };
      return { code: 0, stdout: "", stderr: "", timedOut: false };
    },
  };
  const manager = createCliManager({ runner, platform: "linux", env: { PATH: "/test/bin" } });

  assert.deepEqual(await manager.run([{ toolId: "codex", operation: "uninstall" }]), [{
    toolId: "codex",
    label: "Codex",
    operation: "uninstall",
    outcome: "failed",
    beforeVersion: "0.147.0",
    afterVersion: "0.147.0",
    message: "卸载后命令仍在 PATH 中生效，可能由其他方式安装或存在残留副本。",
  }]);
});

test("未安装的工具不能卸载", async () => {
  const runner: CommandRunner = {
    async run() {
      return { code: null, stdout: "", stderr: "", timedOut: false, errorCode: "ENOENT", error: "ENOENT" };
    },
  };
  const manager = createCliManager({ runner, platform: "linux", env: { PATH: "/test/bin" } });

  assert.deepEqual(await manager.run([{ toolId: "kimi", operation: "uninstall" }]), [{
    toolId: "kimi",
    label: "Kimi Code",
    operation: "uninstall",
    outcome: "failed",
    message: "Kimi Code 未安装。",
  }]);
});

async function makeNativeClaude(version: string) {
  const home = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-claude-"));
  const bin = path.join(home, "bin");
  const versionsDir = path.join(home, ".local", "share", "claude", "versions");
  await mkdir(versionsDir, { recursive: true });
  await mkdir(bin, { recursive: true });
  await writeFile(path.join(versionsDir, version), `claude-${version}`, { mode: 0o755 });
  const launcher = path.join(bin, "claude");
  await symlink(path.join(versionsDir, version), launcher);
  return { home, bin, versionsDir, launcher };
}

function nativeClaudeRunner(launcher: string): CommandRunner {
  return {
    async run(program, args, options) {
      assert.equal(program, "claude");
      assert.deepEqual(args, ["--version"]);
      assert.equal(options.stdio, "capture");
      const resolved = await realpath(launcher);
      return { code: 0, stdout: `${path.basename(resolved)} (Claude Code)`, stderr: "", timedOut: false };
    },
  };
}

const CLAUDE_RELEASES = "https://downloads.claude.ai/claude-code-releases";

function claudeReleaseFetch(latest: string, asset: { checksum: string; size: number }, serveBinary: () => Response | Promise<Response>) {
  const manifestEntry = { binary: "claude", checksum: asset.checksum, size: asset.size };
  const requests: string[] = [];
  const fetchImpl = async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);
    if (url === `${CLAUDE_RELEASES}/latest`) return new Response(latest);
    if (url === `${CLAUDE_RELEASES}/${latest}/manifest.json`) {
      return Response.json({ platforms: { "linux-x64": manifestEntry, "linux-x64-musl": manifestEntry } });
    }
    if (url.startsWith(`${CLAUDE_RELEASES}/${latest}/linux-`)) return serveBinary();
    throw new Error(`意外请求：${url}`);
  };
  return { fetchImpl, requests };
}

test("Claude 标准 native 安装直连官网下载、校验并切换软链", { skip: process.platform === "win32" }, async () => {
  const { home, bin, versionsDir, launcher } = await makeNativeClaude("2.1.241");
  try {
    // 目标版本占位会被替换；其他文件不属于本次动作，必须原样保留。
    await writeFile(path.join(versionsDir, "2.1.999"), "");
    await writeFile(path.join(versionsDir, "2.1.252"), "");
    await writeFile(path.join(versionsDir, ".download-stale"), "partial");
    const content = "fake-claude-2.1.252-binary";
    const { fetchImpl } = claudeReleaseFetch(
      "2.1.252",
      { checksum: createHash("sha256").update(content).digest("hex"), size: content.length },
      () => new Response(content),
    );
    const manager = createCliManager({
      runner: nativeClaudeRunner(launcher),
      platform: "linux",
      arch: "x64",
      env: { PATH: bin, HOME: home },
      fetch: fetchImpl,
    });

    assert.deepEqual(await manager.run([{ toolId: "claude", operation: "update" }]), [{
      toolId: "claude",
      label: "Claude Code",
      operation: "update",
      outcome: "changed",
      beforeVersion: "2.1.241",
      afterVersion: "2.1.252",
    }]);
    assert.equal(await readFile(path.join(versionsDir, "2.1.252"), "utf8"), content);
    assert.equal(await realpath(launcher), await realpath(path.join(versionsDir, "2.1.252")));
    assert.equal(await readFile(path.join(versionsDir, "2.1.241"), "utf8"), "claude-2.1.241");
    assert.equal(await readFile(path.join(versionsDir, "2.1.999"), "utf8"), "");
    assert.equal(await readFile(path.join(versionsDir, ".download-stale"), "utf8"), "partial");
    assert.deepEqual((await readdir(versionsDir)).filter((entry) => entry.startsWith(".ai-cli-manager-")), []);
    assert.deepEqual((await readdir(bin)).filter((entry) => entry.startsWith(".ai-cli-manager-")), []);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

const corruptedContent = "corrupted-binary-content";
const oversizedContent = "oversized-binary-content";
for (const failure of [
  { name: "SHA-256 校验失败", content: corruptedContent, checksum: createHash("sha256").update("official-binary-content").digest("hex"), size: corruptedContent.length, message: /SHA-256 校验失败/ },
  { name: "超过发布清单大小", content: oversizedContent, checksum: createHash("sha256").update(oversizedContent).digest("hex"), size: oversizedContent.length - 1, message: /超过发布清单大小/ },
] as const) {
  test(`Claude 直连下载 ${failure.name}会停止且清理本次临时目录`, { skip: process.platform === "win32" }, async () => {
    const { home, bin, versionsDir, launcher } = await makeNativeClaude("2.1.241");
    try {
      const { fetchImpl, requests } = claudeReleaseFetch(
        "2.1.252",
        { checksum: failure.checksum, size: failure.size },
        () => new Response(failure.content),
      );
      const manager = createCliManager({
        runner: nativeClaudeRunner(launcher),
        platform: "linux",
        arch: "x64",
        env: { PATH: bin, HOME: home },
        fetch: fetchImpl,
      });

      const [result] = await manager.run([{ toolId: "claude", operation: "update" }]);
      assert.equal(result?.outcome, "failed");
      assert.match(result?.message ?? "", failure.message);
      assert.equal(requests.filter((url) => url.includes("/linux-")).length, 1);
      assert.equal(await realpath(launcher), await realpath(path.join(versionsDir, "2.1.241")));
      assert.deepEqual((await readdir(versionsDir)).filter((entry) => entry.startsWith(".ai-cli-manager-")), []);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
}

test("Claude 直连下载停滞会被超时掐断且不重试", { skip: process.platform === "win32" }, async () => {
  const { home, bin, versionsDir, launcher } = await makeNativeClaude("2.1.241");
  try {
    const content = "stalled-binary";
    const { fetchImpl, requests } = claudeReleaseFetch(
      "2.1.252",
      { checksum: createHash("sha256").update(content).digest("hex"), size: content.length },
      () => new Response(new ReadableStream({ start() {} })),
    );
    const manager = createCliManager({
      runner: nativeClaudeRunner(launcher),
      platform: "linux",
      arch: "x64",
      env: { PATH: bin, HOME: home },
      fetch: fetchImpl,
      downloadStallMs: 50,
    });

    const [result] = await manager.run([{ toolId: "claude", operation: "update" }]);
    assert.equal(result?.outcome, "failed");
    assert.match(result?.message ?? "", /下载停滞/);
    assert.equal(requests.filter((url) => url.includes("/linux-")).length, 1);
    assert.equal(await realpath(launcher), await realpath(path.join(versionsDir, "2.1.241")));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("Claude 软链切换失败仍会清理本次临时目录和软链", { skip: process.platform === "win32" }, async () => {
  const { home, bin, versionsDir, launcher } = await makeNativeClaude("2.1.241");
  try {
    const latest = "2.1.252";
    const content = "fake-claude-2.1.252-binary";
    const { fetchImpl } = claudeReleaseFetch(latest, {
      checksum: createHash("sha256").update(content).digest("hex"),
      size: content.length,
    }, async () => {
      // 用非空目录占住 launcher，迫使原子软链切换失败。
      await rm(launcher, { force: true });
      await mkdir(launcher);
      await writeFile(path.join(launcher, "block"), "block");
      return new Response(content);
    });
    const manager = createCliManager({
      runner: nativeClaudeRunner(launcher),
      platform: "linux",
      arch: "x64",
      env: { PATH: bin, HOME: home },
      fetch: fetchImpl,
    });

    const [result] = await manager.run([{ toolId: "claude", operation: "update" }]);
    assert.equal(result?.outcome, "failed");
    assert.match(result?.message ?? "", /安装 2\.1\.252 失败/);
    assert.deepEqual((await readdir(versionsDir)).filter((entry) => entry.startsWith(".ai-cli-manager-")), []);
    assert.deepEqual((await readdir(bin)).filter((entry) => entry.startsWith(".ai-cli-manager-")), []);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("Claude 已是官网最新版时跳过下载", { skip: process.platform === "win32" }, async () => {
  const { home, bin, launcher } = await makeNativeClaude("2.1.252");
  try {
    const { fetchImpl } = claudeReleaseFetch(
      "2.1.252",
      { checksum: "0".repeat(64), size: 1 },
      () => { throw new Error("不应下载"); },
    );
    const manager = createCliManager({
      runner: nativeClaudeRunner(launcher),
      platform: "linux",
      arch: "x64",
      env: { PATH: bin, HOME: home },
      fetch: fetchImpl,
    });

    assert.deepEqual(await manager.run([{ toolId: "claude", operation: "update" }], { verifyLatest: true }), [{
      toolId: "claude",
      label: "Claude Code",
      operation: "update",
      outcome: "unchanged",
      beforeVersion: "2.1.252",
      afterVersion: "2.1.252",
      message: "已是官网最新版 2.1.252。",
    }]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("Claude launcher 不指向 versions 目录时停止直连更新且不访问网络", { skip: process.platform === "win32" }, async () => {
  const home = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-claude-odd-"));
  try {
    const localBin = path.join(home, ".local", "bin");
    const other = path.join(home, "other");
    await mkdir(localBin, { recursive: true });
    await mkdir(other, { recursive: true });
    await writeFile(path.join(other, "claude"), "user-replaced", { mode: 0o755 });
    await symlink(path.join(other, "claude"), path.join(localBin, "claude"));
    const manager = createCliManager({
      runner: new LocalCliRunner({ claude: "2.1.241 (Claude Code)" }),
      platform: "linux",
      arch: "x64",
      env: { PATH: localBin, HOME: home },
      fetch: async (input) => {
        throw new Error(`不应访问网络：${String(input)}`);
      },
    });

    const [result] = await manager.run([{ toolId: "claude", operation: "update" }]);
    assert.equal(result?.outcome, "failed");
    assert.match(result?.message ?? "", /已停止直连更新/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("只有 Claude macOS/Linux 更新使用直连特例", () => {
  assert.equal(
    createCliManager({ platform: "linux" }).preview({ toolId: "claude", operation: "update" }),
    "标准 native 安装：直连 downloads.claude.ai 校验更新；其他来源：claude update",
  );
  assert.equal(
    createCliManager({ platform: "win32" }).preview({ toolId: "claude", operation: "update" }),
    "claude update",
  );
  assert.equal(
    createCliManager({ platform: "freebsd" }).preview({ toolId: "claude", operation: "update" }),
    "claude update",
  );
  const manager = createCliManager({ platform: "linux" });
  assert.deepEqual(
    (["codex", "kimi", "pi", "omp", "mmx", "grok"] as const).map((toolId) => manager.preview({ toolId, operation: "update" })),
    ["codex update", "kimi update", "pi update --self", "omp update", "mmx update", "grok update"],
  );
});
