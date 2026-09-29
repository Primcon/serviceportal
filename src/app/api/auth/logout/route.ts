import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const applicationOrigin = process.env.APP_ORIGIN;
  if (!applicationOrigin) throw new Error("APP_ORIGIN is required.");
  const response = NextResponse.redirect(new URL("/", applicationOrigin), { status: 303 });
  response.cookies.delete("vactech_session");
  return response;
}
