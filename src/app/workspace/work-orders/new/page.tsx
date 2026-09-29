import Link from "next/link";
import { ArrowLeft, ClipboardPlus } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { createWorkOrder } from "@/features/work-orders/actions";
import { prisma } from "@/lib/prisma";
import { getActiveInternalUser } from "@/services/authorization";

export const dynamic = "force-dynamic";

const fieldClass = "w-full border border-[#d9d9d9] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#ea3435]";

export default async function NewWorkOrderPage() {
  await getActiveInternalUser();
  const equipment = await prisma.equipment.findMany({
    orderBy: [{ company: { name: "asc" } }, { productModel: "asc" }, { serialNumber: "asc" }],
    select: { id: true, productModel: true, serialNumber: true, company: { select: { name: true } }, location: { select: { name: true } } },
  });

  return (
    <main className="min-h-screen bg-[#f6f6f6] text-[#000000]">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <Link className="flex w-fit items-center gap-2 text-sm font-bold text-[#ea3435]" href="/workspace/work-orders"><ArrowLeft size={16} /> Work orders</Link>
        <div className="mt-6 border-b border-[#d9d9d9] pb-7"><p className="text-sm font-bold tracking-[0.1em] text-[#ea3435]">OPERATIONS</p><h1 className="mt-2 text-3xl font-bold">New work order</h1><p className="mt-2 text-[#5a5a5a]">Select the equipment being serviced, then capture the repair reference and intake summary.</p></div>
        <section className="mt-6 border border-[#d9d9d9] bg-[#ffffff] p-5">
          <ActionFeedbackForm action={createWorkOrder} className="grid gap-4 sm:grid-cols-2" successMessage="Work order created.">
            <div className="sm:col-span-2"><label className="mb-1.5 block text-sm font-bold text-[#333333]" htmlFor="work-order-equipment">Equipment</label><select className={fieldClass} disabled={!equipment.length} id="work-order-equipment" name="equipmentId" required><option value="">Select equipment</option>{equipment.map((item) => <option key={item.id} value={item.id}>{item.company.name} · {item.productModel} · {item.serialNumber}{item.location && ` · ${item.location.name}`}</option>)}</select></div>
            <div><label className="mb-1.5 block text-sm font-bold text-[#333333]" htmlFor="work-order-number">Work order number</label><input className={fieldClass} id="work-order-number" name="workOrderNumber" required /></div>
            <div><label className="mb-1.5 block text-sm font-bold text-[#333333]" htmlFor="work-order-priority">Priority</label><input className={fieldClass} id="work-order-priority" name="priority" placeholder="Optional" /></div>
            <div className="sm:col-span-2"><label className="mb-1.5 block text-sm font-bold text-[#333333]" htmlFor="work-order-summary">Service summary</label><textarea className={fieldClass} id="work-order-summary" name="summary" required rows={4} /></div>
            <div><label className="mb-1.5 block text-sm font-bold text-[#333333]" htmlFor="work-order-service-type">Service type</label><input className={fieldClass} id="work-order-service-type" name="serviceType" placeholder="Optional" /></div>
            <div className="flex items-end"><button className="flex w-full items-center justify-center gap-2 bg-[#ea3435] px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40" disabled={!equipment.length}><ClipboardPlus size={16} /> Create work order</button></div>
          </ActionFeedbackForm>
        </section>
      </div>
    </main>
  );
}