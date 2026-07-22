import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { ProjectContext } from "./types.js";

export async function findProjectContext(cwd = process.cwd()): Promise<ProjectContext | undefined> {
  let current = path.resolve(cwd);

  while (true) {
    try {
      // `.git` 既可能是仓库目录，也可能是 worktree 指针文件。
      await stat(path.join(current, ".git"));
      const root = await realpath(current);
      return { root, directory: current, name: path.basename(root) };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
