import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readConfig, updateSkillStates, writeConfigAtomically } from "../src/config.ts";

const imagegenPath = "/Users/example/.codex/skills/.system/imagegen/SKILL.md";
const findSkillsPath = "/Users/example/.agents/skills/find-skills/SKILL.md";

test("新增技能覆盖项时不改动现有配置", () => {
  const source = 'model = "gpt-5.6-sol"\n\n[features]\njs_repl = false\n';
  const result = updateSkillStates(source, new Map([[imagegenPath, false]]));

  assert.equal(
    result,
    `${source}\n[[skills.config]]\npath = ${JSON.stringify(imagegenPath)}\nenabled = false\n`,
  );
});

test("普通 TOML 表之前只修改目标技能表", () => {
  const source = [
    "# 由用户维护",
    "[[skills.config]]",
    `path = ${JSON.stringify(imagegenPath)}`,
    "enabled = true # 保留这条注释",
    "",
    "[features]",
    "js_repl = false",
    "",
    "[mcp_servers.node_repl]",
    'command = "node"',
    "",
  ].join("\n");
  const result = updateSkillStates(source, new Map([[imagegenPath, false]]));

  assert.match(result, /enabled = false # 保留这条注释/);
  assert.match(result, /\[features\]\njs_repl = false/);
  assert.match(result, /\[mcp_servers\.node_repl\]\ncommand = "node"/);
});

test("现有 skills.config 未指定 enabled 时补充该字段", () => {
  const source = `[[skills.config]]\npath = ${JSON.stringify(imagegenPath)}\n`;
  const result = updateSkillStates(source, new Map([[imagegenPath, false]]));
  assert.equal(result, `${source}enabled = false\n`);
});

test("更新所有匹配表以避免重复覆盖项状态不一致", () => {
  const source = [
    "[[skills.config]]",
    `path = ${JSON.stringify(imagegenPath)}`,
    "enabled = true",
    "",
    "[[skills.config]]",
    `path = ${JSON.stringify(findSkillsPath)}`,
    "enabled = true",
    "",
    "[[skills.config]]",
    `path = ${JSON.stringify(imagegenPath)}`,
    "enabled = true",
    "",
  ].join("\n");
  const result = updateSkillStates(source, new Map([[imagegenPath, false]]));
  assert.equal((result.match(/enabled = false/g) ?? []).length, 2);
  assert.match(result, new RegExp(`path = ${JSON.stringify(findSkillsPath)}\\nenabled = true`));
});

test("启用技能时删除所有匹配覆盖项并保留其他配置", () => {
  const source = [
    'model = "gpt-5.6-sol"',
    "",
    "[[skills.config]]",
    `path = ${JSON.stringify(imagegenPath)}`,
    "enabled = false",
    "",
    "[[skills.config]]",
    `path = ${JSON.stringify(findSkillsPath)}`,
    "enabled = false",
    "",
    "[[skills.config]]",
    `path = ${JSON.stringify(imagegenPath)}`,
    "enabled = true",
    "",
    "# 保留后续配置说明",
    "[features]",
    "js_repl = false",
    "",
  ].join("\n");

  const result = updateSkillStates(source, new Map([[imagegenPath, true]]));

  assert.doesNotMatch(result, new RegExp(JSON.stringify(imagegenPath).replaceAll("/", "\\/")));
  assert.match(result, new RegExp(`path = ${JSON.stringify(findSkillsPath)}\\nenabled = false`));
  assert.match(result, /# 保留后续配置说明\n\[features\]\njs_repl = false/);
});

test("启用没有覆盖项的技能时不新增冗余配置", () => {
  const source = 'model = "gpt-5.6-sol"\n';

  assert.equal(updateSkillStates(source, new Map([[imagegenPath, true]])), source);
});

test("原子写入并拒绝覆盖并发配置变更", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "codex-skills-config-"));
  const configPath = path.join(directory, "config.toml");
  await writeFile(configPath, 'model = "original"\n', "utf8");
  const snapshot = await readConfig(configPath);

  await writeConfigAtomically(snapshot, 'model = "updated"\n');
  assert.equal(await readFile(configPath, "utf8"), 'model = "updated"\n');

  await assert.rejects(
    writeConfigAtomically(snapshot, 'model = "stale-write"\n'),
    /工具运行期间 config\.toml 已被修改/,
  );
  assert.equal(await readFile(configPath, "utf8"), 'model = "updated"\n');
});
