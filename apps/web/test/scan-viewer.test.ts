import { test } from "node:test";
import assert from "node:assert/strict";
import { settledImage } from "../src/ui/ScanViewer";

test("a scan that loaded before hydration counts as shown, a broken one as failed, a pending one waits", () => {
  assert.equal(settledImage({ complete: true, naturalWidth: 1200 }), "ok");
  assert.equal(settledImage({ complete: true, naturalWidth: 0 }), "error");
  assert.equal(settledImage({ complete: false, naturalWidth: 0 }), null);
  assert.equal(settledImage(null), null);
});
