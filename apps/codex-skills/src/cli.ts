#!/usr/bin/env node
import { checkbox } from "@inquirer/prompts";
import { homedir } from "node:os";
import path from "node:path";
import { readConfig, updateSkillStates, writeConfigAtomically } from "./config.js";
import { discoverSkills } from "./skills.js";

const VERSION = "0.1.0";

function usage(): string {
  return `用法：codex-skills [--list]\n\n交互式启用或禁用本地 Codex 技能。\n\n选项：\n  --list        只读列出技能及其状态\n  -h, --help    显示帮助\n  -v, --version 显示版本\n\n操作：方向键移动，Space 切换，Enter 应用，Esc 取消。`;
}

function parseArgs(args: string[]): boolean {
  let list = false;

  for (const argument of args) {
    if (argument === "--help" || argument === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (argument === "--version" || argument === "-v") {
      console.log(VERSION);
      process.exit(0);
    }
    if (argument === "--list") {
      list = true;
      continue;
    }
    throw new Error(`未知选项：${argument}`);
  }
  return list;
}

function formatChoice(skill: { name: string; source: string; description: string }): string {
  const description = skill.description.replace(/\s+/g, " ").trim();
  const suffix = description.length > 72 ? `${description.slice(0, 69)}...` : description;
  const source = skill.source === "system" ? "系统" : "用户";
  return `${skill.name}  [${source}]  ${suffix}`;
}

async function main(): Promise<void> {
  const list = parseArgs(process.argv.slice(2));
  const home = homedir();
  const config = await readConfig(path.join(home, ".codex", "config.toml"));
  const skills = await discoverSkills(config.enabledByPath, home);

  if (skills.length === 0) {
    console.log("在 ~/.codex/skills 和 ~/.agents/skills 中未发现技能。");
    return;
  }

  if (list) {
    for (const skill of skills) {
      const source = skill.source === "system" ? "系统" : "用户";
      console.log(`${skill.enabled ? "[x]" : "[ ]"} ${skill.name}\t${source}\t${skill.path}`);
    }
    return;
  }

  const selected = await checkbox({
    message: "Codex 技能（Space 切换，Enter 应用，Esc 取消）",
    choices: skills.map((skill) => ({
      name: formatChoice(skill),
      value: skill.path,
      checked: skill.enabled,
    })),
    pageSize: Math.min(skills.length, 14),
    loop: false,
    theme: {
      icon: {
        checked: "[x]",
        unchecked: "[ ]",
        cursor: ">",
      },
    },
  });
  const selectedPaths = new Set(selected);
  const desired = new Map<string, boolean>();
  // Inquirer 返回所有勾选项；这里只提交状态真正发生变化的技能。
  for (const skill of skills) {
    const nextState = selectedPaths.has(skill.path);
    if (nextState !== skill.enabled) desired.set(skill.path, nextState);
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
