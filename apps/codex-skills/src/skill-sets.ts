import { randomUUID } from "node:crypto";
import type {
  ProjectContext,
  ProjectSkillSetGroup,
  Skill,
  SkillSet,
  SkillSetGroup,
  SkillSetScope,
  SkillSetStore,
} from "./types.js";
import { MAX_SKILL_SETS } from "./store.js";

export function skillsInScope(skills: readonly Skill[], scope: SkillSetScope): Skill[] {
  return skills.filter((skill) =>
    scope === "project" ? skill.source === "project" : skill.source !== "project",
  );
}

export function desiredStatesForSet(
  skills: readonly Skill[],
  scope: SkillSetScope,
  skillSet: SkillSet,
): Map<string, boolean> {
  const members = new Set(skillSet.paths);
  return new Map(skillsInScope(skills, scope).map((skill) => [skill.path, members.has(skill.path)]));
}

function allPaths(skills: readonly Skill[], scope: SkillSetScope): string[] {
  return skillsInScope(skills, scope).map((skill) => skill.path);
}

export function captureDefaultPaths(
  skills: readonly Skill[],
  scope: SkillSetScope,
  group: SkillSetGroup,
): SkillSetGroup {
  return group.defaultPaths === null
    ? { ...group, defaultPaths: allPaths(skills, scope) }
    : group;
}

export function defaultPathsForGroup(
  skills: readonly Skill[],
  scope: SkillSetScope,
  group: SkillSetGroup,
): string[] {
  return group.defaultPaths ?? allPaths(skills, scope);
}

export function desiredStatesForDefault(
  skills: readonly Skill[],
  scope: SkillSetScope,
  group: SkillSetGroup,
): Map<string, boolean> {
  return desiredStatesForSet(skills, scope, {
    id: "__default__",
    name: "默认",
    paths: defaultPathsForGroup(skills, scope, group),
  });
}

export function updateDefaultPaths(
  group: SkillSetGroup,
  paths: readonly string[],
): SkillSetGroup {
  return {
    ...group,
    activeSetId: null,
    defaultPaths: [...new Set(paths)],
  };
}

export function effectiveActiveSetId(
  skills: readonly Skill[],
  scope: SkillSetScope,
  group: SkillSetGroup,
): string | null | undefined {
  const active = group.sets.find((skillSet) => skillSet.id === group.activeSetId);
  const scopedSkills = skillsInScope(skills, scope);
  if (active) {
    const members = new Set(active.paths);
    if (scopedSkills.every((skill) => skill.enabled === members.has(skill.path))) {
      return active.id;
    }
  }

  const defaults = new Set(defaultPathsForGroup(skills, scope, group));
  if (scopedSkills.every((skill) => skill.enabled === defaults.has(skill.path))) {
    return null;
  }
  return undefined;
}

function normalizeName(name: string): string {
  return name.trim();
}

export function validateSkillSetName(
  group: SkillSetGroup,
  name: string,
  exceptId?: string,
): string | undefined {
  const normalized = normalizeName(name);
  if (normalized.length === 0) return "名称不能为空。";
  if (normalized.length > 32) return "名称不能超过 32 个字符。";
  if (/\r|\n/.test(normalized)) return "名称不能包含换行符。";
  if (group.sets.some((skillSet) => skillSet.id !== exceptId && skillSet.name === normalized)) {
    return "同一作用域中已存在同名技能集。";
  }
  return undefined;
}

export function createSkillSet(group: SkillSetGroup, name: string, paths: string[]): SkillSetGroup {
  if (group.sets.length >= MAX_SKILL_SETS) {
    throw new Error(`每个作用域最多只能保存 ${MAX_SKILL_SETS} 个技能集。`);
  }
  const validation = validateSkillSetName(group, name);
  if (validation) throw new Error(validation);
  const skillSet: SkillSet = {
    id: randomUUID(),
    name: normalizeName(name),
    paths: [...new Set(paths)],
  };
  return { ...group, sets: [...group.sets, skillSet] };
}

export function updateSkillSet(
  group: SkillSetGroup,
  id: string,
  changes: { name?: string; paths?: string[] },
): SkillSetGroup {
  const current = group.sets.find((skillSet) => skillSet.id === id);
  if (!current) throw new Error("要编辑的技能集不存在。");
  const name = changes.name === undefined ? current.name : normalizeName(changes.name);
  const validation = validateSkillSetName(group, name, id);
  if (validation) throw new Error(validation);
  return {
    ...group,
    activeSetId: changes.paths !== undefined && group.activeSetId === id ? null : group.activeSetId,
    sets: group.sets.map((skillSet) =>
      skillSet.id === id
        ? { ...skillSet, name, paths: changes.paths ? [...new Set(changes.paths)] : skillSet.paths }
        : skillSet,
    ),
  };
}

export function deleteSkillSet(group: SkillSetGroup, id: string): SkillSetGroup {
  if (!group.sets.some((skillSet) => skillSet.id === id)) {
    throw new Error("要删除的技能集不存在。");
  }
  return {
    sets: group.sets.filter((skillSet) => skillSet.id !== id),
    activeSetId: group.activeSetId === id ? null : group.activeSetId,
    defaultPaths: group.defaultPaths,
  };
}

export function setGroupInStore(
  store: SkillSetStore,
  scope: SkillSetScope,
  project: ProjectContext | undefined,
  group: SkillSetGroup,
): SkillSetStore {
  if (scope === "global") return { ...store, global: group };
  if (!project) throw new Error("当前目录不在 Git 项目中，不能更新项目技能集。");
  const projectGroup: ProjectSkillSetGroup = { ...group, displayName: project.name };
  return { ...store, projects: { ...store.projects, [project.root]: projectGroup } };
}

export function ensureProjectGroup(
  store: SkillSetStore,
  project: ProjectContext,
): ProjectSkillSetGroup {
  return store.projects[project.root] ?? {
    displayName: project.name,
    sets: [],
    activeSetId: null,
    defaultPaths: null,
  };
}
