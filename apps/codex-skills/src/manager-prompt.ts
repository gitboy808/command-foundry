import type { Key } from "node:readline";
import {
  createPrompt,
  isBackspaceKey,
  isDownKey,
  isEnterKey,
  isSpaceKey,
  isUpKey,
  makeTheme,
  useEffect,
  useKeypress,
  usePagination,
  useRef,
  useState,
  type Status,
} from "@inquirer/core";
import { setPromptCursor, setPromptLine } from "./prompt-line.js";
import { effectiveActiveSetId, ensureProjectGroup, skillsInScope } from "./skill-sets.js";
import { searchSkills } from "./skills.js";
import { MAX_SKILL_SETS } from "./store.js";
import type {
  ProjectContext,
  Skill,
  SkillSet,
  SkillSetScope,
  SkillSetStore,
} from "./types.js";

export type ManagerView = "skills" | "sets";

export function horizontalMenuTarget(
  view: ManagerView,
  query: string,
  keyName: string | undefined,
): ManagerView | undefined {
  // 技能菜单始终聚焦搜索框；有搜索内容时左右键只负责移动输入光标。
  if (view === "skills") return query === "" && keyName === "right" ? "sets" : undefined;
  return keyName === "left" ? "skills" : undefined;
}

export type ManagerAction =
  | { type: "apply-manual"; selectedPaths: string[] }
  | { type: "activate"; scope: SkillSetScope; setId: string | null; selectedPaths: string[] }
  | { type: "create"; scope: SkillSetScope; selectedPaths: string[] }
  | {
      type: "edit" | "rename" | "delete";
      scope: SkillSetScope;
      setId: string;
      selectedPaths: string[];
    };

interface ManagerPromptConfig {
  message: string;
  skills: readonly Skill[];
  store: SkillSetStore;
  project?: ProjectContext;
  renderSkill: (skill: Skill) => string;
  initialQuery?: string;
  initialView?: ManagerView;
  pageSize?: number;
}

interface SetRow {
  kind: "default" | "set" | "create";
  scope: SkillSetScope;
  skillSet?: SkillSet;
}

function isShiftTabKey(key: Key): boolean {
  return (key.name === "tab" && key.shift === true) || key.sequence === "\u001b[Z";
}

function rowsForScope(
  scope: SkillSetScope,
  sets: readonly SkillSet[],
): SetRow[] {
  const rows: SetRow[] = [{ kind: "default", scope }];
  rows.push(...sets.map((skillSet) => ({ kind: "set" as const, scope, skillSet })));
  if (sets.length < MAX_SKILL_SETS) rows.push({ kind: "create", scope });
  return rows;
}

