import Link from "next/link";
import { Building2, UserCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { getCustomerAccount } from "@/features/work-orders/customer-queries";
import { getRequestActor } from "@/services/request-actor";

export const dynamic = "force-dynamic";

export default async function CustomerAccountPage() {
  const actor = await getRequestActor("customer");
  const account = actor ? await getCustomerAccount(actor.identitySubject) : null;
  if (!account) notFound();

  return (
    <main className="min-h-screen bg-[#ffffff] px-5 py-6 text-[#000000] sm:px-10">
      <div className="mx-auto max-w-3xl">
        <section className="border-b border-[#d9d9d9] py-10"><div className="flex items-center gap-2 text-sm font-bold tracking-[0.1em] text-[#b42318]"><UserCircle size={17} /> CUSTOMER ACCOUNT</div><h1 className="mt-2 text-4xl font-bold">Your account</h1><p className="mt-3 text-[#5a5a5a]">Review your profile and the company records available to you.</p></section>
        <section className="grid gap-8 py-8 sm:grid-cols-2"><div className="border border-[#d9d9d9] bg-[#ffffff] p-5"><h2 className="font-bold">Profile</h2><dl className="mt-4 grid gap-3 text-sm"><div><dt className="text-[#5a5a5a]">Name</dt><dd className="mt-1 font-bold">{account.displayName}</dd></div><div><dt className="text-[#5a5a5a]">Email</dt><dd className="mt-1 font-bold break-words">{account.email}</dd></div><div><dt className="text-[#5a5a5a]">Status</dt><dd className="mt-1 font-bold text-[#ea3435]">Active</dd></div></dl></div><div className="border border-[#d9d9d9] bg-[#ffffff] p-5"><div className="flex items-center gap-2"><Building2 size={18} className="text-[#ea3435]" /><h2 className="font-bold">Company access</h2></div>{account.access.length ? <div className="mt-4 grid gap-3">{account.access.map((grant) => <div className="border-t border-[#d9d9d9] pt-3 text-sm" key={`${grant.company.name}-${grant.location?.name ?? grant.scope}`}><p className="font-bold">{grant.company.name}</p><p className="mt-1 text-[#5a5a5a]">{grant.location?.name ?? "All company locations"}</p></div>)}</div> : <p className="mt-4 text-sm text-[#5a5a5a]">No company access has been assigned.</p>}</div></section>
        <div className="flex flex-wrap gap-3"><Link href="/portal/equipment" className="inline-flex border border-[#ea3435] px-4 py-2.5 text-sm font-bold text-[#ea3435] hover:bg-[#ea3435] hover:text-white">View equipment</Link><Link href="/portal/notifications" className="inline-flex border border-[#ea3435] px-4 py-2.5 text-sm font-bold text-[#ea3435] hover:bg-[#ea3435] hover:text-white">Manage notifications</Link></div>
      </div>
    </main>
  );
}