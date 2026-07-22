import { writeConfigAtomically } from "./config.js";
import { assertSkillSetStoreUnchanged, writeSkillSetStoreAtomically } from "./store.js";
import type {
  ConfigSnapshot,
  SkillSetStore,
  SkillSetStoreSnapshot,
} from "./types.js";

interface ConfigChange {
  snapshot: ConfigSnapshot;
  contents: string;
}

interface StoreChange {
  snapshot: SkillSetStoreSnapshot;
  data: SkillSetStore;
}

export async function writeStateChanges(
  configChange?: ConfigChange,
  storeChange?: StoreChange,
): Promise<void> {
  // 两个文件都要更新时，先验证后写入的状态文件，避免已知冲突造成半提交。
  if (configChange && storeChange) {
    await assertSkillSetStoreUnchanged(storeChange.snapshot);
  }
  if (configChange) {
    await writeConfigAtomically(configChange.snapshot, configChange.contents);
  }
  if (storeChange) {
    await writeSkillSetStoreAtomically(storeChange.snapshot, storeChange.data);
  }
}