export const managerPrompt = createPrompt<ManagerAction, ManagerPromptConfig>((config, done) => {
  const theme = makeTheme();
  const [status, setStatus] = useState<Status>("idle");
  const prefix = status === "done" ? theme.style.answer("✔") : "";
  const [view, setView] = useState<ManagerView>(config.initialView ?? "skills");
  const [query, setQuery] = useState(config.initialQuery ?? "");
  const searchCursor = useRef((config.initialQuery ?? "").length);
  const [skills, setSkills] = useState(config.skills.map((skill) => ({ ...skill })));
  const [activePath, setActivePath] = useState<string>();
  const [setCursor, setSetCursor] = useState(0);

  const visibleSkills = searchSkills(skills, query);
  const matchedActive = visibleSkills.findIndex((skill) => skill.path === activePath);
  const active = matchedActive === -1 ? 0 : matchedActive;
  const projectGroup = config.project
    ? ensureProjectGroup(config.store, config.project)
    : undefined;
  const globalRows = rowsForScope("global", config.store.global.sets);
  const projectRows = projectGroup ? rowsForScope("project", projectGroup.sets) : [];
  const setRows = [...globalRows, ...projectRows];
  const currentSetCursor = Math.max(0, Math.min(setCursor, setRows.length - 1));
  const selectedSetRow = setRows[currentSetCursor];

  const finish = (action: ManagerAction): void => {
    setStatus("done");
    done(action);
  };

  useEffect((readline) => {
    if (config.initialQuery) readline.write(config.initialQuery);
  }, []);

  useKeypress((key, readline) => {
    const terminalKey = key as typeof key & { meta?: boolean; sequence?: string };
    const selectedPaths = skills.filter((skill) => skill.enabled).map((skill) => skill.path);
    if (isShiftTabKey(key)) {
      const nextQuery = view === "skills" ? "" : query;
      setPromptLine(readline, nextQuery, view === "sets" ? searchCursor.current : 0);
      setView(view === "skills" ? "sets" : "skills");
      return;
    }
    const horizontalTarget = horizontalMenuTarget(view, query, key.name);
    if (horizontalTarget) {
      const nextQuery = horizontalTarget === "sets" ? "" : query;
      setPromptLine(
        readline,
        nextQuery,
        horizontalTarget === "skills" ? searchCursor.current : 0,
      );
      setView(horizontalTarget);
      return;
    }

    if (view === "skills") {
      if (isEnterKey(key)) {
        finish({
          type: "apply-manual",
          selectedPaths,
        });
      } else if (
        isBackspaceKey(key) ||
        terminalKey.sequence === "\u007f" ||
        terminalKey.sequence === "\b"
      ) {
        if (searchCursor.current > 0) {
          const nextCursor = searchCursor.current - 1;
          const nextQuery = `${query.slice(0, nextCursor)}${query.slice(searchCursor.current)}`;
          setPromptLine(readline, nextQuery, nextCursor);
          searchCursor.current = nextCursor;
          setQuery(nextQuery);
        }
      } else if (visibleSkills.length > 0 && (isUpKey(key) || isDownKey(key))) {
        setPromptLine(readline, query, searchCursor.current);
        const offset = isUpKey(key) ? -1 : 1;
        const next = Math.max(0, Math.min(active + offset, visibleSkills.length - 1));
        setActivePath(visibleSkills[next]!.path);
      } else if (visibleSkills.length > 0 && isSpaceKey(key)) {
        setPromptLine(readline, query, searchCursor.current);
        const selected = visibleSkills[active]!;
        setSkills(
          skills.map((skill) =>
            skill.path === selected.path ? { ...skill, enabled: !skill.enabled } : skill,
          ),
        );
      } else if (visibleSkills.length > 0 && key.ctrl && key.name === "a") {
        setPromptLine(readline, query, searchCursor.current);
        const visiblePaths = new Set(visibleSkills.map((skill) => skill.path));
        const enabled = visibleSkills.some((skill) => !skill.enabled);
        setSkills(
          skills.map((skill) =>
            visiblePaths.has(skill.path) ? { ...skill, enabled } : skill,
          ),
        );
      } else if (visibleSkills.length > 0 && key.ctrl && key.name === "i") {
        setPromptLine(readline, query, searchCursor.current);
        const visiblePaths = new Set(visibleSkills.map((skill) => skill.path));
        setSkills(
          skills.map((skill) =>
            visiblePaths.has(skill.path) ? { ...skill, enabled: !skill.enabled } : skill,
          ),
        );
      } else if (key.name === "left" || key.name === "right") {
        const offset = key.name === "left" ? -1 : 1;
        const nextCursor = Math.max(
          0,
          Math.min(searchCursor.current + offset, query.length),
        );
        setPromptCursor(readline, nextCursor);
        searchCursor.current = nextCursor;
        return;
      } else {
        const sequence = terminalKey.sequence ?? "";
        if (!key.ctrl && !terminalKey.meta && sequence !== "" && !sequence.startsWith("\u001b")) {
          const nextQuery = `${query.slice(0, searchCursor.current)}${sequence}${query.slice(searchCursor.current)}`;
          const nextCursor = searchCursor.current + sequence.length;
          setPromptLine(readline, nextQuery, nextCursor);
          searchCursor.current = nextCursor;
          setQuery(nextQuery);
        }
      }
      return;
    }

    setPromptLine(readline, "");
    if (!selectedSetRow) return;
    if (isUpKey(key) || isDownKey(key)) {
      const offset = isUpKey(key) ? -1 : 1;
      setSetCursor(Math.max(0, Math.min(currentSetCursor + offset, setRows.length - 1)));
    } else if (isEnterKey(key)) {
      if (selectedSetRow.kind === "create") {
        finish({ type: "create", scope: selectedSetRow.scope, selectedPaths });
      } else {
        finish({
          type: "activate",
          scope: selectedSetRow.scope,
          setId: selectedSetRow.skillSet?.id ?? null,
          selectedPaths,
        });
      }
    } else if (key.name === "n") {
      const group = selectedSetRow.scope === "global" ? config.store.global : projectGroup;
      if (group && group.sets.length < MAX_SKILL_SETS) {
        finish({ type: "create", scope: selectedSetRow.scope, selectedPaths });
      }
    } else if (
      selectedSetRow.kind === "set" &&
      selectedSetRow.skillSet &&
      (key.name === "e" || key.name === "r" || key.name === "d")
    ) {
      const type = key.name === "e" ? "edit" : key.name === "r" ? "rename" : "delete";
      finish({
        type,
        scope: selectedSetRow.scope,
        setId: selectedSetRow.skillSet.id,
        selectedPaths,
      });
    }
  });

  const paginated = usePagination({
    items: visibleSkills.length === 0 ? [undefined] : visibleSkills,
    active,
    pageSize: config.pageSize ?? 14,
    loop: false,
    renderItem({ item, isActive }) {
      if (!item) return "";
      const cursor = isActive ? ">" : " ";
      const checkbox = item.enabled ? "[x]" : "[ ]";
      const line = `${cursor}${checkbox} ${config.renderSkill(item)}`;
      return isActive ? theme.style.highlight(line) : line;
    },
  });

  const tabs = [
    view === "skills" ? theme.style.highlight("技能") : "技能",
    view === "sets" ? theme.style.highlight("技能集") : "技能集",
  ].join("    ");
  const message = theme.style.message(config.message, status);
  if (status === "done") return [prefix, message].filter(Boolean).join(" ");

  if (view === "skills") {
    const header = `${[prefix, message].filter(Boolean).join(" ")}\n${tabs}\n\n${theme.style.highlight("搜索:")} ${query}`;
    const page = visibleSkills.length === 0 ? theme.style.error("没有匹配的技能") : paginated;
    const help = theme.style.help(
      "输入筛选 · ↑↓ 移动 · Space 切换 · Ctrl+A 全选 · Ctrl+I 反选 · Enter 应用 · →/Shift+Tab 技能集 · Esc 取消",
    );
    return [header, `${page}\n\n${help}`];
  }

  const globalActive = effectiveActiveSetId(skills, "global", config.store.global);
  const projectActive = projectGroup
    ? effectiveActiveSetId(skills, "project", projectGroup)
    : null;
  let rowIndex = 0;
  const renderGroup = (
    title: string,
    scope: SkillSetScope,
    rows: readonly SetRow[],
    activeId: string | null | undefined,
    group: { defaultPaths: string[] | null },
  ): string => {
    const scopedSkills = skillsInScope(skills, scope);
    const total = scopedSkills.length;
    const lines = rows.map((row) => {
      const isActive = rowIndex === currentSetCursor;
      rowIndex++;
      const cursor = isActive ? ">" : " ";
      let label: string;
      if (row.kind === "create") {
        label = "+ 新建技能集";
      } else if (row.kind === "default") {
        const defaultPaths =
          group.defaultPaths ?? scopedSkills.map((skill) => skill.path);
        const available = new Set(scopedSkills.map((skill) => skill.path));
        const count = defaultPaths.filter((skillPath) => available.has(skillPath)).length;
        label = `${activeId === null ? "●" : "○"} 默认  ${count}/${total}`;
      } else {
        const available = new Set(scopedSkills.map((skill) => skill.path));
        const count = row.skillSet!.paths.filter((skillPath) => available.has(skillPath)).length;
        const missing = row.skillSet!.paths.length - count;
        label = `${activeId === row.skillSet!.id ? "●" : "○"} ${row.skillSet!.name}  ${count}/${total}${missing > 0 ? `  缺失 ${missing}` : ""}`;
      }
      const line = `${cursor} ${label}`;
      return isActive ? theme.style.highlight(line) : line;
    });
    const statusTitle = activeId === undefined ? `${title} · 状态未匹配` : title;
    return `${theme.style.message(statusTitle, "idle")}\n${lines.join("\n")}`;
  };

  const groups = [renderGroup("全局", "global", globalRows, globalActive, config.store.global)];
  if (config.project && projectGroup) {
    groups.push(
      renderGroup(`项目 · ${config.project.name}`, "project", projectRows, projectActive, projectGroup),
    );
  }
  const header = `${[prefix, message].filter(Boolean).join(" ")}\n${tabs}`;
  const help = theme.style.help(
    "↑↓ 移动 · Enter 激活 · N 新建 · E 编辑 · R 重命名 · D 删除 · ←/Shift+Tab 技能 · Esc 取消",
  );
  return [header, `${groups.join("\n\n")}\n\n${help}`];
});
