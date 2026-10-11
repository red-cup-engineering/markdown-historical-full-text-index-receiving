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
 * FTS5 table `texts (body)`, a document's text at the rowid of its id) held, read once, read-only,
 * so they can be admitted into the journal the index now keeps. No database is opened here: the
 * file is received by a standalone, bounded reader the caller passes in (computer-system-engine
 * keeps its historical SQL reader as private source outside its export surface, so this package
 * does not import it). SQL survives only as that admission path for old bytes; a file of another layout holds nothing to admit (it
 * was a stale cache the old index rebuilt).
 */
export function importSqlFullTextIndex(file, readLegacySqlite) {
  return readLegacySqlite(file, [{ table: "documents", order: "id" }, { table: "texts", order: "rowid", rowid: true }], (legacy) => {
    if (!legacy.has("documents") || !legacy.has("texts")) return [];
    const documents = [];
    for (const row of legacy.rows("documents")) {
      if (typeof row.id !== "number" || typeof row.path !== "string" || typeof row.revision !== "string") return [];
      documents.push(row);
    }
    const texts = new Map();
    for (const row of legacy.rows("texts")) {
      if (typeof row.body !== "string") return [];
      texts.set(row.rowid, row.body);
    }
    return documents.filter((row) => texts.has(row.id)).map((row) => ({ path: row.path, revision: row.revision, text: texts.get(row.id) }));
  });
}
