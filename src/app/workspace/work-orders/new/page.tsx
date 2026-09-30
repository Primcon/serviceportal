import Link from "next/link";
import { ListKind } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { NewWorkOrderForm } from "@/features/work-orders/components/new-work-order-form";
import { modelDisplayName } from "@/features/work-orders/intake";
import { listOptions, serviceCenters, workOrderNumbering } from "@/features/settings/queries";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

export default async function NewWorkOrderPage() {
  await requireWorkspaceUser();
  const [companies, models, centers, priorities, serviceTypes, numbering] = await Promise.all([
    prisma.company.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, locations: { where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } } },
    }),
    prisma.productModel.findMany({ where: { isActive: true }, orderBy: [{ manufacturer: "asc" }, { name: "asc" }], select: { id: true, manufacturer: true, name: true } }),
    serviceCenters(),
    listOptions(ListKind.PRIORITY),
    listOptions(ListKind.SERVICE_TYPE),
    workOrderNumbering(),
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
          models={models.map((model) => ({ id: model.id, label: modelDisplayName(model.manufacturer, model.name) }))}
          nextNumber={numbering.next}
          priorities={priorities}
          serviceCenters={centers}
          serviceTypes={serviceTypes}
        />
      </div>
    </main>
  );
}
