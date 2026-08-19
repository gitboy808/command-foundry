import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { access, chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
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
    { id: "claude", label: "Claude Code", state: "installed", version: "2.1.226", action: "update", preview: "claude update" },
    { id: "codex", label: "Codex", state: "installed", version: "0.147.0", action: "update", preview: "codex update" },
    { id: "kimi", label: "Kimi Code", state: "installed", version: "0.34.0", action: "update", preview: "kimi update" },
    { id: "pi", label: "Pi", state: "installed", version: "0.84.1", action: "update", preview: "pi update --self" },
    { id: "omp", label: "OMP", state: "missing", action: "install", preview: "下载 https://omp.sh/install，然后使用 sh 执行" },
    { id: "mmx", label: "MiniMax CLI", state: "missing", action: "install", preview: "npm install -g mmx-cli" },
    { id: "grok", label: "Grok Build", state: "missing", action: "install", preview: "下载 https://x.ai/cli/install.sh，然后使用 bash 执行" },
  ]);
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
  const manager = createCliManager({ runner, platform: "linux" });

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
  const manager = createCliManager({ runner, platform: "linux" });

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
      message: "版本无变化（已是最新，或上游给出了手动步骤）。",
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
