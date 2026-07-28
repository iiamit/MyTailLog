import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, extOf, mimeOf } from "../src/lib/backup/format";

test("backup format id + version are the stable gate the importer checks", () => {
  assert.equal(BACKUP_FORMAT, "mytaillog-backup");
  assert.equal(BACKUP_FORMAT_VERSION, 1);
});

test("extOf: takes the final extension, lowercased", () => {
  assert.equal(extOf("aircraft/logbook/scan.PNG"), "png");
  assert.equal(extOf("report.pdf"), "pdf");
  assert.equal(extOf("a.b.jpeg"), "jpeg");
});

test("extOf: no extension / null / undefined default to jpg", () => {
  assert.equal(extOf("noextension"), "jpg");
  assert.equal(extOf("trailingdot."), "jpg");
  assert.equal(extOf(null), "jpg");
  assert.equal(extOf(undefined), "jpg");
});

test("mimeOf: png and pdf map explicitly; everything else is jpeg", () => {
  assert.equal(mimeOf("png"), "image/png");
  assert.equal(mimeOf("pdf"), "application/pdf");
  assert.equal(mimeOf("jpg"), "image/jpeg");
  assert.equal(mimeOf("jpeg"), "image/jpeg");
  assert.equal(mimeOf("webp"), "image/jpeg");
});
