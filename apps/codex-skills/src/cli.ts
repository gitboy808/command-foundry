#!/usr/bin/env node
import { homedir } from "node:os";
import path from "node:path";
import type { Key } from "node:readline";
import { readConfig, updateSkillStates } from "./config.js";
import { managerPrompt, type ManagerAction, type ManagerView } from "./manager-prompt.js";
import { findProjectContext } from "./project.js";
import { searchableCheckbox } from "./search-checkbox.js";
import {
  createSkillSet,
  captureDefaultPaths,
  deleteSkillSet,
  defaultPathsForGroup,
  desiredStatesForSet,
  desiredStatesForDefault,
  ensureProjectGroup,
  setGroupInStore,
  skillsInScope,
  updateDefaultPaths,
  updateSkillSet,
  validateSkillSetName,
} from "./skill-sets.js";
import { discoverSkills, searchSkills } from "./skills.js";
import { confirmPrompt, textInput } from "./simple-prompts.js";
import { writeStateChanges } from "./state-writer.js";
import { readSkillSetStore, writeSkillSetStoreAtomically } from "./store.js";
import type {
  ConfigSnapshot,
  ProjectContext,
  Skill,
  SkillSet,
  SkillSetGroup,
  SkillSetScope,
  SkillSetStore,
  SkillSetStoreSnapshot,
  SkillSource,
} from "./types.js";

const VERSION = "0.1.0";

function usage(): string {
  return `用法：\n  codex-skills [--list] [--search [关键词]]\n  codex-skills --set <技能集名称> --scope <global|project>\n\n管理本地及当前项目的 Codex 技能和技能集。\n\n选项：\n  --list                 只读列出技能及其状态\n  -s, --search [关键词]    预填搜索框；与 --list 配合时过滤输出\n  --set <技能集名称>       非交互式激活技能集\n  --scope <global|project> 指定 --set 的技能集作用域\n  -h, --help             显示帮助\n  -v, --version          显示版本`;
}

interface CliOptions {
  list: boolean;
  search?: string | true;
  set?: string;
  scope?: SkillSetScope;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { list: false };

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === "--help" || argument === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (argument === "--version" || argument === "-v") {
      console.log(VERSION);
      process.exit(0);
    }
    if (argument === "--list") {
      options.list = true;
      continue;
    }
    if (argument === "--search" || argument === "-s") {
      const query = args[index + 1];
      if (query !== undefined && !query.startsWith("-")) {
        options.search = query;
        index++;
      } else {
        options.search = true;
      }
      continue;
    }
    if (argument === "--set") {
      const name = args[index + 1];
      if (name === undefined || name.startsWith("-")) {
        throw new Error("--set 必须提供技能集名称。");
      }
      options.set = name;
      index++;
      continue;
    }
    if (argument === "--scope") {
      const scope = args[index + 1];
      if (scope !== "global" && scope !== "project") {
        throw new Error("--scope 必须是 global 或 project。");
      }
      options.scope = scope;
      index++;
      continue;
    }
    throw new Error(`未知选项：${argument}`);
  }
  if ((options.set === undefined) !== (options.scope === undefined)) {
    throw new Error("--set 和 --scope 必须一起使用。");
  }
  if (options.set !== undefined && (options.list || options.search !== undefined)) {
    throw new Error("--set 不能与 --list 或 --search 一起使用。");
  }
  return options;
}

function sourceLabel(source: SkillSource): string {
  if (source === "system") return "系统";
  if (source === "project") return "项目";
  return "用户";
}

function formatChoice(skill: { name: string; source: SkillSource; description: string }): string {
  const description = skill.description.replace(/\s+/g, " ").trim();
  const suffix = description.length > 72 ? `${description.slice(0, 69)}...` : description;
  return `${skill.name}  [${sourceLabel(skill.source)}]  ${suffix}`;
}

async function withEscapeCancellation<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const cancelOnEscape = (_input: string, key: Key): void => {
    if (key.name === "escape") controller.abort();
  };
  // Inquirer prompt 不处理 Esc，统一接入其原生 AbortSignal 取消通道。
  process.stdin.on("keypress", cancelOnEscape);
  try {
    return await run(controller.signal);
  } finally {
    process.stdin.removeListener("keypress", cancelOnEscape);
  }
}

