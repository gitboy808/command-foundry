import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export async function readTextFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

export async function writeTextFileAtomically(
  filePath: string,
  contents: string,
): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const tempPath = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  let mode = 0o600;
  try {
    mode = (await stat(filePath)).mode;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  try {
    await writeFile(tempPath, contents, { encoding: "utf8", mode, flag: "wx" });
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}
