interface PromptReadline {
  clearLine: (direction: 0 | 1 | -1) => void;
}

export function setPromptCursor(readline: PromptReadline, cursor: number): void {
  (readline as PromptReadline & { cursor: number }).cursor = cursor;
}

export function setPromptLine(
  readline: PromptReadline,
  value: string,
  cursor = value.length,
): void {
  readline.clearLine(0);
  const mutableReadline = readline as PromptReadline & { cursor: number; line: string };
  mutableReadline.line = value;
  setPromptCursor(mutableReadline, cursor);
}
