import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readConfig } from "../src/config.ts";
import { writeStateChanges } from "../src/state-writer.ts";
import { emptySkillSetStore, readSkillSetStore } from "../src/store.ts";

test("状态文件冲突时不提前写入 Codex 配置", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "codex-skills-state-writer-"));
  const configPath = path.join(directory, "config.toml");
  const storePath = path.join(directory, "codex-skills.json");
  const originalConfig = 'model = "original"\n';
  await writeFile(configPath, originalConfig, "utf8");

  const config = await readConfig(configPath);
  const store = await readSkillSetStore(storePath);
  await writeFile(storePath, `${JSON.stringify(emptySkillSetStore())}\n`, "utf8");

  await assert.rejects(
    writeStateChanges(
      { snapshot: config, contents: 'model = "updated"\n' },
      { snapshot: store, data: store.data },
    ),
    /codex-skills\.json 已被修改/,
  );
  assert.equal(await readFile(configPath, "utf8"), originalConfig);
});
