import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const role = req.cookies.get("sdos_role")?.value;
  if (!role && !req.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|favicon.ico|.*\\..*).*)"] };
