import { styleText } from "node:util";
import {
  createPrompt,
  isEnterKey,
  useEffect,
  useKeypress,
  useState,
  type Status,
} from "@inquirer/core";

interface TextInputConfig {
  message: string;
  initialValue?: string;
  validate?: (value: string) => string | undefined;
}

export const textInput = createPrompt<string, TextInputConfig>((config, done) => {
  const [status, setStatus] = useState<Status>("idle");
  const [value, setValue] = useState(config.initialValue ?? "");
  const [error, setError] = useState<string>();
  const prefix = status === "done" ? styleText("green", "✔") : ">";

  useEffect((readline) => {
    if (config.initialValue) readline.write(config.initialValue);
  }, []);

  useKeypress((key, readline) => {
    if (isEnterKey(key)) {
      // Enter 到达 hook 时 readline.line 已被清空，提交前一帧保存的输入状态。
      const answer = value.trim();
      const validation = config.validate?.(answer);
      if (validation) {
        setError(validation);
        return;
      }
      setValue(answer);
      setStatus("done");
      done(answer);
    } else {
      setValue(readline.line);
      setError(undefined);
    }
  });

  const answer = status === "done" ? styleText("cyan", value) : value;
  const line = `${prefix} ${styleText("bold", config.message)} ${answer}`;
  return error ? `${line}\n${styleText("red", error)}` : line;
});

interface ConfirmConfig {
  message: string;
  default?: boolean;
}

export const confirmPrompt = createPrompt<boolean, ConfirmConfig>((config, done) => {
  const [status, setStatus] = useState<Status>("idle");
  const [value, setValue] = useState("");
  const prefix = status === "done" ? styleText("green", "✔") : ">";

  useKeypress((key, readline) => {
    if (isEnterKey(key)) {
      const answer = value ? /^y(es)?$/i.test(value) : config.default !== false;
      setValue(answer ? "yes" : "no");
      setStatus("done");
      done(answer);
    } else {
      setValue(readline.line);
    }
  });

  const defaultValue = status === "done" ? "" : config.default === false ? " (y/N)" : " (Y/n)";
  const answer = status === "done" ? styleText("cyan", value) : value;
  return `${prefix} ${styleText("bold", config.message)}${styleText("dim", defaultValue)} ${answer}`;
});
