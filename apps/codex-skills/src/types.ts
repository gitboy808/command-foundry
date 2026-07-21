export type SkillSource = "system" | "user";

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
  hash: string;
  enabledByPath: Map<string, boolean>;
}
