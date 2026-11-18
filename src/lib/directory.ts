import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { paginate } from "@/lib/pagination";
import type { Session } from "@/lib/session";

export interface DirectoryFilters {
  q?: string;
  state?: string;
  page?: number;
  pageSize?: number;
  /** Federal / State / Private. The category is stored on the record as ownership. */
  category?: string;
}

/** Institutions that are in the national register but not (yet) programme partners. */
export async function listDirectory(f: DirectoryFilters) {
  const where: Prisma.UniversityWhereInput = { status: "INACTIVE" };
  if (f.q?.trim()) where.name = { contains: f.q.trim() };
  if (f.state) where.state = f.state;
  if (f.category) where.category = f.category;

  const total = await db.university.count({ where });
  const pagination = paginate(total, f.page ?? 1, f.pageSize ?? 25);
  const rows = await db.university.findMany({ where, orderBy: { name: "asc" }, skip: pagination.skip, take: pagination.take });
  return { rows, pagination };
}

export async function directoryStates(): Promise<string[]> {
  const rows = await db.university.findMany({ where: { status: "INACTIVE" }, select: { state: true }, distinct: ["state"], orderBy: { state: "asc" } });
  return rows.map((r) => r.state);
}

export async function activatePartner(actor: Pick<Session, "name" | "role">, universityId: string) {
  const u = await db.university.findUniqueOrThrow({ where: { id: universityId } });
  if (u.status === "ACTIVE") throw new Error(`${u.name} is already a programme partner.`);
  await db.university.update({ where: { id: universityId }, data: { status: "ACTIVE" } });
  await logAudit(actor, "UNIVERSITY_ACTIVATED", "University",
    `Added ${u.name} as a programme partner. An academic calendar must be uploaded and approved before payments can be batched.`,
    { entityId: u.id, universityId: u.id });
}
