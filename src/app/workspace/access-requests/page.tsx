import { UserRole } from "@prisma/client";
import { Inbox, X } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import AccessRequestApprovalForm from "@/components/access-request-approval-form";
import { rejectAccessRequest } from "@/features/access/actions";
import { prisma } from "@/lib/prisma";
import { getActiveInternalUserForRoles } from "@/services/authorization";

export const dynamic = "force-dynamic";

export default async function AccessRequestsPage() {
  await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
  const [requests, companies] = await Promise.all([
    prisma.accessRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    prisma.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return <main className="min-h-screen bg-[#f6f6f6] text-[#000000]"><div className="mx-auto max-w-6xl px-5 py-8 sm:px-8"><div className="border-b border-[#d9d9d9] pb-7"><p className="text-sm font-bold tracking-[0.1em] text-[#ea3435]">ADMINISTRATION</p><h1 className="mt-2 text-3xl font-bold">Access requests</h1><p className="mt-2 text-[#5a5a5a]">Review requests and deliberately assign authorized customer access.</p></div><section className="mt-6 border-y border-[#d9d9d9] bg-[#ffffff]">{requests.length ? requests.map((request) => <article className="grid gap-4 border-b border-[#d9d9d9] px-5 py-5 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_auto]" key={request.id}><div><p className="font-bold">{request.name}</p><p className="mt-1 text-sm text-[#5a5a5a]">{request.email} · Requested company: {request.requestedCompany}</p>{request.message && <p className="mt-3 max-w-2xl text-sm leading-6 text-[#333333]">{request.message}</p>}</div><div className="flex flex-wrap items-start gap-2"><AccessRequestApprovalForm companies={companies} email={request.email} requestId={request.id} /><ActionFeedbackForm action={rejectAccessRequest} successMessage="Request rejected."><input name="requestId" type="hidden" value={request.id} /><button className="flex items-center gap-2 border border-[#b42318] px-3 py-2.5 text-sm font-bold text-[#b42318]"><X size={16} /> Reject</button></ActionFeedbackForm></div></article>) : <div className="px-5 py-14 text-center"><Inbox className="mx-auto mb-3 text-[#5a5a5a]" size={24} /><p className="font-bold">No access requests are waiting.</p><p className="mt-1 text-sm text-[#5a5a5a]">New customer requests will appear here for review.</p></div>}</section></div></main>;
}