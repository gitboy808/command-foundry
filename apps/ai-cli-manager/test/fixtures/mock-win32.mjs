import "./mock-latest.mjs";

await import("cross-spawn");
Object.defineProperty(process, "platform", { value: "win32" });
