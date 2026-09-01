import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const appRoot = path.resolve(import.meta.dirname, "..");
const sourceEntry = path.join(appRoot, "src", "cli.ts");
const latestFixture = path.join(import.meta.dirname, "fixtures", "mock-latest.mjs");
const win32Fixture = path.join(import.meta.dirname, "fixtures", "mock-win32.mjs");
const skipInteractive = !existsSync("/usr/bin/expect");

function execute(args: string[], entry = sourceEntry, env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, ["--import", "tsx", entry, ...args], {
    cwd: appRoot,
    encoding: "utf8",
    env,
  });
}

async function writeCommand(directory: string, name: string, output: string): Promise<void> {
  if (process.platform === "win32") {
    await writeFile(
      path.join(directory, `${name}.cmd`),
      `@echo off\r\n"${process.execPath}" -e "console.log('${output}')"\r\n`,
    );
    return;
  }
  const command = path.join(directory, name);
  await writeFile(command, `#!${process.execPath}\nconsole.log(${JSON.stringify(output)});\n`);
  await chmod(command, 0o755);
}

async function writeManagedCommand(directory: string, name: string, version: string): Promise<void> {
  const command = path.join(directory, name);
  await writeFile(command, `#!${process.execPath}\nif (process.argv.includes("--version")) {\n  console.log(${JSON.stringify(version)});\n} else {\n  require("node:fs").appendFileSync(process.env.ACTION_LOG, ${JSON.stringify(`${name} `)} + process.argv.slice(2).join(" ") + "\\n");\n}\n`);
  await chmod(command, 0o755);
}

