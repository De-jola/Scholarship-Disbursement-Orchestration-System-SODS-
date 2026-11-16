// Deletes the local SQLite demo database (and journal), then recreates the schema.
// Only ever touches the file named by DATABASE_URL (file: URLs only).
import { rmSync, existsSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
if (!url.startsWith("file:")) {
  console.error("db:reset only supports local SQLite file: URLs.");
  process.exit(1);
}
const rel = url.slice("file:".length);
const file = path.isAbsolute(rel) ? rel : path.resolve("prisma", rel);
for (const f of [file, `${file}-journal`]) if (existsSync(f)) rmSync(f);
execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
if (!process.argv.includes("--no-seed")) execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
