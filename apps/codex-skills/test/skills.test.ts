import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverSkills, searchSkills } from "../src/skills.ts";

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

  const skills = await discoverSkills(new Map([[systemSkill, false]]), root, root);

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

  const skills = await discoverSkills(new Map(), root, root);

  assert.equal(skills.length, 1);
  assert.equal(skills[0]?.path, path.join(userRoot, "linked", "SKILL.md"));
});

test("发现从当前目录到仓库根的项目技能", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-skills-project-"));
  const home = path.join(root, "home");
  const repository = path.join(root, "repository");
  const parent = path.join(repository, "packages");
  const cwd = path.join(parent, "service");
  const outsideSkill = path.join(root, ".agents", "skills", "outside", "SKILL.md");
  const repositorySkill = path.join(repository, ".agents", "skills", "shared", "SKILL.md");
  const parentSkill = path.join(parent, ".agents", "skills", "shared", "SKILL.md");
  const cwdSkill = path.join(cwd, ".agents", "skills", "local", "SKILL.md");
  const ignoredSkill = path.join(cwd, ".codex", "skills", "ignored", "SKILL.md");
  await mkdir(path.join(repository, ".git"), { recursive: true });
  for (const skillPath of [outsideSkill, repositorySkill, parentSkill, cwdSkill, ignoredSkill]) {
    await mkdir(path.dirname(skillPath), { recursive: true });
  }
  await writeFile(outsideSkill, "---\nname: outside\ndescription: 仓库外技能\n---\n", "utf8");
  await writeFile(repositorySkill, "---\nname: shared\ndescription: 仓库技能\n---\n", "utf8");
  await writeFile(parentSkill, "---\nname: shared\ndescription: 父目录技能\n---\n", "utf8");
  await writeFile(cwdSkill, "---\nname: local\ndescription: 当前目录技能\n---\n", "utf8");
  await writeFile(ignoredSkill, "---\nname: ignored\ndescription: 非项目技能目录\n---\n", "utf8");

  const skills = await discoverSkills(new Map([[parentSkill, false]]), home, cwd);

  assert.deepEqual(
    skills.map(({ path: skillPath, source, enabled }) => ({ skillPath, source, enabled })),
    [
      { skillPath: cwdSkill, source: "project", enabled: true },
      { skillPath: repositorySkill, source: "project", enabled: true },
      { skillPath: parentSkill, source: "project", enabled: false },
    ],
  );
});

test("支持以 .git 文件标记 worktree 仓库根", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-skills-worktree-"));
  const home = path.join(root, "home");
  const repository = path.join(root, "repository");
  const cwd = path.join(repository, "nested");
  const repositorySkill = path.join(repository, ".agents", "skills", "root", "SKILL.md");
  await mkdir(path.dirname(repositorySkill), { recursive: true });
  await mkdir(cwd, { recursive: true });
  await writeFile(path.join(repository, ".git"), "gitdir: /tmp/example\n", "utf8");
  await writeFile(repositorySkill, "---\nname: root\ndescription: 根技能\n---\n", "utf8");

  const skills = await discoverSkills(new Map(), home, cwd);

  assert.equal(skills.length, 1);
  assert.equal(skills[0]?.path, repositorySkill);
  assert.equal(skills[0]?.source, "project");
});

test("没有仓库标记时只发现当前目录的项目技能", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-skills-cwd-"));
  const home = path.join(root, "home");
  const parent = path.join(root, "project");
  const cwd = path.join(parent, "nested");
  const parentSkill = path.join(parent, ".agents", "skills", "parent", "SKILL.md");
  const cwdSkill = path.join(cwd, ".agents", "skills", "local", "SKILL.md");
  for (const skillPath of [parentSkill, cwdSkill]) {
    await mkdir(path.dirname(skillPath), { recursive: true });
  }
  await writeFile(parentSkill, "---\nname: parent\ndescription: 父目录技能\n---\n", "utf8");
  await writeFile(cwdSkill, "---\nname: local\ndescription: 当前目录技能\n---\n", "utf8");

  const skills = await discoverSkills(new Map(), home, cwd);

  assert.equal(skills.length, 1);
  assert.equal(skills[0]?.path, cwdSkill);
});

test("按名称、描述和路径进行模糊搜索并按相关度排序", () => {
  const skills = [
    {
      name: "skill-creator",
      description: "创建新的工作流",
      path: "/skills/system/skill-creator/SKILL.md",
      source: "system" as const,
      enabled: true,
    },
    {
      name: "imagegen",
      description: "生成图像资源",
      path: "/skills/system/imagegen/SKILL.md",
      source: "system" as const,
      enabled: true,
    },
    {
      name: "asset-helper",
      description: "处理 image generation 结果",
      path: "/projects/demo/.agents/skills/asset-helper/SKILL.md",
      source: "project" as const,
      enabled: false,
    },
  ];

  assert.deepEqual(searchSkills(skills, "img").map(({ name }) => name), ["imagegen"]);
  assert.deepEqual(searchSkills(skills, "image gen").map(({ name }) => name), [
    "imagegen",
    "asset-helper",
  ]);
  assert.deepEqual(searchSkills(skills, "demo asset").map(({ name }) => name), ["asset-helper"]);
  assert.deepEqual(searchSkills(skills, "不存在").map(({ name }) => name), []);
  assert.equal(searchSkills(skills, "  ").length, skills.length);
});
