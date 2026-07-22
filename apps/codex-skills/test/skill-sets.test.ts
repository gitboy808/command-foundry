import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { findProjectContext } from "../src/project.ts";
import {
  captureDefaultPaths,
  createSkillSet,
  defaultPathsForGroup,
  deleteSkillSet,
  desiredStatesForDefault,
  desiredStatesForSet,
  effectiveActiveSetId,
  ensureProjectGroup,
  setGroupInStore,
  updateSkillSet,
  updateDefaultPaths,
} from "../src/skill-sets.ts";
import { emptySkillSetStore } from "../src/store.ts";
import type { ProjectContext, Skill, SkillSet } from "../src/types.ts";

const skills: Skill[] = [
  {
    path: "/home/.codex/skills/global/SKILL.md",
    name: "global",
    description: "全局技能",
    source: "user",
    enabled: true,
  },
  {
    path: "/projects/a/.agents/skills/a/SKILL.md",
    name: "project-a",
    description: "项目 A 技能",
    source: "project",
    enabled: true,
  },
];

test("全局和项目技能集只生成各自作用域的目标状态", () => {
  const globalSet: SkillSet = { id: "global", name: "全局", paths: [] };
  const projectSet: SkillSet = {
    id: "project",
    name: "项目",
    paths: [skills[1]!.path],
  };

  assert.deepEqual([...desiredStatesForSet(skills, "global", globalSet)], [
    [skills[0]!.path, false],
  ]);
  assert.deepEqual([...desiredStatesForSet(skills, "project", projectSet)], [
    [skills[1]!.path, true],
  ]);
});

test("更新项目 A 的技能集不会改变项目 B", () => {
  const projectA: ProjectContext = { root: "/projects/a", directory: "/projects/a", name: "a" };
  const projectB: ProjectContext = { root: "/projects/b", directory: "/projects/b", name: "b" };
  let store = emptySkillSetStore();
  store = setGroupInStore(store, "project", projectB, {
    sets: [{ id: "b-set", name: "B", paths: ["/b/SKILL.md"] }],
    activeSetId: "b-set",
    defaultPaths: null,
  });
  const originalB = store.projects[projectB.root];

  const groupA = createSkillSet(ensureProjectGroup(store, projectA), "A", ["/a/SKILL.md"]);
  store = setGroupInStore(store, "project", projectA, groupA);

  assert.deepEqual(store.projects[projectB.root], originalB);
  assert.equal(store.projects[projectA.root]?.sets[0]?.name, "A");
});

test("当前状态不匹配默认或具名集合时不显示活动项", () => {
  const group = {
    sets: [{ id: "active", name: "活动", paths: [skills[0]!.path] }],
    activeSetId: "active",
  };
  assert.equal(effectiveActiveSetId(skills, "global", group), "active");

  const disabled = skills.map((skill) =>
    skill.source === "user" ? { ...skill, enabled: false } : skill,
  );
  assert.equal(effectiveActiveSetId(disabled, "global", group), undefined);
});

test("编辑或删除活动集合时清除活动标记并保留默认快照", () => {
  const group = {
    sets: [{ id: "active", name: "旧名称", paths: ["/old"] }],
    activeSetId: "active",
    defaultPaths: ["/default"],
  };
  assert.equal(updateSkillSet(group, "active", { name: "新名称" }).activeSetId, "active");
  const updated = updateSkillSet(group, "active", { paths: ["/new"] });
  assert.equal(updated.activeSetId, null);
  assert.deepEqual(updated.defaultPaths, ["/default"]);

  const deleted = deleteSkillSet(group, "active");
  assert.equal(deleted.activeSetId, null);
  assert.deepEqual(deleted.defaultPaths, ["/default"]);
});

test("默认技能选择初始全开启并可恢复后续自定义状态", () => {
  const group = { sets: [], activeSetId: null, defaultPaths: null };
  const disabledSkills = skills.map((skill) =>
    skill.source === "user" ? { ...skill, enabled: false } : skill,
  );
  const captured = captureDefaultPaths(disabledSkills, "global", group);

  assert.deepEqual(captured.defaultPaths, [skills[0]!.path]);
  assert.deepEqual(defaultPathsForGroup(disabledSkills, "global", captured), [skills[0]!.path]);
  assert.deepEqual([...desiredStatesForDefault(disabledSkills, "global", captured)], [
    [skills[0]!.path, true],
  ]);

  const changed = updateDefaultPaths(captured, []);
  assert.equal(changed.activeSetId, null);
  assert.deepEqual([...desiredStatesForDefault(disabledSkills, "global", changed)], [
    [skills[0]!.path, false],
  ]);
});

test("使用 Git 根目录真实路径作为项目身份", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-skills-project-context-"));
  const repository = path.join(root, "repository");
  const nested = path.join(repository, "packages", "app");
  await mkdir(nested, { recursive: true });
  await writeFile(path.join(repository, ".git"), "gitdir: /tmp/example\n", "utf8");

  const project = await findProjectContext(nested);

  assert.equal(project?.root, await realpath(repository));
  assert.equal(project?.directory, repository);
  assert.equal(project?.name, "repository");
});
