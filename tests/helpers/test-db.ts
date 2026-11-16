import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { runSeed } from "../../prisma/seed-lib";

/** Creates a fresh, seeded SQLite database unique to a test file and points DATABASE_URL at it. */
export async function createSeededDb(name: string): Promise<PrismaClient> {
  const root = path.resolve(__dirname, "..", "..");
  const file = path.join(root, "prisma", `test-${name}.db`);
  rmSync(file, { force: true });
  process.env.DATABASE_URL = `file:${file.split(path.sep).join("/")}`;
  execSync("npx prisma db push --skip-generate", { cwd: root, env: process.env, stdio: "ignore" });
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  await runSeed(prisma);
  return prisma;
}
