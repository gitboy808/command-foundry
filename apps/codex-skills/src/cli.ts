#!/usr/bin/env node
import { homedir } from "node:os";
import path from "node:path";
import type { Key } from "node:readline";
import { readConfig, updateSkillStates, writeConfigAtomically } from "./config.js";
import { searchableCheckbox } from "./search-checkbox.js";
import { discoverSkills, searchSkills } from "./skills.js";
import type { SkillSource } from "./types.js";

const VERSION = "0.1.0";

function usage(): string {
  return `用法：codex-skills [--list] [--search [关键词]]\n\n交互式启用或禁用本地及当前项目的 Codex 技能。\n\n选项：\n  --list              只读列出技能及其状态\n  -s, --search [关键词] 预填搜索框；与 --list 配合时过滤输出\n  -h, --help          显示帮助\n  -v, --version       显示版本\n\n操作：输入以搜索，方向键移动，Space 切换，Enter 应用，Esc 取消。`;
}

interface CliOptions {
  list: boolean;
  search?: string | true;
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
    throw new Error(`未知选项：${argument}`);
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

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.list && options.search === true) {
    throw new Error("--list 与 --search 一起使用时必须提供搜索关键词。");
  }
  const home = homedir();
  const config = await readConfig(path.join(home, ".codex", "config.toml"));
  const skills = await discoverSkills(config.enabledByPath, home);

  if (skills.length === 0) {
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

  const selected = await withEscapeCancellation((signal) =>
    searchableCheckbox(
      {
        message: "Codex 技能（Space 切换，Enter 应用，Esc 取消）",
        skills,
        renderSkill: formatChoice,
        initialQuery: typeof options.search === "string" ? options.search : "",
        pageSize: Math.min(skills.length, 14),
        loop: false,
      },
      { signal },
    ),
  );
  const selectedPaths = new Set(selected);
  const desired = new Map<string, boolean>();
  // 启用状态是默认值；已有 enabled=true 覆盖项也在提交时顺便清理。
  for (const skill of skills) {
    const nextState = selectedPaths.has(skill.path);
    if (
      nextState !== skill.enabled ||
      (nextState && config.enabledByPath.has(skill.path))
    ) {
      desired.set(skill.path, nextState);
    }
  }

  if (desired.size === 0) {
    console.log("没有需要应用的变更。");
    return;
  }
  const updated = updateSkillStates(config.contents, desired);
  await writeConfigAtomically(config, updated);

  console.log(`已将 ${desired.size} 项技能变更写入 ${config.path}。`);
  console.log("请重启 Codex 或新建任务，使新的技能状态生效。");
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
