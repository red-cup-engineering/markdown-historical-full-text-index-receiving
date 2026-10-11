import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openFullTextIndex } from "../src/vault/full-text-index.mjs";
import { isSqliteFile } from "../src/vault/import-sql-full-text-index.mjs";
import { writeLegacySqlite } from "./fixtures/write-legacy-sqlite.mjs";

test("a query ranks the documents holding every one of its words, folded, diacritics kept", () => {
  const index = openFullTextIndex();
  index.revise(({ put }) => {
    put("large.md", "r1", "irrelevant ".repeat(10_000) + "Pheží allocation allocation");
    put("direct.md", "r1", "PHEŽÍ allocation");
    put("missing.md", "r1", "allocation without the other requested term");
    put("plain.md", "r1", "Phezi allocation");
  });
  assert.deepEqual(index.search("Pheží allocation").map((hit) => hit.path), ["direct.md", "large.md"]);
  assert.deepEqual(index.search("   "), []);
  assert.equal(index.size, 4);
  assert.equal(index.root, null);
});

test("a kept index reopens at the revisions it held, and a revision replaces a document's text", () => {
  const dir = mkdtempSync(join(tmpdir(), "full-text-index-"));
  try {
    const root = join(dir, "full-text");
    const first = openFullTextIndex({ root });
    first.revise(({ put }) => { put("a.md", "r1", "cedar fog"); put("b.md", "r1", "cedar"); });
    first.close();
    const again = openFullTextIndex({ root });
    assert.equal(again.revisionOf("a.md"), "r1");
    again.revise(({ put, remove }) => { put("a.md", "r2", "salt"); remove("b.md"); });
    assert.deepEqual(again.search("cedar"), []);
    assert.deepEqual(again.search("salt").map((hit) => hit.path), ["a.md"]);
    assert.deepEqual(again.paths(), ["a.md"]);
    again.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an SQLite index file is read into the journal beside it once, and the journal answers after", () => {
  const dir = mkdtempSync(join(tmpdir(), "full-text-index-"));
  try {
    const file = join(dir, "full-text.sqlite");
    // The layout the SQLite index wrote (layout 1).
    writeLegacySqlite(file, [
      `CREATE TABLE documents (id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, revision TEXT NOT NULL);
      CREATE VIRTUAL TABLE texts USING fts5(body, tokenize = 'unicode61 remove_diacritics 0');
      PRAGMA user_version = 1;`,
      ["INSERT INTO documents (id, path, revision) VALUES (?, ?, ?)", 1, "a.md", "r1"],
      ["INSERT INTO texts (rowid, body) VALUES (?, ?)", 1, "cedar fog"],
      ["INSERT INTO documents (id, path, revision) VALUES (?, ?, ?)", 2, "b.md", "r7"],
      ["INSERT INTO texts (rowid, body) VALUES (?, ?)", 2, "salt cedar"],
    ]);
    assert.equal(isSqliteFile(file), true);

    const opened = openFullTextIndex({ file });
    assert.equal(opened.root, `${file}.journal`);
    assert.ok(existsSync(`${file}.journal`));
    assert.equal(opened.revisionOf("b.md"), "r7");
    assert.deepEqual(opened.search("cedar fog").map((hit) => hit.path), ["a.md"]);
    opened.revise(({ remove }) => remove("a.md"));

    // Read once: the journal is not empty, so the SQLite file is not read again.
    const reopened = openFullTextIndex({ file });
    assert.deepEqual(reopened.paths(), ["b.md"]);
    assert.deepEqual(reopened.search("salt").map((hit) => hit.path), ["b.md"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a file that is not SQLite is not read", () => {
  const dir = mkdtempSync(join(tmpdir(), "full-text-index-"));
  try {
    const file = join(dir, "full-text.sqlite");
    assert.equal(isSqliteFile(file), false);
    const index = openFullTextIndex({ file });
    assert.equal(index.size, 0);
    index.revise(({ put }) => put("a.md", "r1", "cedar"));
    assert.deepEqual(openFullTextIndex({ file }).paths(), ["a.md"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