async function withManagedCommands(
  commands: Record<string, string>,
  run: (directory: string, actionLog: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-interactive-"));
  try {
    await Promise.all(Object.entries(commands).map(([name, version]) => writeManagedCommand(directory, name, version)));
    await run(directory, path.join(directory, "actions.log"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function executeInteractive(
  env: NodeJS.ProcessEnv,
  interactions: Array<{ waitFor: string; send?: string }>,
) {
  const steps = interactions.map(({ waitFor, send }) => [
    `await {${waitFor}}`,
    ...(send ? [`send -- [binary format H* ${Buffer.from(send).toString("hex")}]`] : []),
  ].join("\n")).join("\n");
  const script = `
set timeout 5
proc await {value} {
  expect {
    -glob "*$value*" {}
    timeout { exit 124 }
    eof { exit 125 }
  }
}
spawn -noecho $env(TEST_NODE) --import tsx --import $env(TEST_LATEST_FIXTURE) $env(TEST_ENTRY)
${steps}
expect eof
catch wait result
exit [lindex $result 3]
`;
  return spawnSync("/usr/bin/expect", ["-c", script], {
    cwd: appRoot,
    encoding: "utf8",
    env: {
      ...env,
      TEST_ENTRY: sourceEntry,
      TEST_LATEST_FIXTURE: env.TEST_LATEST_FIXTURE ?? latestFixture,
      TEST_NODE: process.execPath,
    },
  });
}

test("交互更新默认跳过已确认是最新版的工具", { skip: skipInteractive }, async () => {
  await withManagedCommands({ codex: "codex-cli 0.148.0", pi: "pi 0.84.2" }, async (directory, actionLog) => {
    const result = executeInteractive({
      ...process.env,
      ACTION_LOG: actionLog,
      PATH: directory,
    }, [
      { waitFor: "现在要做什么？", send: "\x1b[B\r" },
      { waitFor: "选择要更新的工具", send: "\r" },
      { waitFor: "确认执行以上操作？", send: "y\r" },
    ]);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(await readFile(actionLog, "utf8"), "codex update\n");
  });
});

test("交互更新默认将 Claude Code 排在其他工具之后", { skip: skipInteractive }, async () => {
  await withManagedCommands({ claude: "0.0.1 (Claude Code)", codex: "codex-cli 0.148.0" }, async (directory, actionLog) => {
    const result = executeInteractive({
      ...process.env,
      ACTION_LOG: actionLog,
      PATH: directory,
    }, [
      { waitFor: "现在要做什么？", send: "\x1b[B\r" },
      { waitFor: "选择要更新的工具", send: "\r" },
      { waitFor: "确认执行以上操作？", send: "y\r" },
    ]);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(await readFile(actionLog, "utf8"), "codex update\nclaude update\n");
  });
});

test("交互卸载默认不选择任何工具", { skip: skipInteractive }, async () => {
  await withManagedCommands({ codex: "codex-cli 0.149.1" }, async (directory, actionLog) => {
    const result = executeInteractive({
      ...process.env,
      ACTION_LOG: actionLog,
      PATH: directory,
    }, [
      { waitFor: "现在要做什么？", send: "\x1b[B\x1b[B\r" },
      { waitFor: "选择要卸载的工具", send: "\r" },
      { waitFor: "没有可执行的操作。" },
    ]);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    await assert.rejects(readFile(actionLog, "utf8"), { code: "ENOENT" });
  });
});

test("卸载计划执行前需要二次确认", { skip: skipInteractive }, async () => {
  await withManagedCommands({ pi: "pi 0.84.2" }, async (directory, actionLog) => {
    const result = executeInteractive({
      ...process.env,
      ACTION_LOG: actionLog,
      PATH: directory,
    }, [
      { waitFor: "现在要做什么？", send: "\x1b[B\x1b[B\r" },
      { waitFor: "选择要卸载的工具", send: " \r" },
      { waitFor: "确认执行以上操作？", send: "y\r" },
      { waitFor: "再次确认卸载", send: "\r" },
      { waitFor: "已取消，未执行任何操作。" },
    ]);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    await assert.rejects(readFile(actionLog, "utf8"), { code: "ENOENT" });
  });
});

test("交互卸载不会让当前平台不支持的工具崩溃", { skip: skipInteractive }, async () => {
  await withManagedCommands({ codex: "codex-cli 0.149.1" }, async (directory) => {
    const result = executeInteractive({
      ...process.env,
      PATH: directory,
      PATHEXT: ".EXE",
      TEST_LATEST_FIXTURE: win32Fixture,
    }, [
      { waitFor: "现在要做什么？", send: "\x1b[B\x1b[B\r" },
      { waitFor: "Codex 不支持当前平台的卸载方式", send: "\r" },
      { waitFor: "没有可执行的操作。" },
    ]);

    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});

test("交互安装明确显示未安装状态", { skip: skipInteractive }, async () => {
  await withManagedCommands({}, async (directory) => {
    const result = executeInteractive({ ...process.env, PATH: directory }, [
      { waitFor: "现在要做什么？", send: "\r" },
      { waitFor: "Claude Code 未安装", send: "i\r" },
      { waitFor: "没有可执行的操作。" },
    ]);

    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});

for (const [keyName, key] of [["Esc", "\x1b"], ["q", "q"]] as const) {
  test(`交互工具选择支持 ${keyName} 返回操作菜单`, { skip: skipInteractive }, async () => {
    await withManagedCommands({ codex: "codex-cli 0.149.1" }, async (directory, actionLog) => {
      const result = executeInteractive({
        ...process.env,
        ACTION_LOG: actionLog,
        PATH: directory,
      }, [
        { waitFor: "现在要做什么？", send: "\x1b[B\r" },
        { waitFor: "esc/q 返回", send: key },
        { waitFor: "现在要做什么？", send: "\x1b[B\x1b[B\x1b[B\r" },
        { waitFor: "已取消，未执行任何操作。" },
      ]);

      assert.equal(result.status, 0, result.stderr || result.stdout);
      await assert.rejects(readFile(actionLog, "utf8"), { code: "ENOENT" });
    });
  });
}

test("通过 npm 风格的符号链接启动 CLI", { skip: process.platform === "win32" }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-bin-"));
  const entry = path.join(directory, "ai-cli-manager.ts");
  await symlink(sourceEntry, entry);

  try {
    const result = execute(["--version"], entry);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "0.1.1");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("status --json --local 通过真实入口输出纯本地状态", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-path-"));
  await writeCommand(directory, "claude", "2.1.226 (Claude Code)");

  try {
    const result = execute(["status", "--json", "--local"], sourceEntry, {
      ...process.env,
      PATH: directory,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), [
      { id: "claude", label: "Claude Code", state: "installed", version: "2.1.226", source: "unknown" },
      { id: "codex", label: "Codex", state: "missing" },
      { id: "kimi", label: "Kimi Code", state: "missing" },
      { id: "pi", label: "Pi", state: "missing" },
      { id: "omp", label: "OMP", state: "missing" },
      { id: "mmx", label: "MiniMax CLI", state: "missing" },
      { id: "grok", label: "Grok Build", state: "missing" },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("status 在版本旁展示 PATH 当前命令的推断来源", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-source-"));
  const bin = path.join(directory, "bin");
  const packageBin = path.join(directory, "n", "lib", "node_modules", "@openai", "codex", "bin");

  try {
    await mkdir(bin, { recursive: true });
    await mkdir(packageBin, { recursive: true });
    await writeCommand(packageBin, "codex", "codex-cli 0.149.1");
    await symlink(path.join(packageBin, "codex"), path.join(bin, "codex"));

    const result = execute(["status", "--local"], sourceEntry, { ...process.env, PATH: bin });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Codex\s+0\.149\.1 · npm/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("写操作在非 TTY 环境拒绝执行并返回失败", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-path-"));
  await writeCommand(directory, "codex", "codex-cli 0.147.0");

  try {
    for (const operation of ["update", "uninstall"]) {
      const result = execute([operation, "codex"], sourceEntry, {
        ...process.env,
        PATH: directory,
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /安装、更新和卸载需要真实终端/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("帮助包含全部公开子命令", () => {
  const result = execute(["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /status --json/);
  assert.match(result.stdout, /install <tool\.\.\.>/);
  assert.match(result.stdout, /update \[tool\.\.\.\]/);
  assert.match(result.stdout, /uninstall <tool\.\.\.>/);
});

test("uninstall 不带工具名时拒绝执行", () => {
  const result = execute(["uninstall"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /uninstall 至少需要一个工具名/);
});

test("uninstall 未安装的工具返回失败", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-path-"));

  try {
    const result = execute(["uninstall", "codex"], sourceEntry, {
      ...process.env,
      PATH: directory,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Codex 未安装，不能卸载/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
