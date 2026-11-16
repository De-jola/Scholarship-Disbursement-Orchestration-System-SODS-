import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, parseRole, type Action, type Role } from "@/lib/permissions";

export const ROLE_COOKIE = "sdos_role";

export interface Session {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

export async function getSession(): Promise<Session | null> {
  const role = parseRole(cookies().get(ROLE_COOKIE)?.value);
  if (!role) return null;
  const user = await db.user.findFirst({ where: { role } });
  if (!user) return null;
  return { userId: user.id, name: user.name, email: user.email, role };
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

/** Throws if the signed-in role may not perform the action. Use in server actions. */
export async function requireCan(action: Action): Promise<Session> {
  const s = await requireSession();
  if (!can(s.role, action)) throw new Error("Your role is not permitted to perform this action.");
  return s;
}
