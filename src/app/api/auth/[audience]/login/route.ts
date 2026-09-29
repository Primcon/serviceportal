import { NextResponse } from "next/server";
import { createEntraAuthorization } from "@/services/entra-auth";
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
  const prompt = new URL(request.url).searchParams.get("prompt") === "select_account" ? "select_account" : undefined;
  try {
    return NextResponse.redirect(await createEntraAuthorization(audience, prompt));
  } catch {
    return NextResponse.json({ error: "Authentication is not configured" }, { status: 503 });
  }
}
