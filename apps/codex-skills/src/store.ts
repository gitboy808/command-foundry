import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ProjectSkillSetGroup,
  SkillSet,
  SkillSetGroup,
  SkillSetStore,
  SkillSetStoreSnapshot,
} from "./types.js";

export const MAX_SKILL_SETS = 3;

function sha256(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

export function emptySkillSetStore(): SkillSetStore {
  return {
    version: 2,
    global: { sets: [], activeSetId: null, defaultPaths: null },
    projects: {},
  };
}

function parseSkillSet(value: unknown, location: string): SkillSet {
  if (!value || typeof value !== "object") {
    throw new Error(`${location} 必须是对象。`);
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id.trim() === "") {
    throw new Error(`${location}.id 必须是非空字符串。`);
  }
  if (typeof candidate.name !== "string" || candidate.name.trim() === "") {
    throw new Error(`${location}.name 必须是非空字符串。`);
  }
  if (!Array.isArray(candidate.paths) || candidate.paths.some((item) => typeof item !== "string")) {
    throw new Error(`${location}.paths 必须是字符串数组。`);
  }
  const paths = [...new Set(candidate.paths as string[])];
  return { id: candidate.id, name: candidate.name, paths };
}

function parseGroup(value: unknown, location: string, preserveDefaultPaths: boolean): SkillSetGroup {
  if (!value || typeof value !== "object") {
    throw new Error(`${location} 必须是对象。`);
  }
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.sets)) {
    throw new Error(`${location}.sets 必须是数组。`);
  }
  if (candidate.sets.length > MAX_SKILL_SETS) {
    throw new Error(`${location} 最多只能包含 ${MAX_SKILL_SETS} 个技能集。`);
  }
  const sets = candidate.sets.map((item, index) =>
    parseSkillSet(item, `${location}.sets[${index}]`),
  );
  if (new Set(sets.map((set) => set.id)).size !== sets.length) {
    throw new Error(`${location} 包含重复的技能集 id。`);
  }
  if (new Set(sets.map((set) => set.name)).size !== sets.length) {
    throw new Error(`${location} 包含重复的技能集名称。`);
  }
  if (candidate.activeSetId !== null && typeof candidate.activeSetId !== "string") {
    throw new Error(`${location}.activeSetId 必须是字符串或 null。`);
  }
  const activeSetId = candidate.activeSetId as string | null;
  if (activeSetId !== null && !sets.some((skillSet) => skillSet.id === activeSetId)) {
    throw new Error(`${location}.activeSetId 必须引用现有技能集。`);
  }
  if (
    preserveDefaultPaths &&
    candidate.defaultPaths !== undefined &&
    candidate.defaultPaths !== null &&
    (!Array.isArray(candidate.defaultPaths) ||
      candidate.defaultPaths.some((item) => typeof item !== "string"))
  ) {
    throw new Error(`${location}.defaultPaths 必须是字符串数组或 null。`);
  }
  const defaultPaths =
    !preserveDefaultPaths || candidate.defaultPaths === null || candidate.defaultPaths === undefined
      ? null
      : [...new Set(candidate.defaultPaths as string[])];
  return { sets, activeSetId, defaultPaths };
}

export function parseSkillSetStore(contents: string): SkillSetStore {
  if (contents.trim() === "") return emptySkillSetStore();

  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch (error) {
    throw new Error(`无法读取 codex-skills.json：${(error as Error).message}`);
  }
  if (!value || typeof value !== "object") {
    throw new Error("codex-skills.json 的根节点必须是对象。");
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 && candidate.version !== 2) {
    throw new Error("codex-skills.json 使用了不支持的版本。");
  }
  const preserveDefaultPaths = candidate.version === 2;
  if (!candidate.projects || typeof candidate.projects !== "object" || Array.isArray(candidate.projects)) {
    throw new Error("codex-skills.json 的 projects 必须是对象。");
  }

  const projects: Record<string, ProjectSkillSetGroup> = {};
  for (const [projectRoot, projectValue] of Object.entries(
    candidate.projects as Record<string, unknown>,
  )) {
    if (!projectValue || typeof projectValue !== "object") {
      throw new Error(`projects[${JSON.stringify(projectRoot)}] 必须是对象。`);
    }
    const displayName = (projectValue as Record<string, unknown>).displayName;
    if (typeof displayName !== "string" || displayName.trim() === "") {
      throw new Error(`projects[${JSON.stringify(projectRoot)}].displayName 必须是非空字符串。`);
    }
    projects[projectRoot] = {
      ...parseGroup(projectValue, `projects[${JSON.stringify(projectRoot)}]`, preserveDefaultPaths),
      displayName,
    };
  }

  return {
    version: 2,
    global: parseGroup(candidate.global, "global", preserveDefaultPaths),
    projects,
  };
}

export async function readSkillSetStore(storePath: string): Promise<SkillSetStoreSnapshot> {
  let contents = "";
  try {
    contents = await readFile(storePath, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return { path: storePath, contents, hash: sha256(contents), data: parseSkillSetStore(contents) };
}

export async function assertSkillSetStoreUnchanged(
  snapshot: SkillSetStoreSnapshot,
): Promise<void> {
  const current = await readSkillSetStore(snapshot.path);
  if (current.hash !== snapshot.hash) {
    throw new Error("工具运行期间 codex-skills.json 已被修改。请重新运行后再试。");
  }
}

export async function writeSkillSetStoreAtomically(
  snapshot: SkillSetStoreSnapshot,
  data: SkillSetStore,
): Promise<void> {
  await assertSkillSetStoreUnchanged(snapshot);

  const contents = `${JSON.stringify(data, null, 2)}\n`;
  // 写入前再次经过解析器，避免将内存中的无效状态落盘。
  parseSkillSetStore(contents);
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

  try {
    await writeFile(tempPath, contents, { encoding: "utf8", mode, flag: "wx" });
    await rename(tempPath, snapshot.path);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}
