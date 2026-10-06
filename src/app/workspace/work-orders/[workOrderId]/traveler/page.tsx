import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { getWorkOrderChecklist, initials } from "@/features/checklists/checklist";
import { PrintButton } from "@/features/traveler/print-button";
import { qrCodeDataUri, workOrderAddress } from "@/features/traveler/qr";
import { copperClassificationLabels, isElevatedPriority, partsKitLabels } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceUser } from "@/services/page-access";
import { shopTimeZone } from "@/lib/dates";

export const dynamic = "force-dynamic";

const calendarDate = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" });
const signedDate = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", timeZone: shopTimeZone });
const printedAt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: shopTimeZone });

const cell = "border border-neutral-400 px-1.5 py-[3px] align-top";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[8px] uppercase tracking-[0.08em] text-neutral-500">{label}</dt>
      <dd className="break-words font-mono text-[11px] font-semibold">{children || <span className="font-normal text-neutral-400">—</span>}</dd>
    </div>
  );
}

/**
 * The printable traveler: every field and step of the job order form, sized to fit one
 * letter page for a typical job. Steps signed in the portal print filled in; the rest are left blank to initial by hand.
 */
export default async function TravelerPage({ params }: { params: Promise<{ workOrderId: string }> }) {
  await requireWorkspaceUser();
  const { workOrderId } = await params;
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: {
      company: { select: { name: true } },
      location: { select: { name: true } },
      equipment: { select: { productModel: true, serialNumber: true } },
      serviceCenter: { select: { code: true, name: true } },
      serviceStage: { select: { displayName: true } },
      partsReceivedBy: { select: { displayName: true } },
    },
  }).catch(() => null);
  if (!workOrder) notFound();

  // A job opened before checklists existed prints the current checklist, blank, to be signed by hand.
  const templateId = workOrder.checklistTemplateId ?? (await prisma.checklistTemplate.findFirst({ where: { isActive: true }, select: { id: true } }))?.id ?? null;
  const [checklist, qrCode, partsStage] = await Promise.all([
    getWorkOrderChecklist(workOrder.id, templateId),
    qrCodeDataUri(workOrderAddress(workOrder.id)),
    prisma.serviceStage.findUnique({ where: { code: "REPAIR_AUTHORIZED" }, select: { sequence: true } }),
  ]);

  const groups: { stageName: string; sequence: number; steps: NonNullable<typeof checklist>["steps"] }[] = [];
  for (const step of checklist?.steps ?? []) {
    const group = groups.at(-1)?.stageName === step.serviceStage.displayName ? groups.at(-1)! : groups[groups.push({ stageName: step.serviceStage.displayName, sequence: step.serviceStage.sequence, steps: [] }) - 1];
    group.steps.push(step);
  }
  // The parts and quote lines sit where the paper form has them: after teardown, before the rebuild.
  const partsIndex = partsStage ? groups.findIndex((group) => group.sequence >= partsStage.sequence) : -1;
  const partsPosition = partsIndex === -1 ? groups.length : partsIndex;

  const warning = [
    workOrder.warrantyDecision && `Warranty claim (${workOrder.warrantyDecision.toLowerCase()})`,
    workOrder.copperClassification !== "UNKNOWN" && copperClassificationLabels[workOrder.copperClassification].toUpperCase(),
    workOrder.contaminants && `Contaminants: ${workOrder.contaminants}`,
    workOrder.reasonForService && `Reason: ${workOrder.reasonForService}`,
  ].filter(Boolean).join(" · ");
  const contact = [workOrder.customerContactName, workOrder.customerContactPhone, workOrder.customerContactEmail].filter(Boolean).join(" · ");
  const blank = " ";

  const partsRows = (
    <>
      <tr><td className={`${cell} bg-neutral-200 text-[8px] font-bold uppercase tracking-[0.1em]`} colSpan={4}>Parts and quote</td></tr>
      <tr>
        <td className={cell} colSpan={4}>
          <span className="font-semibold">Parts required:</span> {workOrder.partsRequired ? workOrder.partsRequired.split(/\r?\n/).filter(Boolean).join("; ") : "______________________________"}
          {" · "}{(["MINOR", "MAJOR"] as const).map((kit) => <span className="mr-2" key={kit}>{workOrder.partsKit === kit ? "☑" : "☐"} {partsKitLabels[kit]}</span>)}
          · Extra labor hrs: <span className="font-mono font-semibold">{workOrder.extraLaborHours?.toString() ?? "____"}</span>
        </td>
      </tr>
      <tr>
        <td className={cell} colSpan={2}>Date customer quoted: <span className="font-mono font-semibold">{workOrder.quotedAt ? calendarDate.format(workOrder.quotedAt) : "__________"}</span></td>
        <td className={cell} colSpan={2}>Date parts ordered: <span className="font-mono font-semibold">{workOrder.partsOrderedAt ? calendarDate.format(workOrder.partsOrderedAt) : "__________"}</span></td>
      </tr>
      <tr>
        <td className={cell}>Parts received and inspected</td>
        <td className={`${cell} text-center font-mono font-semibold`}>{workOrder.partsReceivedBy ? initials(workOrder.partsReceivedBy.displayName) : blank}</td>
        <td className={`${cell} text-center font-mono font-semibold`}>{workOrder.partsReceivedAt ? calendarDate.format(workOrder.partsReceivedAt).slice(0, 5) : blank}</td>
        <td className={cell}>{blank}</td>
      </tr>
    </>
  );

  return (
    <main className="px-5 py-8 sm:px-8 print:p-0">
      <div className="mx-auto mb-5 flex max-w-[8.5in] flex-wrap items-center justify-between gap-3 print:hidden">
        <Link className="flex items-center gap-2 text-sm font-bold text-brand" href={`/workspace/work-orders/${workOrder.id}`}><ArrowLeft size={16} /> {workOrder.workOrderNumber}</Link>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted">Letter size. Steps signed in the portal print filled in.</p>
          <PrintButton />
        </div>
      </div>

      <article className="mx-auto max-w-[8.5in] border border-line bg-white p-[0.4in] text-[10px] leading-snug text-black shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-1.5">
          <div className="min-w-0">
            <h1 className="font-display text-[14px] font-black uppercase tracking-[0.04em]">{checklist?.name ?? "Vacuum Pump Repair Job Order / Inspection Form"}</h1>
            <p className="mt-0.5 font-mono text-[18px] font-bold">WIP {workOrder.workOrderNumber}</p>
            <p className="mt-0.5 text-neutral-600">Internal · {workOrder.serviceStage.displayName} · printed {printedAt.format(new Date())}{isElevatedPriority(workOrder.priority) && <span className="ml-2 border border-black px-1 font-bold uppercase text-black">{workOrder.priority}</span>}</p>
          </div>
          <div className="shrink-0 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URI; the image optimizer adds nothing */}
            <img alt="QR code that opens this work order in the portal" className="size-[0.72in]" src={qrCode} />
            <p className="mt-0.5 text-[7px] uppercase tracking-[0.08em] text-neutral-500">Scan to open</p>
          </div>
        </header>

        {warning && <p className="mt-2 border-2 border-black px-2 py-1 text-[11px] font-bold uppercase tracking-[0.04em]">{warning}</p>}

        <dl className="mt-1.5 grid grid-cols-3 gap-x-4 gap-y-1 border-b border-neutral-400 pb-1.5">
          <Detail label="Received">{workOrder.receivedAt && calendarDate.format(workOrder.receivedAt)}</Detail>
          <Detail label="Company">{workOrder.company.name}{workOrder.location && ` · ${workOrder.location.name}`}</Detail>
          <Detail label="PO# / RMA#">{[workOrder.customerPurchaseOrder ?? "—", workOrder.rmaReference ?? "—"].join(" / ")}</Detail>
          <Detail label="Product serviced / model#">{workOrder.equipment.productModel}</Detail>
          <Detail label="Serial#">{workOrder.equipment.serialNumber}</Detail>
          <Detail label="Tool ID">{workOrder.toolId}</Detail>
          <Detail label="Oil type / weight">{(workOrder.oilType || workOrder.oilWeight) && [workOrder.oilType ?? "—", workOrder.oilWeight ?? "—"].join(" / ")}</Detail>
          <Detail label="Accessories">{workOrder.accessoriesReceived}</Detail>
          <Detail label="Promised">{workOrder.promisedAt && calendarDate.format(workOrder.promisedAt)}</Detail>
          <div className="col-span-2"><Detail label="Customer contact">{contact}</Detail></div>
          <Detail label="Service type">{workOrder.serviceType}</Detail>
          <div className="col-span-3"><Detail label="Work requested">{workOrder.summary}</Detail></div>
        </dl>

        <table className="mt-2 w-full border-collapse">
          <thead>
            <tr className="bg-neutral-100 text-left text-[8px] uppercase tracking-[0.08em]">
              <th className={cell}>Step</th>
              <th className={`${cell} w-[0.55in] text-center`}>By</th>
              <th className={`${cell} w-[0.6in] text-center`}>Date</th>
              <th className={`${cell} w-[38%]`}>Reading / notes</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, index) => (
              <FragmentRows key={group.stageName} before={index === partsPosition ? partsRows : null}>
                <tr><td className={`${cell} bg-neutral-200 text-[8px] font-bold uppercase tracking-[0.1em]`} colSpan={4}>{group.stageName}</td></tr>
                {group.steps.map((step) => {
                  const record = step.record;
                  const shade = step.requiresQa ? "bg-neutral-100" : "";
                  return (
                    <tr key={step.id}>
                      <td className={`${cell} ${shade}`}>
                        {step.label}{step.requiresQa && <span className="ml-1.5 border border-black px-0.5 text-[7px] font-bold">QA</span>}
                        {step.type === "CHECKLIST" && (
                          <span className="mt-0.5 block text-neutral-700">
                            {step.items.map((item) => <span className="mr-2 inline-block" key={item}>{record?.checkedItems.includes(item) ? "☑" : record?.notApplicableItems.includes(item) ? "N/A" : "☐"} {item}</span>)}
                          </span>
                        )}
                      </td>
                      <td className={`${cell} ${shade} text-center font-mono text-[11px] font-semibold`}>{record ? initials(record.performedBy.displayName) : blank}</td>
                      <td className={`${cell} ${shade} text-center font-mono font-semibold`}>{record ? signedDate.format(record.performedAt) : blank}</td>
                      <td className={`${cell} ${shade}`}>
                        {record?.notApplicable && <span className="font-semibold">Not applicable. </span>}
                        {step.type === "READING" && !record?.notApplicable && <span className="font-mono font-semibold">{record?.reading ?? "__________"} {step.unit}</span>}
                        {record?.note && <span> {record.note}</span>}
                      </td>
                    </tr>
                  );
                })}
              </FragmentRows>
            ))}
            {partsPosition === groups.length && partsRows}
          </tbody>
        </table>

        {!checklist && <p className="mt-2 text-neutral-600">No checklist has been set up in the portal yet.</p>}

        <div className="mt-2 border border-neutral-400 px-1.5 pb-7 pt-1"><span className="text-[8px] uppercase tracking-[0.08em] text-neutral-500">Additional comments</span></div>

        <footer className="mt-2 flex flex-wrap justify-between gap-2 text-[8px] text-neutral-600">
          <span>Initials and dates shown were signed in the portal. Blank steps are initialed by hand; scan the signed form back into the work order.</span>
          <span className="font-semibold text-black">{checklist ? `Form ${checklist.formNumber} Rev. ${checklist.revision}` : ""}</span>
        </footer>
      </article>
    </main>
  );
}

/** A group of table rows, with optional rows placed before it. */
function FragmentRows({ before, children }: { before: ReactNode; children: ReactNode }) {
  return <>{before}{children}</>;
}
