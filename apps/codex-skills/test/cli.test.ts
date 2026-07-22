import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseSkillSetStore } from "../src/store.ts";

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(appDirectory, "src", "cli.ts");
const tsxPath = path.join(appDirectory, "node_modules", ".bin", "tsx");

async function runCli(home: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(tsxPath, [cliPath, ...args], {
      cwd: home,
      env: { ...process.env, HOME: home },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

async function createSkill(skillRoot: string, name: string): Promise<string> {
  const directory = path.join(skillRoot, name);
  await mkdir(directory, { recursive: true });
  const skillPath = path.join(directory, "SKILL.md");
  await writeFile(
    skillPath,
    `---\nname: ${name}\ndescription: ${name} 测试技能\n---\n`,
    "utf8",
  );
  return skillPath;
}

test("--set 按作用域非交互式激活技能集", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "codex-skills-cli-"));
  const codexDirectory = path.join(home, ".codex");
  const skillRoot = path.join(codexDirectory, "skills");
  const firstPath = await createSkill(skillRoot, "first");
  const secondPath = await createSkill(skillRoot, "second");
  const storePath = path.join(codexDirectory, "codex-skills.json");
  await writeFile(
    storePath,
    `${JSON.stringify({
      version: 2,
      global: {
        sets: [{ id: "selected", name: "仅启用 first", paths: [firstPath] }],
        activeSetId: null,
        defaultPaths: [firstPath, secondPath],
      },
      projects: {},
    })}\n`,
    "utf8",
  );

  const result = await runCli(home, ["--set", "仅启用 first", "--scope", "global"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /已激活全局技能集“仅启用 first”/);
  const config = await readFile(path.join(codexDirectory, "config.toml"), "utf8");
  assert.match(config, new RegExp(`path = ${JSON.stringify(secondPath).replaceAll("/", "\\/")}`));
  assert.doesNotMatch(config, new RegExp(JSON.stringify(firstPath).replaceAll("/", "\\/")));
  const store = parseSkillSetStore(await readFile(storePath, "utf8"));
  assert.equal(store.global.activeSetId, "selected");
});

test("--set 要求明确作用域且不能与只读选项组合", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "codex-skills-cli-options-"));
  const missingScope = await runCli(home, ["--set", "开发"]);
  assert.equal(missingScope.code, 1);
  assert.match(missingScope.stderr, /--set 和 --scope 必须一起使用/);

  const conflicting = await runCli(home, ["--set", "开发", "--scope", "global", "--list"]);
  assert.equal(conflicting.code, 1);
  assert.match(conflicting.stderr, /--set 不能与 --list 或 --search 一起使用/);
});

test("帮助只列出命令和选项，不重复交互操作提示", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "codex-skills-cli-help-"));
  const result = await runCli(home, ["--help"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /--set <技能集名称>/);
  assert.doesNotMatch(result.stdout, /操作：输入以搜索/);
});
