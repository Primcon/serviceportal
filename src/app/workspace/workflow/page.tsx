import { CustomerFacingStatus } from "@prisma/client";
import Link from "next/link";
import { CheckCircle2, CirclePause, Clock3, Search, SlidersHorizontal } from "lucide-react";
import WorkflowStageList from "@/components/workflow-stage-list";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceUser } from "@/services/page-access";
import { managerRoles } from "@/features/navigation/workspace-items";

export const dynamic = "force-dynamic";

const statusDetails = {
  OPEN: { label: "Open", icon: Clock3 },
  IN_PROGRESS: { label: "In progress", icon: SlidersHorizontal },
  WAITING: { label: "Waiting", icon: CirclePause },
  COMPLETED: { label: "Completed", icon: CheckCircle2 },
} as const;

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function WorkflowPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireWorkspaceUser(managerRoles);
  const params = await searchParams;
  const search = firstParam(params.search)?.trim() ?? "";
  const status = firstParam(params.status);
  const availability = firstParam(params.availability);
  const customerStatus = Object.values(CustomerFacingStatus).includes(status as CustomerFacingStatus) ? status as CustomerFacingStatus : undefined;
  const isActive = availability === "active" ? true : availability === "inactive" ? false : undefined;
  const [allStages, stages] = await Promise.all([
    prisma.serviceStage.findMany({ orderBy: { sequence: "asc" } }),
    prisma.serviceStage.findMany({
      where: {
        ...(customerStatus ? { customerFacingStatus: customerStatus } : {}),
        ...(isActive === undefined ? {} : { isActive }),
        ...(search ? { OR: [{ displayName: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }] } : {}),
      },
      orderBy: { sequence: "asc" },
    }),
  ]);
  const counts = new Map(Object.values(CustomerFacingStatus).map((item) => [item, allStages.filter((stage) => stage.customerFacingStatus === item).length]));
  const activeStages = allStages.filter((stage) => stage.isActive).length;
  const filtersApplied = Boolean(search || customerStatus || availability);
  const filterKey = `${search}:${customerStatus ?? ""}:${availability ?? ""}`;

  return <main className="min-h-screen bg-surface text-ink"><div className="mx-auto max-w-6xl px-5 py-8 sm:px-8"><div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-7"><div><p className="text-sm font-bold tracking-[0.1em] text-brand">ADMINISTRATION</p><h1 className="mt-2 text-3xl font-bold">Service workflow</h1><p className="mt-2 max-w-2xl text-muted">Review the repair path, customer-facing status mapping, and which stages are available to the service team.</p></div><div className="border-l-4 border-brand pl-4"><p className="text-2xl font-bold">{activeStages}</p><p className="text-sm text-muted">of {allStages.length} stages active</p></div></div><section aria-label="Customer status mapping" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.values(CustomerFacingStatus).map((item) => { const { label, icon: Icon } = statusDetails[item]; return <div className="border border-line bg-white p-5" key={item}><Icon className="text-brand" size={20} /><p className="mt-4 text-3xl font-bold">{counts.get(item) ?? 0}</p><p className="mt-1 text-sm font-bold">{label}</p><p className="mt-1 text-xs text-muted">workflow stage{(counts.get(item) ?? 0) === 1 ? "" : "s"} map here</p></div>; })}</section><section aria-label="Workflow filters" className="mt-8 border border-line bg-white p-5"><div className="flex items-center gap-2 text-sm font-bold text-body"><SlidersHorizontal className="text-brand" size={17} /> Find a workflow stage</div><form key={filterKey} method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="sr-only" htmlFor="workflow-search">Search workflow stages</label><div className="relative"><Search className="absolute left-3 top-3 text-muted" size={17} /><input className="w-full border border-line bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand" defaultValue={search} id="workflow-search" name="search" placeholder="Stage name or code" /></div><label className="sr-only" htmlFor="workflow-status">Customer-facing status</label><select className="border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-brand" defaultValue={customerStatus ?? ""} id="workflow-status" name="status"><option value="">All customer statuses</option>{Object.values(CustomerFacingStatus).map((item) => <option key={item} value={item}>{statusDetails[item].label}</option>)}</select><label className="sr-only" htmlFor="workflow-availability">Availability</label><select className="border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-brand" defaultValue={availability ?? ""} id="workflow-availability" name="availability"><option value="">All availability</option><option value="active">Active</option><option value="inactive">Inactive</option></select><div className="flex gap-2"><button className="flex-1 bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong">Apply filters</button>{filtersApplied && <Link className="border border-brand px-3 py-2.5 text-sm font-bold text-brand" href="/workspace/workflow">Reset</Link>}</div></form></section><section className="mt-6"><div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4"><div><h2 className="text-xl font-bold">Workflow stages</h2><p className="mt-1 text-sm text-muted">Stages appear in operational sequence. Edit a stage to change its customer status or availability.</p></div><p className="text-sm font-bold text-muted">{stages.length} result{stages.length === 1 ? "" : "s"}</p></div><div className="mt-5">{stages.length ? <WorkflowStageList stages={stages} /> : <div className="border border-dashed border-line bg-white px-5 py-14 text-center"><SlidersHorizontal className="mx-auto text-muted" size={24} /><p className="mt-4 font-bold">No workflow stages match these filters.</p><p className="mt-1 text-sm text-muted">Change or clear the filters to broaden the stage list.</p></div>}</div></section></div></main>;
}