import { createTermIndex, words } from "@red-cup-engineering/semiotic-eavt-services-section/term-index";
import { importSqlFullTextIndex, isSqliteFile } from "./import-sql-full-text-index.mjs";

export { words };

/**
 * An archive's full text, held for ranked search: a term index over a semantic record journal
 * (semiotic-eavt `term-index`), ranked by BM25 (k1 1.2, b 0.75), with the revision each
 * document was indexed at. Words are letter-and-digit runs, folded to lower case, diacritics
 * kept. A query matches documents holding every one of its words, best first.
 *
 * `root` is the journal the index keeps between processes, so a reopened archive reindexes only
 * documents whose revision changed; without it the index lives for this process. `file` is the
 * earlier form, an SQLite index file: its journal is kept beside it (`<file>.journal`), and an
 * existing SQLite index is read into that journal once, the first time it opens empty, so
 * documents indexed before keep their revisions, when the caller passes `readLegacySqlite` (the
 * bounded historical reader; without it the file is left alone and the index rebuilds). Either way the index is a replaceable reading
 * of the archive's files, never a source of them: its owner tells it which revision each
 * document is at and gives it the text of those that moved.
 */
export function openFullTextIndex({ root, file, readLegacySqlite } = {}) {
  const journalRoot = root ?? (file && file !== ":memory:" ? `${file}.journal` : undefined);
  const index = createTermIndex({ root: journalRoot, objectKind: "markdown-vault.full-text" });
  if (file && file !== ":memory:" && index.size === 0 && readLegacySqlite && isSqliteFile(file)) {
    index.revise(({ put }) => { for (const row of importSqlFullTextIndex(file, readLegacySqlite)) put(row.path, row.revision, row.text); });
  }
  return Object.freeze({
    /** The revision `path` was indexed at, or undefined. */
    revisionOf: (path) => index.revisionOf(path),
    /** Every indexed path. */
    paths: () => index.keys(),
    /** Apply changes together: `change` receives `put(path, revision, text)` and `remove(path)`. */
    revise: (change) => index.revise(change),
    /** Documents holding every word of the query, best first by BM25. */
    search: (query, { limit = 25 } = {}) => index.search(query, { limit }).map((hit) => Object.freeze({ path: hit.key, score: hit.score })),
    get size() { return index.size; },
    /** The journal the index is kept in, or null when it lives for this process. */
    get root() { return index.root; },
    close() {},
  });
}
