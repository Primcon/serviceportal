import Link from "next/link";
import { ListKind } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/ui/page-header";
import { NewWorkOrderForm } from "@/features/work-orders/components/new-work-order-form";
import { productModelOptions } from "@/features/catalog/queries";
import { findPumps } from "@/features/work-orders/pump-search";
import { listOptions, serviceCenters, workOrderNumbering } from "@/features/settings/queries";
import { firstParam, type SearchParams } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

export default async function NewWorkOrderPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireWorkspaceUser();
  // Opened from a pump's page, the form starts with that pump chosen.
  const equipmentId = z.string().uuid().safeParse(firstParam((await searchParams).equipmentId)).data;
  const [companies, models, centers, priorities, serviceTypes, numbering, initialPumps] = await Promise.all([
    prisma.company.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, locations: { where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } } },
    }),
    productModelOptions(),
    serviceCenters(),
    listOptions(ListKind.PRIORITY),
    listOptions(ListKind.SERVICE_TYPE),
    workOrderNumbering(),
    equipmentId ? findPumps({ id: equipmentId, archivedAt: null }, 1) : [],
  ]);

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <Link className="flex w-fit items-center gap-2 text-sm font-bold text-brand" href="/workspace/work-orders"><ArrowLeft size={16} /> Work orders</Link>
      <div className="mt-5">
        <PageHeader description="Record a pump as it arrives: find it (or add it), then capture the job and intake details from the job order form." eyebrow="INTAKE" title="New work order" />
      </div>
      <div className="mt-6">
        <NewWorkOrderForm
          companies={companies}
          initialPump={initialPumps[0] ?? null}
          models={models}
          nextNumber={numbering.next}
          priorities={priorities}
          serviceCenters={centers}
          serviceTypes={serviceTypes}
        />
      </div>
    </main>
  );
}
