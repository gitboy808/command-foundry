import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const appRoot = path.resolve(import.meta.dirname, "..");
const sourceEntry = path.join(appRoot, "src", "cli.ts");

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

test("通过 npm 风格的符号链接启动 CLI", { skip: process.platform === "win32" }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-bin-"));
  const entry = path.join(directory, "ai-cli-manager.ts");
  await symlink(sourceEntry, entry);

  try {
    const result = execute(["--version"], entry);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "0.1.0");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("status --json 通过真实入口输出纯本地状态", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-path-"));
  await writeCommand(directory, "claude", "2.1.226 (Claude Code)");

  try {
    const result = execute(["status", "--json"], sourceEntry, {
      ...process.env,
      PATH: directory,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), [
      { id: "claude", label: "Claude Code", state: "installed", version: "2.1.226", action: "update", preview: "claude update" },
      { id: "codex", label: "Codex", state: "missing", action: "install", preview: "下载 https://chatgpt.com/codex/install.sh，然后使用 sh 执行" },
      { id: "kimi", label: "Kimi Code", state: "missing", action: "install", preview: "下载 https://code.kimi.com/kimi-code/install.sh，然后使用 bash 执行" },
      { id: "pi", label: "Pi", state: "missing", action: "install", preview: "npm install -g --ignore-scripts @earendil-works/pi-coding-agent" },
      { id: "omp", label: "OMP", state: "missing", action: "install", preview: "下载 https://omp.sh/install，然后使用 sh 执行" },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("写操作在非 TTY 环境拒绝执行并返回失败", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-cli-manager-path-"));
  await writeCommand(directory, "codex", "codex-cli 0.147.0");

  try {
    const result = execute(["update", "codex"], sourceEntry, {
      ...process.env,
      PATH: directory,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /安装和更新需要真实终端/);
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
});
