import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ClipboardList, FileSearch, Package, ShieldCheck, Wrench } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-surface text-ink">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 sm:px-8">
          <Image alt="Pfeiffer Vacuum, part of the Busch Group" className="h-10 w-auto" height={131} priority src="/pfeiffer-vacuum-logo.png" width={320} />
          <span className="border-l border-line pl-4 text-xs font-bold tracking-[0.1em] text-muted sm:text-sm">SERVICE PORTAL</span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-16">
        <section className="grid gap-10 border-b border-line pb-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] lg:items-end">
          <div className="max-w-3xl">
            <p className="text-sm font-bold tracking-[0.1em] text-brand">EQUIPMENT SERVICE RECORDS</p>
            <h1 className="mt-4 text-4xl font-bold leading-[1.08] sm:text-5xl">Every repair, visible from intake through return.</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">A shared record for service teams and the customers who rely on their equipment. Find the right workspace to continue.</p>
          </div>
          <div className="border-l-4 border-brand bg-white p-5">
            <p className="text-sm font-bold">Need access to a service record?</p>
            <p className="mt-2 text-sm leading-6 text-muted">Customer access is granted by your VacTech service contact after a request is reviewed.</p>
            <Link className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-brand hover:text-brand-strong" href="/access-request">Request customer access <ArrowRight size={16} /></Link>
          </div>
        </section>

        <section aria-label="Choose a portal" className="mt-8 grid gap-4 lg:grid-cols-2">
          <article className="flex flex-col border border-ink bg-ink p-6 text-white sm:p-8">
            <div className="flex items-start justify-between gap-5"><div className="grid size-11 place-items-center border border-white/30"><Wrench size={21} /></div><span className="text-xs font-bold tracking-[0.1em] text-white/65">FOR SERVICE TEAMS</span></div>
            <h2 className="mt-12 text-2xl font-bold">VacTech service workspace</h2>
            <p className="mt-3 max-w-md leading-7 text-white/75">Manage customer records, equipment, repair intake, service stages, evidence, and updates in one operational view.</p>
            <Link className="group mt-auto flex h-12 items-center justify-between border border-white bg-white px-4 text-sm font-bold text-black transition hover:border-brand hover:bg-brand hover:text-white" href="/api/auth/employee/login?prompt=select_account"><span>Employee sign in</span><ArrowRight size={18} className="transition-transform group-hover:translate-x-1" /></Link>
          </article>

          <article className="flex flex-col border border-line bg-white p-6 sm:p-8">
            <div className="flex items-start justify-between gap-5"><div className="grid size-11 place-items-center border border-line text-brand"><ClipboardList size={21} /></div><span className="text-xs font-bold tracking-[0.1em] text-muted">FOR CUSTOMERS</span></div>
            <h2 className="mt-12 text-2xl font-bold">Customer repair portal</h2>
            <p className="mt-3 max-w-md leading-7 text-muted">Track repair status, review service updates, and view the equipment records your organization has authorized.</p>
            <Link className="group mt-auto flex h-12 items-center justify-between bg-brand px-4 text-sm font-bold text-white transition hover:bg-brand-strong" href="/api/auth/customer/login?prompt=select_account"><span>Customer sign in</span><ArrowRight size={18} className="transition-transform group-hover:translate-x-1" /></Link>
          </article>
        </section>

        <section aria-label="Portal capabilities" className="mt-8 grid gap-4 border-y border-line py-6 sm:grid-cols-3">
          <div className="flex gap-3"><Package className="mt-0.5 shrink-0 text-brand" size={19} /><div><h2 className="text-sm font-bold">Equipment context</h2><p className="mt-1 text-sm leading-6 text-muted">Model and serial history stay connected to each repair.</p></div></div>
          <div className="flex gap-3"><FileSearch className="mt-0.5 shrink-0 text-brand" size={19} /><div><h2 className="text-sm font-bold">Clear service progress</h2><p className="mt-1 text-sm leading-6 text-muted">Customer-facing updates make the next step easy to find.</p></div></div>
          <div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-brand" size={19} /><div><h2 className="text-sm font-bold">Authorized access</h2><p className="mt-1 text-sm leading-6 text-muted">Records are available only to approved users and companies.</p></div></div>
        </section>
      </div>
    </main>
  );
}
