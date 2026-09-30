import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveInternalUser } from "@/services/authorization";

export const dynamic = "force-dynamic";

/**
 * Finds pumps for the new-work-order form by serial, model or customer. Each result includes
 * any open work order (to warn about duplicates) and the intake details from its last
 * repair, so the form can offer them again.
 */
export async function GET(request: Request) {
  try {
    await getActiveInternalUser();
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });

  const contains = { contains: query, mode: "insensitive" as const };
  const equipment = await prisma.equipment.findMany({
    where: { archivedAt: null, OR: [{ serialNumber: contains }, { productModel: contains }, { company: { name: contains } }] },
    orderBy: [{ updatedAt: "desc" }],
    take: 10,
    select: {
      id: true,
      productModel: true,
      serialNumber: true,
      company: { select: { id: true, name: true } },
      location: { select: { name: true } },
      workOrders: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          workOrderNumber: true,
          completedAt: true,
          condition: true,
          toolId: true,
          oilType: true,
          contaminants: true,
          copperClassification: true,
          customerContactName: true,
          customerContactPhone: true,
          customerContactEmail: true,
        },
      },
    },
  });

  const results = equipment.map((item) => {
    const last = item.workOrders[0];
    const isOpen = last && !last.completedAt && last.condition !== "CANCELLED";
    return {
      id: item.id,
      productModel: item.productModel,
      serialNumber: item.serialNumber,
      companyName: item.company.name,
      locationName: item.location?.name ?? null,
      openWorkOrder: isOpen ? { id: last.id, workOrderNumber: last.workOrderNumber } : null,
      lastIntake: last ? {
        toolId: last.toolId,
        oilType: last.oilType,
        contaminants: last.contaminants,
        copperClassification: last.copperClassification,
        customerContactName: last.customerContactName,
        customerContactPhone: last.customerContactPhone,
        customerContactEmail: last.customerContactEmail,
      } : null,
    };
  });
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
