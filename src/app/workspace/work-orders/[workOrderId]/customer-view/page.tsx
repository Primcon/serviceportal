import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { RepairView } from "@/features/customer/components/repair-view";
import { customerProgressStages, getWorkOrderAsCustomerSeesIt } from "@/features/work-orders/customer-queries";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

/**
 * Shows staff a repair exactly as its customer sees it, so they can check what's shared
 * before the customer does. It's built from the customer's own selection of data, so
 * internal notes, findings and files that aren't shared don't appear here either.
 */
export default async function CustomerViewPage({ params }: { params: Promise<{ workOrderId: string }> }) {
  await requireWorkspaceUser();
  const { workOrderId } = await params;
  const workOrder = await getWorkOrderAsCustomerSeesIt(workOrderId).catch(() => null);
  if (!workOrder) notFound();
  const [stages, viewers] = await Promise.all([
    customerProgressStages(),
    prisma.user.count({ where: { isActive: true, access: { some: { role: "CUSTOMER_USER", company: { workOrders: { some: { id: workOrder.id } } } } } } }),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <Link className="flex w-fit items-center gap-2 text-sm font-bold text-brand" href={`/workspace/work-orders/${workOrder.id}`}><ArrowLeft size={16} /> Back to the work order</Link>
      <p className="mt-5 flex flex-wrap items-center gap-2 border-l-4 border-ink bg-paper px-4 py-3 text-sm">
        <Eye size={16} />
        <span className="font-bold">Customer view.</span>
        This is what {workOrder.company.name} sees for this repair.
        <span className="text-muted">{viewers ? `${viewers} ${viewers === 1 ? "person" : "people"} from this customer can sign in.` : "Nobody from this customer can sign in yet."}</span>
      </p>
      <div className="mt-6"><RepairView preview stages={stages} workOrder={workOrder} /></div>
    </main>
  );
}
