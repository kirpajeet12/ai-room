import { test } from "node:test";
import assert from "node:assert/strict";
import { stripControl } from "../src/sanitize.js";

test("removes clipboard-write (OSC 52) sequences", () => {
  assert.equal(stripControl("hi\x1b]52;c;cm0gLXJmIH4=\x07 there"), "hi there");
  assert.equal(stripControl("hi\x1b]52;c;cm0gLXJmIH4=\x1b\\ there"), "hi there");
});

test("removes window-title, hyperlink and colour sequences", () => {
  assert.equal(stripControl("\x1b]0;pwned\x07ok"), "ok");
  assert.equal(stripControl("\x1b]8;;https://evil.example\x07click\x1b]8;;\x07"), "click");
  assert.equal(stripControl("\x1b[31mred\x1b[0m"), "red");
  assert.equal(stripControl("\x9b2Jgone"), "gone");
});

test("removes cursor tricks that hide or overwrite text", () => {
  assert.equal(stripControl("safe\rEVIL"), "safeEVIL");
  assert.equal(stripControl("abc\x08\x08\x08xyz"), "abcxyz");
  assert.equal(stripControl("\x1b[2K\x1b[1Ahidden"), "hidden");
});

test("unterminated sequences cannot swallow the terminal", () => {
  assert.equal(stripControl("before\x1b]52;c;AAAA"), "before");
  assert.equal(stripControl("trailing\x1b"), "trailing");
});

test("keeps normal text, newlines, tabs and unicode", () => {
  const text = "line 1\nline 2\tTab — café 👋 ਪੰਜਾਬੀ";
  assert.equal(stripControl(text), text);
  assert.equal(stripControl("a\r\nb"), "a\nb");
});
