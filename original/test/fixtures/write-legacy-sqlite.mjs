// Writes a legacy-format SQLite file for the read-once admission test with the standalone Python
// stdlib, as the importer reads it: no JS module of the node runtime opens a database. Each
// statement is an SQL script (a string) or [sql, ...parameters].
import { spawnSync } from "node:child_process";

const WRITER = [
  "import json, sqlite3, sys",
  "connection = sqlite3.connect(sys.argv[1])",
  "for statement in json.load(sys.stdin):",
  "    connection.executescript(statement) if isinstance(statement, str) else connection.execute(statement[0], statement[1:])",
  "connection.commit()",
  "connection.close()",
].join("\n");

export function writeLegacySqlite(file, statements) {
  const run = spawnSync(process.env.LEGACY_SQLITE_PYTHON || "python3", ["-I", "-c", WRITER, file], { input: JSON.stringify(statements), encoding: "utf8" });
  if (run.status !== 0) throw new Error(`writing the legacy fixture failed: ${run.error?.message ?? run.stderr}`);
}
