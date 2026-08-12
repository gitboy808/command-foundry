import { confirm, select } from "@inquirer/prompts";

export type Intent = "install" | "update" | "details" | "cancel";

export interface PromptAdapter {
  chooseIntent(availability: { canInstall: boolean; canUpdate: boolean }): Promise<Intent>;
  confirm(message: string): Promise<boolean>;
}

export const inquirerPrompts: PromptAdapter = {
  chooseIntent: ({ canInstall, canUpdate }) => select<Intent>({
    message: "现在要做什么？",
    choices: [
      ...(canInstall ? [{ name: "安装缺失工具", value: "install" as const, description: "使用 catalog 中唯一的推荐入口" }] : []),
      ...(canUpdate ? [{ name: "更新已安装工具", value: "update" as const, description: "把终端交给各 CLI updater" }] : []),
      { name: "查看精确命令", value: "details" as const },
      { name: "退出", value: "cancel" as const },
    ],
    loop: false,
  }),
  confirm: (message) => confirm({ message, default: false }),
};