function groupForScope(
  store: SkillSetStore,
  scope: SkillSetScope,
  project: ProjectContext | undefined,
): SkillSetGroup {
  if (scope === "global") return store.global;
  if (!project) throw new Error("当前目录不在 Git 项目中，不能管理项目技能集。");
  return ensureProjectGroup(store, project);
}

function skillSetForAction(
  store: SkillSetStore,
  action: Extract<ManagerAction, { setId: string }>,
  project: ProjectContext | undefined,
): SkillSet {
  const group = groupForScope(store, action.scope, project);
  const skillSet = group.sets.find((candidate) => candidate.id === action.setId);
  if (!skillSet) throw new Error("选择的技能集已不存在，请重新运行后再试。");
  return skillSet;
}

async function saveStore(
  snapshot: SkillSetStoreSnapshot,
  data: SkillSetStore,
): Promise<SkillSetStoreSnapshot> {
  await writeSkillSetStoreAtomically(snapshot, data);
  return readSkillSetStore(snapshot.path);
}

async function promptForName(
  group: SkillSetGroup,
  initialValue?: string,
  exceptId?: string,
): Promise<string> {
  return withEscapeCancellation((signal) =>
    textInput(
      {
        message: initialValue ? "技能集名称：" : "新技能集名称：",
        initialValue,
        validate: (value) => validateSkillSetName(group, value, exceptId),
      },
      { signal },
    ),
  );
}

async function promptForMembers(
  skills: readonly Skill[],
  scope: SkillSetScope,
  selectedPaths: ReadonlySet<string>,
): Promise<string[]> {
  const choices = skillsInScope(skills, scope).map((skill) => ({
    ...skill,
    enabled: selectedPaths.has(skill.path),
  }));
  if (choices.length === 0) {
    throw new Error(scope === "global" ? "未发现可加入全局技能集的技能。" : "当前项目没有技能。");
  }
  return withEscapeCancellation((signal) =>
    searchableCheckbox(
      {
        message: `${scope === "global" ? "全局" : "项目"}技能集成员`,
        skills: choices,
        renderSkill: formatChoice,
        pageSize: Math.min(choices.length, 14),
        loop: false,
      },
      { signal },
    ),
  );
}

function updateWorkingSkills(skills: readonly Skill[], selectedPaths: readonly string[]): Skill[] {
  const selected = new Set(selectedPaths);
  return skills.map((skill) => ({ ...skill, enabled: selected.has(skill.path) }));
}

function selectedPathsInScope(
  skills: readonly Skill[],
  scope: SkillSetScope,
  selectedPaths: ReadonlySet<string>,
): string[] {
  return skillsInScope(skills, scope)
    .filter((skill) => selectedPaths.has(skill.path))
    .map((skill) => skill.path);
}

async function applyManualSelection(
  config: ConfigSnapshot,
  storeSnapshot: SkillSetStoreSnapshot,
  project: ProjectContext | undefined,
  skills: readonly Skill[],
  selectedPaths: readonly string[],
): Promise<void> {
  const selected = new Set(selectedPaths);
  const desired = new Map<string, boolean>();
  let globalChanged = false;
  let projectChanged = false;

  for (const skill of skills) {
    const nextState = selected.has(skill.path);
    if (nextState !== skill.enabled) {
      if (skill.source === "project") projectChanged = true;
      else globalChanged = true;
    }
    // enabled=true 是冗余覆盖项，默认提交时继续沿用现有的清理行为。
    if (nextState !== skill.enabled || (nextState && config.enabledByPath.has(skill.path))) {
      desired.set(skill.path, nextState);
    }
  }

  let nextStore = storeSnapshot.data;
  const globalGroup = nextStore.global;
  if (globalChanged) {
    nextStore = setGroupInStore(
      nextStore,
      "global",
      project,
      updateDefaultPaths(globalGroup, selectedPathsInScope(skills, "global", selected)),
    );
  } else if (globalGroup.defaultPaths === null) {
    nextStore = setGroupInStore(
      nextStore,
      "global",
      project,
      captureDefaultPaths(skills, "global", globalGroup),
    );
  }
  if (project) {
    const group = ensureProjectGroup(nextStore, project);
    if (projectChanged) {
      nextStore = setGroupInStore(
        nextStore,
        "project",
        project,
        updateDefaultPaths(group, selectedPathsInScope(skills, "project", selected)),
      );
    } else if (group.defaultPaths === null) {
      nextStore = setGroupInStore(
        nextStore,
        "project",
        project,
        captureDefaultPaths(skills, "project", group),
      );
    }
  }

  const updatedConfig = updateSkillStates(config.contents, desired);
  const configChanged = updatedConfig !== config.contents;
  const storeChanged = nextStore !== storeSnapshot.data;
  if (!configChanged && !storeChanged) {
    console.log("没有需要应用的变更。");
    return;
  }
  await writeStateChanges(
    configChanged ? { snapshot: config, contents: updatedConfig } : undefined,
    storeChanged ? { snapshot: storeSnapshot, data: nextStore } : undefined,
  );

  if (configChanged) {
    console.log(`已将 ${desired.size} 项技能变更写入 ${config.path}。`);
    console.log("请重启 Codex 或新建任务，使新的技能状态生效。");
  } else {
    console.log("已更新默认技能选择，技能状态未改变。");
  }
}

