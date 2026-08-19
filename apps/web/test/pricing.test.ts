import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCost } from "../src/lib/extraction/pricing";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≈ ${b}`);

test("estimateCost: opus tier at $15/$75 per M", () => {
  near(estimateCost("claude-opus-4-8", 1_000_000, 1_000_000), 15 + 75);
  near(estimateCost("claude-opus-4-8", 2_000_000, 0), 30);
});

test("estimateCost: sonnet tier at $3/$15 per M", () => {
  near(estimateCost("claude-sonnet-5", 1_000_000, 1_000_000), 3 + 15);
});

test("estimateCost: haiku tier at $1/$5 per M", () => {
  near(estimateCost("claude-haiku-4-5", 1_000_000, 1_000_000), 1 + 5);
});

test("estimateCost: matched by substring so dated snapshots still resolve", () => {
  near(estimateCost("claude-haiku-4-5-20251001", 1_000_000, 0), 1);
});

test("estimateCost: an unknown model falls back to the opus tier (never understates cost)", () => {
  near(estimateCost("some-future-model", 1_000_000, 1_000_000), 15 + 75);
});

test("estimateCost: OpenAI Sol, Terra, and Luna tiers", () => {
  near(estimateCost("gpt-5.6-sol", 1_000_000, 1_000_000), 35);
  near(estimateCost("gpt-5.6-terra", 1_000_000, 1_000_000), 14);
  near(estimateCost("gpt-5.6-luna", 1_000_000, 1_000_000), 1.4);
});

test("estimateCost: zero tokens costs nothing", () => {
  near(estimateCost("claude-opus-4-8", 0, 0), 0);
});
