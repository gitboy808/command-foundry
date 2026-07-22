import assert from "node:assert/strict";
import test from "node:test";
import { horizontalMenuTarget } from "../src/manager-prompt.ts";

test("搜索为空时使用左右键在技能和技能集菜单间导航", () => {
  assert.equal(horizontalMenuTarget("skills", "", "right"), "sets");
  assert.equal(horizontalMenuTarget("sets", "", "left"), "skills");
  assert.equal(horizontalMenuTarget("skills", "", "left"), undefined);
  assert.equal(horizontalMenuTarget("sets", "", "right"), undefined);
});

test("搜索框有内容时左右键保留给输入光标", () => {
  assert.equal(horizontalMenuTarget("skills", "image", "left"), undefined);
  assert.equal(horizontalMenuTarget("skills", "image", "right"), undefined);
});