async function activateSkillSet(
  config: ConfigSnapshot,
  storeSnapshot: SkillSetStoreSnapshot,
  project: ProjectContext | undefined,
  skills: readonly Skill[],
  scope: SkillSetScope,
  setId: string | null,
  requireConfirmation = true,
): Promise<void> {
  const group = groupForScope(storeSnapshot.data, scope, project);
  const scopedSkills = skillsInScope(skills, scope);
  const skillSet = setId === null ? undefined : group.sets.find((candidate) => candidate.id === setId);
  if (setId !== null && !skillSet) throw new Error("选择的技能集已不存在，请重新运行后再试。");
  const desired = skillSet
    ? desiredStatesForSet(skills, scope, skillSet)
    : desiredStatesForDefault(skills, scope, group);
  const targetPaths = skillSet ? skillSet.paths : defaultPathsForGroup(skills, scope, group);
  let enabled = 0;
  let disabled = 0;
  let unchanged = 0;
  for (const skill of scopedSkills) {
    const next = desired.get(skill.path)!;
    if (next === skill.enabled) unchanged++;
    else if (next) enabled++;
    else disabled++;
  }
  const available = new Set(scopedSkills.map((skill) => skill.path));
  const missing = targetPaths.filter((skillPath) => !available.has(skillPath)).length;
  const targetName = skillSet?.name ?? "默认";
  const confirmed = requireConfirmation
    ? await withEscapeCancellation((signal) =>
        confirmPrompt(
          {
            message: `激活“${targetName}”：启用 ${enabled}，禁用 ${disabled}，无变化 ${unchanged}，缺失 ${missing}。确认应用？`,
            default: true,
          },
          { signal },
        ),
      )
    : true;
  if (!confirmed) {
    console.log("已取消，未应用任何变更。");
    return;
  }

  const updatedConfig = updateSkillStates(config.contents, desired);
  const nextStore = setGroupInStore(
    storeSnapshot.data,
    scope,
    project,
    {
      ...group,
      activeSetId: skillSet?.id ?? null,
      defaultPaths: group.defaultPaths ?? scopedSkills.map((skill) => skill.path),
    },
  );
  const configChanged = updatedConfig !== config.contents;
  await writeStateChanges(
    configChanged ? { snapshot: config, contents: updatedConfig } : undefined,
    { snapshot: storeSnapshot, data: nextStore },
  );

  console.log(`已激活${scope === "global" ? "全局" : "项目"}技能集“${targetName}”。`);
  if (configChanged) {
    console.log("请重启 Codex 或新建任务，使新的技能状态生效。");
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.list && options.search === true) {
    throw new Error("--list 与 --search 一起使用时必须提供搜索关键词。");
  }
  const home = homedir();
  const config = await readConfig(path.join(home, ".codex", "config.toml"));
  const skills = await discoverSkills(config.enabledByPath, home);

  if (skills.length === 0) {
    if (options.set !== undefined) throw new Error("未发现可由技能集管理的技能。");
    console.log("在本地技能目录及当前项目的 .agents/skills 中未发现技能。");
    return;
  }

  if (options.list) {
    const query = typeof options.search === "string" ? options.search : "";
    const visibleSkills = searchSkills(skills, query);
    if (visibleSkills.length === 0) {
      console.log(`未找到匹配 ${JSON.stringify(query)} 的技能。`);
      return;
    }
    for (const skill of visibleSkills) {
      console.log(
        `${skill.enabled ? "[x]" : "[ ]"} ${skill.name}\t${sourceLabel(skill.source)}\t${skill.path}`,
      );
    }
    return;
  }

  const project = await findProjectContext();
  let storeSnapshot = await readSkillSetStore(path.join(home, ".codex", "codex-skills.json"));
  if (options.set !== undefined && options.scope !== undefined) {
    const group = groupForScope(storeSnapshot.data, options.scope, project);
    const skillSet = group.sets.find((candidate) => candidate.name === options.set);
    if (!skillSet) {
      throw new Error(
        `${options.scope === "global" ? "全局" : "项目"}作用域中不存在技能集“${options.set}”。`,
      );
    }
    await activateSkillSet(
      config,
      storeSnapshot,
      project,
      skills,
      options.scope,
      skillSet.id,
      false,
    );
    return;
  }
  let workingSkills = skills;
  let initialView: ManagerView = "skills";

  while (true) {
    const action = await withEscapeCancellation((signal) =>
      managerPrompt(
        {
          message: "Codex 技能",
          skills: workingSkills,
          store: storeSnapshot.data,
          project,
          renderSkill: formatChoice,
          initialQuery: typeof options.search === "string" ? options.search : "",
          initialView,
          pageSize: Math.min(workingSkills.length, 14),
        },
        { signal },
      ),
    );
    workingSkills = updateWorkingSkills(workingSkills, action.selectedPaths);

    if (action.type === "apply-manual") {
      await applyManualSelection(
        config,
        storeSnapshot,
        project,
        skills,
        action.selectedPaths,
      );
      return;
    }
    if (action.type === "activate") {
      await activateSkillSet(
        config,
        storeSnapshot,
        project,
        skills,
        action.scope,
        action.setId,
      );
      return;
    }

    const group = groupForScope(storeSnapshot.data, action.scope, project);
    if (action.type === "create") {
      const name = await promptForName(group);
      const members = await promptForMembers(
        workingSkills,
        action.scope,
        new Set(action.selectedPaths),
      );
      const nextGroup = createSkillSet(
        captureDefaultPaths(workingSkills, action.scope, group),
        name,
        members,
      );
      const nextStore = setGroupInStore(storeSnapshot.data, action.scope, project, nextGroup);
      storeSnapshot = await saveStore(storeSnapshot, nextStore);
      console.log(`已保存技能集“${name}”，尚未激活。`);
    } else {
      const skillSet = skillSetForAction(storeSnapshot.data, action, project);
      if (action.type === "edit") {
        const members = await promptForMembers(
          workingSkills,
          action.scope,
          new Set(skillSet.paths),
        );
        const nextGroup = updateSkillSet(group, skillSet.id, { paths: members });
        const nextStore = setGroupInStore(storeSnapshot.data, action.scope, project, nextGroup);
        storeSnapshot = await saveStore(storeSnapshot, nextStore);
        console.log(`已更新技能集“${skillSet.name}”，尚未激活。`);
      } else if (action.type === "rename") {
        const name = await promptForName(group, skillSet.name, skillSet.id);
        const nextGroup = updateSkillSet(group, skillSet.id, { name });
        const nextStore = setGroupInStore(storeSnapshot.data, action.scope, project, nextGroup);
        storeSnapshot = await saveStore(storeSnapshot, nextStore);
        console.log(`已将技能集重命名为“${name}”。`);
      } else {
        const confirmed = await withEscapeCancellation((signal) =>
          confirmPrompt(
            { message: `删除技能集“${skillSet.name}”？技能状态不会改变。`, default: false },
            { signal },
          ),
        );
        if (confirmed) {
          const nextGroup = deleteSkillSet(group, skillSet.id);
          const nextStore = setGroupInStore(storeSnapshot.data, action.scope, project, nextGroup);
          storeSnapshot = await saveStore(storeSnapshot, nextStore);
          console.log(`已删除技能集“${skillSet.name}”，技能状态未改变。`);
        }
      }
    }
    initialView = "sets";
  }
}

main().catch((error: unknown) => {
  if (
    error instanceof Error &&
    (error.name === "ExitPromptError" || error.name === "AbortPromptError")
  ) {
    console.log("已取消，未应用任何变更。");
    process.exitCode = 0;
    return;
  }
  console.error(`codex-skills: ${(error as Error).message}`);
  process.exitCode = 1;
});
