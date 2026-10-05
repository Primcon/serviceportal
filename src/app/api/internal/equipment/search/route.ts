import { NextResponse } from "next/server";
import { z } from "zod";
import { findPumps } from "@/features/work-orders/pump-search";
import { getActiveInternalUser } from "@/services/authorization";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();

/**
 * Finds pumps by serial, model or customer, for the new-work-order form and the merge dialog.
 *
 * ?companyId= limits the search to one customer and ?exclude= leaves one pump out. With
 * ?serial= and ?companyId= it instead returns the customer's pump with exactly that serial
 * number (archived or merged ones included), so a form can warn before adding it again.
 */
export async function GET(request: Request) {
  try {
    await getActiveInternalUser();
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parameters = new URL(request.url).searchParams;
  const query = parameters.get("q")?.trim() ?? "";
  const serial = parameters.get("serial")?.trim() ?? "";
  const companyId = uuid.safeParse(parameters.get("companyId")).data;
  const exclude = uuid.safeParse(parameters.get("exclude")).data;
  const exactSerial = Boolean(serial && companyId);
  if (!exactSerial && query.length < 2) return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });

  const contains = { contains: query, mode: "insensitive" as const };
  const results = await findPumps(exactSerial
    ? { companyId, serialNumber: { equals: serial, mode: "insensitive" } }
    : {
      archivedAt: null,
      ...(companyId ? { companyId } : {}),
      ...(exclude ? { id: { not: exclude } } : {}),
      OR: [{ serialNumber: contains }, { productModel: contains }, { company: { name: contains } }],
    });
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
