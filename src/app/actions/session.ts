"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { parseRole } from "@/lib/permissions";
import { CLOCK_COOKIE, CLOCK_PRESETS } from "@/lib/clock";
import { ROLE_COOKIE } from "@/lib/session";

export async function signIn(formData: FormData) {
  const role = parseRole(String(formData.get("role") ?? ""));
  if (!role) redirect("/login");
  cookies().set(ROLE_COOKIE, role, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/");
}

export async function signOut() {
  cookies().delete(ROLE_COOKIE);
  redirect("/login");
}

export async function setClock(formData: FormData) {
  const v = String(formData.get("clock") ?? "");
  if (CLOCK_PRESETS.some((p) => p.value === v)) {
    cookies().set(CLOCK_COOKIE, v, { path: "/", sameSite: "lax" });
  }
  revalidatePath("/", "layout");
}
