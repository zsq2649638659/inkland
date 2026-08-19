import { NextResponse, type NextRequest } from "next/server";

// The admin app performs its auth check in the server page. This local no-op
// middleware prevents Next from walking up to the frontend middleware when the
// app is built from the monorepo's admin-app root.
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
