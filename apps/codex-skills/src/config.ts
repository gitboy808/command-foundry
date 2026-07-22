import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import * as toml from "@iarna/toml";
import type { ConfigSnapshot } from "./types.js";

const SKILL_TABLE = "[[skills.config]]";

function sha256(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

function getSkillEntries(contents: string): Array<Record<string, unknown>> {
  if (contents.trim() === "") return [];
  let parsed: Record<string, unknown>;
  try {
    parsed = toml.parse(contents) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`无法读取 config.toml：${(error as Error).message}`);
  }

  const skills = parsed.skills;
  if (!skills || typeof skills !== "object") return [];
  const config = (skills as Record<string, unknown>).config;
  if (!Array.isArray(config)) return [];
  return config.filter((entry): entry is Record<string, unknown> =>
    Boolean(entry) && typeof entry === "object",
  );
}

function enabledMap(contents: string): Map<string, boolean> {
  const values = new Map<string, boolean>();
  for (const entry of getSkillEntries(contents)) {
    if (typeof entry.path === "string" && typeof entry.enabled === "boolean") {
      values.set(entry.path, entry.enabled);
    }
  }
  return values;
}

export async function readConfig(configPath: string): Promise<ConfigSnapshot> {
  let contents = "";
  try {
    contents = await readFile(configPath, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return { path: configPath, contents, hash: sha256(contents), enabledByPath: enabledMap(contents) };
}

interface TableBlock {
  start: number;
  end: number;
  contents: string;
}

function skillTableBlocks(contents: string): TableBlock[] {
  const headers = [
    ...contents.matchAll(/^[ \t]*(?:\[\[[^\]\r\n]+\]\]|\[[^\]\r\n]+\])[^\r\n]*(?:\r?\n|$)/gm),
  ];
  const skillHeaders = headers.filter((header) =>
    header[0].trimStart().startsWith(SKILL_TABLE),
  );
  return skillHeaders.map((header) => {
    const start = header.index ?? 0;
    const nextHeader = headers.find((candidate) => (candidate.index ?? 0) > start);
    const end = nextHeader?.index ?? contents.length;
    return { start, end, contents: contents.slice(start, end) };
  });
}

function pathInBlock(block: string): string | undefined {
  try {
    const parsed = toml.parse(block) as { skills?: { config?: Array<Record<string, unknown>> } };
    const entry = parsed.skills?.config?.[0];
    return typeof entry?.path === "string" ? entry.path : undefined;
  } catch {
    return undefined;
  }
}

function setEnabledInBlock(block: string, enabled: boolean): string {
  const value = String(enabled);
  const enabledLine = /^(\s*enabled\s*=\s*)(true|false)(\s*(?:#.*)?)(\r?\n|$)/m;
  if (enabledLine.test(block)) return block.replace(enabledLine, `$1${value}$3$4`);

  const newline = block.includes("\r\n") ? "\r\n" : "\n";
  return `${block.replace(/(?:\r?\n)*$/, "")}${newline}enabled = ${value}${newline}`;
}

function commentsAfterBlock(block: string): string {
  const lines = (block.match(/[^\r\n]*(?:\r\n|\n|$)/g) ?? []).filter(Boolean);
  let lastContent = lines.length - 1;
  while (lastContent >= 0) {
    const line = lines[lastContent]?.trim() ?? "";
    if (line !== "" && !line.startsWith("#")) break;
    lastContent--;
  }

  const trailing = lines.slice(lastContent + 1);
  const firstComment = trailing.findIndex((line) => line.trimStart().startsWith("#"));
  return firstComment === -1 ? "" : trailing.slice(firstComment).join("");
}

function appendSkillBlock(contents: string, skillPath: string, enabled: boolean): string {
  const newline = contents.includes("\r\n") ? "\r\n" : "\n";
  const prefix = contents.length === 0 ? "" : contents.endsWith(newline) ? newline : `${newline}${newline}`;
  return `${contents}${prefix}${SKILL_TABLE}${newline}path = ${JSON.stringify(skillPath)}${newline}enabled = ${enabled}${newline}`;
}

export function updateSkillStates(
  contents: string,
  desiredStates: ReadonlyMap<string, boolean>,
): string {
  const requested = new Map(desiredStates);
  const blocks = skillTableBlocks(contents);
  const replacements = new Map<TableBlock, string>();

  // false 保留并更新覆盖块；true 删除覆盖块，让 Codex 回落到默认启用状态。
  for (const block of blocks) {
    const skillPath = pathInBlock(block.contents);
    if (!skillPath || !requested.has(skillPath)) continue;
    const enabled = requested.get(skillPath)!;
    replacements.set(
      block,
      enabled ? commentsAfterBlock(block.contents) : setEnabledInBlock(block.contents, false),
    );
  }

  let updated = "";
  let cursor = 0;
  for (const block of blocks) {
    updated += contents.slice(cursor, block.start);
    updated += replacements.get(block) ?? block.contents;
    cursor = block.end;
  }
  updated += contents.slice(cursor);

  for (const block of blocks) {
    const skillPath = pathInBlock(block.contents);
    if (skillPath) requested.delete(skillPath);
  }

  for (const [skillPath, enabled] of requested) {
    if (!enabled) updated = appendSkillBlock(updated, skillPath, false);
  }

  // 写入文件系统前校验生成的 TOML 文本。
  getSkillEntries(updated);
  return updated;
}

export async function writeConfigAtomically(snapshot: ConfigSnapshot, contents: string): Promise<void> {
  const current = await readConfig(snapshot.path);
  // 用户确认期间若配置被其他进程修改，拒绝用旧快照覆盖新内容。
  if (current.hash !== snapshot.hash) {
    throw new Error("工具运行期间 config.toml 已被修改。请重新运行 codex-skills 后再试。");
  }
  if (contents === snapshot.contents) return;

  const directory = path.dirname(snapshot.path);
  await mkdir(directory, { recursive: true });
  const tempPath = path.join(directory, `.${path.basename(snapshot.path)}.${randomUUID()}.tmp`);
  let mode = 0o600;
  try {
    mode = (await stat(snapshot.path)).mode;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // 临时文件与目标文件位于同一目录，rename 可以原子替换配置。
  await writeFile(tempPath, contents, { encoding: "utf8", mode, flag: "wx" });
  await rename(tempPath, snapshot.path);
}
