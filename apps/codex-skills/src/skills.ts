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

function fuzzyScore(query: string, text: string): number | undefined {
  const exact = text.indexOf(query);
  if (exact !== -1) return exact;

  let position = -1;
  let gaps = 0;
  for (const character of query) {
    const next = text.indexOf(character, position + 1);
    if (next === -1) return undefined;
    gaps += next - position - 1;
    position = next;
  }
  return 100 + gaps;
}

export function searchSkills(skills: readonly Skill[], query: string): Skill[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...skills];

  // 名称支持模糊匹配；描述和路径只做子串匹配，避免长文本产生大量误命中。
  return skills
    .map((skill) => {
      const fields = [skill.name, skill.description, skill.path].map((value) =>
        value.toLocaleLowerCase(),
      );
      let score = 0;
      for (const term of terms) {
        const matches: number[] = [];
        const nameScore = fuzzyScore(term, fields[0]!);
        if (nameScore !== undefined) matches.push(nameScore);
        for (let index = 1; index < fields.length; index++) {
          const exact = fields[index]!.indexOf(term);
          if (exact !== -1) matches.push(exact + index * 1_000);
        }
        if (matches.length === 0) return undefined;
        score += Math.min(...matches);
      }
      return { skill, score };
    })
    .filter((result): result is { skill: Skill; score: number } => result !== undefined)
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.skill.name.localeCompare(right.skill.name) ||
        left.skill.path.localeCompare(right.skill.path),
    )
    .map(({ skill }) => skill);
}

async function projectSkillRoots(cwd: string): Promise<string[]> {
  const start = path.resolve(cwd);
  const directories = [start];
  let current = start;

  while (true) {
    try {
      // `.git` 可能是目录，也可能是 worktree 中的指针文件。
      await stat(path.join(current, ".git"));
      return directories.map((directory) => path.join(directory, ".agents", "skills"));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const parent = path.dirname(current);
    if (parent === current) return [path.join(start, ".agents", "skills")];
    directories.push(parent);
    current = parent;
  }
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
  cwd = process.cwd(),
): Promise<Skill[]> {
  const visited = new Set<string>();
  const roots: Array<[string, SkillSource]> = [
    [path.join(home, ".codex", "skills", ".system"), "system"],
    [path.join(home, ".codex", "skills"), "user"],
    [path.join(home, ".agents", "skills"), "user"],
  ];
  for (const root of await projectSkillRoots(cwd)) {
    roots.push([root, "project"]);
  }
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
