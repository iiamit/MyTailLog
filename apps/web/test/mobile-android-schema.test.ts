import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("Android SQLite parser can execute the initial mobile schema", () => {
  const source = readFileSync(new URL("../../mobile/src/db.ts", import.meta.url), "utf8");
  const schema = source.match(/await db\.execute\(`([\s\S]*?)`\);/)?.[1];
  assert.ok(schema);
  // @capacitor-community/sqlite on Android splits on this exact delimiter.
  const statements = schema.split(";\n").map(part => part.split("\n").map(line => line.trim().split("--")[0]).join(" ").trim());
  if (!statements.at(-1)) statements.pop(); // the native parser drops a trailing empty part
  assert.equal(statements.length, 5);
  assert.ok(statements.every(Boolean));
  const db = new DatabaseSync(":memory:");
  for (const statement of statements) db.exec(statement);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='action_queue'").get()?.n, 1);
  db.close();
});
