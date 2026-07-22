import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  emptySkillSetStore,
  parseSkillSetStore,
  readSkillSetStore,
  writeSkillSetStoreAtomically,
} from "../src/store.ts";

test("空文件使用默认技能集状态", () => {
  assert.deepEqual(parseSkillSetStore(""), emptySkillSetStore());
});

test("迁移 v1 时保留具名集合并重新初始化默认选择", () => {
  const migrated = parseSkillSetStore(
    JSON.stringify({
      version: 1,
      global: {
        sets: [{ id: "dev", name: "开发", paths: ["/skills/dev/SKILL.md"] }],
        activeSetId: "dev",
        defaultPaths: ["/旧版误捕获/SKILL.md"],
      },
      projects: {},
    }),
  );

  assert.equal(migrated.version, 2);
  assert.equal(migrated.global.sets[0]?.name, "开发");
  assert.equal(migrated.global.activeSetId, "dev");
  assert.equal(migrated.global.defaultPaths, null);
});

test("拒绝超过上限或包含重复名称的技能集状态", () => {
  const base = emptySkillSetStore();
  assert.throws(
    () =>
      parseSkillSetStore(
        JSON.stringify({
          ...base,
          global: {
            sets: [
              { id: "1", name: "重复", paths: [] },
              { id: "2", name: "重复", paths: [] },
            ],
            activeSetId: null,
          },
        }),
      ),
    /重复的技能集名称/,
  );
  assert.throws(
    () =>
      parseSkillSetStore(
        JSON.stringify({
          ...base,
          global: {
            sets: [1, 2, 3, 4].map((id) => ({ id: String(id), name: String(id), paths: [] })),
            activeSetId: null,
          },
        }),
      ),
    /最多只能包含 3 个技能集/,
  );
});

test("原子写入技能集状态并拒绝并发覆盖", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "codex-skills-store-"));
  const storePath = path.join(directory, "codex-skills.json");
  const snapshot = await readSkillSetStore(storePath);
  const data = {
    ...snapshot.data,
    global: {
      sets: [{ id: "dev", name: "开发", paths: ["/skills/dev/SKILL.md"] }],
      activeSetId: "dev",
      defaultPaths: null,
    },
  };

  await writeSkillSetStoreAtomically(snapshot, data);
  assert.deepEqual(parseSkillSetStore(await readFile(storePath, "utf8")), data);

  await writeFile(storePath, `${JSON.stringify(emptySkillSetStore())}\n`, "utf8");
  await assert.rejects(
    writeSkillSetStoreAtomically(snapshot, data),
    /codex-skills\.json 已被修改/,
  );
});
