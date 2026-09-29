import { NextResponse } from "next/server";
import { endSession } from "@/services/entra-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const applicationOrigin = process.env.APP_ORIGIN;
  if (!applicationOrigin) throw new Error("APP_ORIGIN is required.");
  const home = new URL("/", applicationOrigin);
  const entraSignOut = await endSession(home.toString());
  const response = NextResponse.redirect(entraSignOut ?? home, { status: 303 });
  response.cookies.delete("vactech_session");
  return response;
}
