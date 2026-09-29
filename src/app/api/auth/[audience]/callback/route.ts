import { NextResponse } from "next/server";
import { CustomerAccessNotApprovedError, exchangeEntraCode } from "@/services/entra-auth";
import type { EntraAudience } from "@/services/entra-config";

export const dynamic = "force-dynamic";

function audienceValue(value: string) {
  if (value === "customer" || value === "employee") return value satisfies EntraAudience;
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ audience: string }> },
) {
  const audience = audienceValue((await params).audience);
  if (!audience) return NextResponse.json({ error: "Unknown authentication audience" }, { status: 404 });
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return NextResponse.json({ error: "Missing authentication response" }, { status: 400 });
  const applicationOrigin = process.env.APP_ORIGIN;
  if (!applicationOrigin) throw new Error("APP_ORIGIN is required.");

  try {
    await exchangeEntraCode(audience, code, state);
    return NextResponse.redirect(new URL(audience === "customer" ? "/portal" : "/workspace", applicationOrigin));
  } catch (error) {
    console.error(`Entra ${audience} callback failed:`, error instanceof Error ? error.message : "Unknown error");
    if (audience === "customer" && error instanceof CustomerAccessNotApprovedError) {
      return NextResponse.redirect(new URL("/access-pending", applicationOrigin));
    }
    return NextResponse.json({ error: "Authentication could not be completed" }, { status: 401 });
  }
}
