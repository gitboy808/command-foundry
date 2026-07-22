export type SkillSource = "system" | "user" | "project";

export interface Skill {
  path: string;
  name: string;
  description: string;
  source: SkillSource;
  enabled: boolean;
}

export interface ConfigSnapshot {
  path: string;
  contents: string;
  enabledByPath: Map<string, boolean>;
}

export interface ProjectContext {
  root: string;
  directory: string;
  name: string;
}

export type SkillSetScope = "global" | "project";

export interface SkillSet {
  id: string;
  name: string;
  paths: string[];
}

export interface SkillSetGroup {
  sets: SkillSet[];
  activeSetId: string | null;
  // null 表示旧状态文件尚未捕获默认技能选择。
  defaultPaths: string[] | null;
}

export interface ProjectSkillSetGroup extends SkillSetGroup {
  displayName: string;
}

export interface SkillSetStore {
  version: 2;
  global: SkillSetGroup;
  projects: Record<string, ProjectSkillSetGroup>;
}

export interface SkillSetStoreSnapshot {
  path: string;
  contents: string;
  data: SkillSetStore;
}
