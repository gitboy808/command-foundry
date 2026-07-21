import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverSkills } from "../src/skills.ts";

test("递归发现技能并应用按路径配置的状态", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-skills-"));
  const systemSkill = path.join(root, ".codex", "skills", ".system", "nested", "SKILL.md");
  const codexUserSkill = path.join(root, ".codex", "skills", "local", "SKILL.md");
  const agentsUserSkill = path.join(root, ".agents", "skills", "shared", "SKILL.md");
  await mkdir(path.dirname(systemSkill), { recursive: true });
  await mkdir(path.dirname(codexUserSkill), { recursive: true });
  await mkdir(path.dirname(agentsUserSkill), { recursive: true });
  await writeFile(systemSkill, '---\nname: zebra\ndescription: 系统技能\n---\n', "utf8");
  await writeFile(codexUserSkill, '---\nname: alpha\ndescription: Codex 用户技能\n---\n', "utf8");
  await writeFile(agentsUserSkill, '---\nname: beta\ndescription: Agents 用户技能\n---\n', "utf8");

  const skills = await discoverSkills(new Map([[systemSkill, false]]), root);

  assert.deepEqual(
    skills.map(({ name, source, enabled }) => ({ name, source, enabled })),
    [
      { name: "alpha", source: "user", enabled: true },
      { name: "beta", source: "user", enabled: true },
      { name: "zebra", source: "system", enabled: false },
    ],
  );
});

test("遍历符号链接技能目录且不会循环", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-skills-link-"));
  const target = path.join(root, "target");
  const userRoot = path.join(root, ".agents", "skills");
  await mkdir(target, { recursive: true });
  await mkdir(userRoot, { recursive: true });
  await writeFile(
    path.join(target, "SKILL.md"),
    '---\nname: linked\ndescription: 链接技能\n---\n',
    "utf8",
  );
  await symlink(target, path.join(userRoot, "linked"));
  await symlink(userRoot, path.join(target, "loop"));

  const skills = await discoverSkills(new Map(), root);

  assert.equal(skills.length, 1);
  assert.equal(skills[0]?.path, path.join(userRoot, "linked", "SKILL.md"));
});
