import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
export function migrate(
  db: DatabaseSync,
  root: string,
  directory = resolve("apps/api/src/db/migrations"),
) {
  db.exec("CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY)");
  const current = Number(
    db
      .prepare("SELECT COALESCE(MAX(version),0) AS version FROM migrations")
      .get()!.version,
  );
  const files = readdirSync(directory)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  const pending = files.filter((f) => Number(f.split("_")[0]) > current);
  if (!pending.length) return;
  if (current > 0) {
    mkdirSync(join(root, "backups"), { recursive: true });
    const backup = resolve(
      root,
      "backups",
      `before-schema-${current + 1}-${Date.now()}.sqlite`,
    ).replaceAll("'", "''");
    db.exec(`VACUUM INTO '${backup}'`);
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const file of pending) {
      db.exec(readFileSync(join(directory, file), "utf8"));
      db.prepare("INSERT INTO migrations VALUES(?)").run(
        Number(file.split("_")[0]),
      );
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
