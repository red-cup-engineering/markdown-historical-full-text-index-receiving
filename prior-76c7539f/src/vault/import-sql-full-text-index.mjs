import { closeSync, openSync, readSync } from "node:fs";

const SQLITE_HEADER = "SQLite format 3\u0000";

/** Whether `file` is an SQLite database (its first sixteen bytes are the SQLite header). */
export function isSqliteFile(file) {
  let descriptor;
  try { descriptor = openSync(file, "r"); } catch { return false; }
  try {
    const header = Buffer.alloc(16);
    return readSync(descriptor, header, 0, 16, 0) === 16 && header.toString("latin1") === SQLITE_HEADER;
  } finally { closeSync(descriptor); }
}

/**
 * The documents an SQLite full-text index (layout 1: `documents (id, path, revision)` beside the
 * FTS5 table `texts (body)`) held, read once, read-only, so they can be admitted into the
 * journal the index now keeps. SQL survives here only as that admission path for old bytes;
 * a file of another layout holds nothing to admit (it was a stale cache the old index rebuilt).
 */
export function importSqlFullTextIndex(file) {
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (db.prepare("PRAGMA user_version").get().user_version !== 1) return [];
    return db.prepare("SELECT documents.path AS path, documents.revision AS revision, texts.body AS text FROM documents JOIN texts ON texts.rowid = documents.id ORDER BY documents.id")
      .all().map((row) => ({ path: row.path, revision: row.revision, text: row.text }));
  } finally { db.close(); }
}
