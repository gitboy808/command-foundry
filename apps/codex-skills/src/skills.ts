import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import type { Skill, SkillSource } from "./types.js";

interface FrontMatter {
  name?: unknown;
  description?: unknown;
}

interface SkillMetadata {
  name: string;
  description: string;
}

async function findSkillFiles(root: string, visited = new Set<string>()): Promise<string[]> {
  try {
    // 使用真实路径去重，既支持符号链接技能目录，也避免链接环造成无限递归。
    const canonicalRoot = await realpath(root);
    if (visited.has(canonicalRoot)) return [];
    visited.add(canonicalRoot);

    const entries = await readdir(root, { withFileTypes: true });
    const children = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) return findSkillFiles(entryPath, visited);
        if (entry.isFile()) return entry.name === "SKILL.md" ? [entryPath] : [];
        if (!entry.isSymbolicLink()) return [];

        const target = await stat(entryPath);
        if (target.isDirectory()) return findSkillFiles(entryPath, visited);
        return target.isFile() && entry.name === "SKILL.md" ? [entryPath] : [];
      }),
    );
    return children.flat();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function parseFrontMatter(contents: string, skillPath: string): SkillMetadata {
  const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${skillPath} 缺少 YAML front matter。`);

  const metadata = parse(match[1]) as FrontMatter | null;
  if (!metadata || typeof metadata.name !== "string" || typeof metadata.description !== "string") {
    throw new Error(`${skillPath} 必须定义字符串类型的 name 和 description 字段。`);
  }
  return { name: metadata.name, description: metadata.description };
}

async function loadSkills(
  root: string,
  source: SkillSource,
  visited: Set<string>,
): Promise<Omit<Skill, "enabled">[]> {
  const skillPaths = await findSkillFiles(root, visited);
  return Promise.all(
    skillPaths.map(async (skillPath) => {
      const metadata = parseFrontMatter(await readFile(skillPath, "utf8"), skillPath);
      return { ...metadata, path: skillPath, source };
    }),
  );
}

export async function discoverSkills(
  enabledByPath: ReadonlyMap<string, boolean>,
  home = homedir(),
): Promise<Skill[]> {
  const visited = new Set<string>();
  const roots: Array<[string, SkillSource]> = [
    [path.join(home, ".codex", "skills", ".system"), "system"],
    [path.join(home, ".codex", "skills"), "user"],
    [path.join(home, ".agents", "skills"), "user"],
  ];
  const skills: Array<Omit<Skill, "enabled">> = [];
  for (const [root, source] of roots) {
    skills.push(...(await loadSkills(root, source, visited)));
  }

  return skills
    // Codex 未配置 enabled 时默认加载技能，因此这里按启用处理。
    .map((skill) => ({ ...skill, enabled: enabledByPath.get(skill.path) ?? true }))
    .sort((left, right) =>
      left.name.localeCompare(right.name) || left.path.localeCompare(right.path),
    );
}
