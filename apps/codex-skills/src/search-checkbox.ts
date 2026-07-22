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
import { searchSkills } from "./skills.js";
import type { Skill } from "./types.js";

interface SearchableCheckboxConfig {
  message: string;
  skills: readonly Skill[];
  renderSkill: (skill: Skill) => string;
  initialQuery?: string;
  pageSize?: number;
  loop?: boolean;
}

function restoreSearchLine(
  readline: { clearLine: (direction: 0 | 1 | -1) => void; write: (data: string) => void },
  query: string,
): void {
  readline.clearLine(0);
  const mutableReadline = readline as typeof readline & { cursor: number; line: string };
  mutableReadline.line = query;
  mutableReadline.cursor = query.length;
}

export const searchableCheckbox = createPrompt<string[], SearchableCheckboxConfig>(
  (config, done) => {
    const theme = makeTheme();
    const [status, setStatus] = useState<Status>("idle");
    const prefix = status === "done" ? theme.style.answer("✔") : "";
    const [query, setQuery] = useState(config.initialQuery ?? "");
    const searchCursor = useRef((config.initialQuery ?? "").length);
    const [skills, setSkills] = useState(config.skills.map((skill) => ({ ...skill })));
    const [activePath, setActivePath] = useState<string>();
    const visibleSkills = searchSkills(skills, query);
    const matchedActive = visibleSkills.findIndex((skill) => skill.path === activePath);
    const active = matchedActive === -1 ? 0 : matchedActive;

    useEffect((readline) => {
      if (config.initialQuery) readline.write(config.initialQuery);
    }, []);

    useKeypress((key, readline) => {
      const terminalKey = key as typeof key & { meta?: boolean; sequence?: string };
      if (isEnterKey(key)) {
        setStatus("done");
        done(skills.filter((skill) => skill.enabled).map((skill) => skill.path));
      } else if (
        isBackspaceKey(key) ||
        terminalKey.sequence === "\u007f" ||
        terminalKey.sequence === "\b"
      ) {
        if (searchCursor.current > 0) {
          const nextCursor = searchCursor.current - 1;
          const nextQuery = `${query.slice(0, nextCursor)}${query.slice(searchCursor.current)}`;
          restoreSearchLine(readline, nextQuery);
          const mutableReadline = readline as typeof readline & { cursor: number };
          mutableReadline.cursor = nextCursor;
          searchCursor.current = nextCursor;
          setQuery(nextQuery);
        }
      } else if (visibleSkills.length > 0 && (isUpKey(key) || isDownKey(key))) {
        restoreSearchLine(readline, query);
        const mutableReadline = readline as typeof readline & { cursor: number };
        mutableReadline.cursor = searchCursor.current;
        const offset = isUpKey(key) ? -1 : 1;
        const next = config.loop
          ? (active + offset + visibleSkills.length) % visibleSkills.length
          : Math.max(0, Math.min(active + offset, visibleSkills.length - 1));
        setActivePath(visibleSkills[next]!.path);
      } else if (visibleSkills.length > 0 && isSpaceKey(key)) {
        restoreSearchLine(readline, query);
        const mutableReadline = readline as typeof readline & { cursor: number };
        mutableReadline.cursor = searchCursor.current;
        const selected = visibleSkills[active]!;
        setSkills(
          skills.map((skill) =>
            skill.path === selected.path ? { ...skill, enabled: !skill.enabled } : skill,
          ),
        );
      } else if (visibleSkills.length > 0 && key.ctrl && key.name === "a") {
        restoreSearchLine(readline, query);
        const mutableReadline = readline as typeof readline & { cursor: number };
        mutableReadline.cursor = searchCursor.current;
        const visiblePaths = new Set(visibleSkills.map((skill) => skill.path));
        const enabled = visibleSkills.some((skill) => !skill.enabled);
        setSkills(
          skills.map((skill) =>
            visiblePaths.has(skill.path) ? { ...skill, enabled } : skill,
          ),
        );
      } else if (visibleSkills.length > 0 && key.ctrl && key.name === "i") {
        restoreSearchLine(readline, query);
        const mutableReadline = readline as typeof readline & { cursor: number };
        mutableReadline.cursor = searchCursor.current;
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
        const mutableReadline = readline as typeof readline & { cursor: number };
        mutableReadline.cursor = nextCursor;
        searchCursor.current = nextCursor;
        return;
      } else {
        const sequence = terminalKey.sequence ?? "";
        if (!key.ctrl && !terminalKey.meta && sequence !== "" && !sequence.startsWith("\u001b")) {
          const nextQuery = `${query.slice(0, searchCursor.current)}${sequence}${query.slice(searchCursor.current)}`;
          const nextCursor = searchCursor.current + sequence.length;
          restoreSearchLine(readline, nextQuery);
          const mutableReadline = readline as typeof readline & { cursor: number };
          mutableReadline.cursor = nextCursor;
          searchCursor.current = nextCursor;
          setQuery(nextQuery);
        }
      }
    });

    // 分页 hook 始终执行，确保搜索结果在空/非空之间切换时 hook 顺序不变。
    const paginated = usePagination({
      items: visibleSkills.length === 0 ? [undefined] : visibleSkills,
      active,
      pageSize: config.pageSize ?? 14,
      loop: config.loop ?? false,
      renderItem({ item, isActive }) {
        if (!item) return "";
        const cursor = isActive ? ">" : " ";
        const checkbox = item.enabled ? "[x]" : "[ ]";
        const line = `${cursor}${checkbox} ${config.renderSkill(item)}`;
        return isActive ? theme.style.highlight(line) : line;
      },
    });
    const message = theme.style.message(config.message, status);
    if (status === "done") {
      const count = skills.filter((skill) => skill.enabled).length;
      return [prefix, message, theme.style.answer(`${count} 项已启用`)].filter(Boolean).join(" ");
    }

    const header = `${[prefix, message].filter(Boolean).join(" ")}\n${theme.style.highlight("搜索:")} ${query}`;
    const page = visibleSkills.length === 0 ? theme.style.error("没有匹配的技能") : paginated;
    const help = theme.style.help(
      "输入筛选 · ↑↓ 移动 · Space 切换 · Ctrl+A 全选 · Ctrl+I 反选 · Enter 应用 · Esc 取消",
    );
    return [header, `${page}\n\n${help}`];
  },
);
