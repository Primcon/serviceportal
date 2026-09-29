import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Building2, ClipboardCheck, ShieldCheck } from "lucide-react";

export default function AccessPendingPage() {
  return (
    <main className="min-h-screen bg-[#f6f6f6] text-[#000000]">
      <header className="border-b border-[#d9d9d9] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-5 px-5 py-4 sm:px-8">
          <Link aria-label="VacTech Service Portal home" href="/"><Image alt="Pfeiffer Vacuum, part of the Busch Group" className="h-10 w-auto" height={131} priority src="/pfeiffer-vacuum-logo.png" width={320} /></Link>
          <span className="text-xs font-bold tracking-[0.1em] text-[#5a5a5a] sm:text-sm">CUSTOMER ACCESS</span>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100vh-73px)] max-w-6xl items-center px-5 py-12 sm:px-8">
        <section className="grid gap-8 border-y border-[#d9d9d9] py-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.75fr)] lg:items-end">
          <div>
            <div className="grid size-12 place-items-center bg-[#ea3435] text-white"><ClipboardCheck size={23} /></div>
            <p className="mt-7 text-sm font-bold tracking-[0.1em] text-[#ea3435]">ACCESS REVIEW</p>
            <h1 className="mt-3 max-w-2xl text-4xl font-bold leading-[1.08] sm:text-5xl">Your account is ready. Portal access is still being assigned.</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#5a5a5a]">A VacTech service team member needs to connect your account to your company before service records can be shown.</p>
          </div>

          <div className="border-l-4 border-[#ea3435] bg-white p-6">
            <div className="flex gap-3"><Building2 className="mt-0.5 shrink-0 text-[#ea3435]" size={19} /><div><h2 className="font-bold">What happens next</h2><p className="mt-2 text-sm leading-6 text-[#5a5a5a]">Once your request is approved, sign in again to view the equipment and repairs assigned to your organization.</p></div></div>
            <div className="mt-5 flex gap-3 border-t border-[#d9d9d9] pt-5"><ShieldCheck className="mt-0.5 shrink-0 text-[#ea3435]" size={19} /><p className="text-sm leading-6 text-[#5a5a5a]">Access is limited to records your company has authorized.</p></div>
          </div>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="inline-flex items-center gap-2 bg-[#ea3435] px-4 py-3 text-sm font-bold text-white hover:bg-[#c72028]" href="/access-request">Request customer access <ArrowRight size={17} /></Link>
          <Link className="inline-flex items-center gap-2 border border-[#000000] px-4 py-3 text-sm font-bold hover:border-[#ea3435] hover:text-[#ea3435]" href="/api/auth/customer/login?prompt=select_account">Use another account <ArrowRight size={17} /></Link>
        </div>
      </div>
    </main>
  );
}