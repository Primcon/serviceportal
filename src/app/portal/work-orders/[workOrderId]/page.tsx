import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RepairView } from "@/features/customer/components/repair-view";
import { customerProgressStages, getCustomerWorkOrder } from "@/features/work-orders/customer-queries";
import { getRequestActor } from "@/services/request-actor";

export const dynamic = "force-dynamic";

export default async function CustomerWorkOrderPage({ params }: { params: Promise<{ workOrderId: string }> }) {
  const { workOrderId } = await params;
  const actor = await getRequestActor("customer");
  const workOrder = actor ? await getCustomerWorkOrder(actor.identitySubject, workOrderId).catch(() => null) : null;
  if (!workOrder) notFound();
  const stages = await customerProgressStages();

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <Link className="flex w-fit items-center gap-2 text-sm font-bold text-brand" href="/portal"><ArrowLeft size={16} /> My repairs</Link>
      <div className="mt-5"><RepairView stages={stages} workOrder={workOrder} /></div>
    </main>
  );
}
