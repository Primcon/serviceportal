import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { createAccessRequest } from "@/features/access/actions";

const fieldClass = "w-full border border-[#d9d9d9] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#ea3435]";

export default function AccessRequestPage() {
  return (
    <main className="min-h-screen bg-[#ffffff] px-5 py-6 text-[#000000] sm:px-10">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between border-b border-[#d9d9d9] pb-5"><Link href="/" className="flex items-center gap-2 text-sm font-bold text-[#ea3435]"><ArrowLeft size={16} /> VacTech Service Portal</Link><span className="font-bold tracking-[0.1em] text-[#ea3435]">VACTECH</span></header>
        <section className="py-12"><p className="text-sm font-bold tracking-[0.1em] text-[#b42318]">CUSTOMER ACCESS</p><h1 className="mt-2 text-4xl font-bold">Request portal access.</h1><p className="mt-4 leading-7 text-[#5a5a5a]">Tell us who you are and which company you work with. A VacTech team member will review your request before access is granted.</p></section>
        <ActionFeedbackForm action={createAccessRequest} resetOnSuccess className="relative grid gap-4 border border-[#d9d9d9] bg-[#ffffff] p-6 sm:grid-cols-2" successMessage="Request submitted."><label className="grid gap-1.5 text-sm font-bold" htmlFor="firstName">First name<input className={fieldClass} id="firstName" name="firstName" required /></label><label className="grid gap-1.5 text-sm font-bold" htmlFor="lastName">Last name<input className={fieldClass} id="lastName" name="lastName" required /></label><label className="grid gap-1.5 text-sm font-bold sm:col-span-2" htmlFor="email">Work email<input className={fieldClass} id="email" name="email" type="email" required /></label><label className="grid gap-1.5 text-sm font-bold sm:col-span-2" htmlFor="requestedCompany">Company<input className={fieldClass} id="requestedCompany" name="requestedCompany" required /></label><label className="grid gap-1.5 text-sm font-bold sm:col-span-2" htmlFor="message">Message <span className="font-normal text-[#5a5a5a]">(optional)</span><textarea className={fieldClass} id="message" name="message" rows={4} /></label><div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden"><label htmlFor="website">Website</label><input autoComplete="off" id="website" name="website" tabIndex={-1} type="text" /></div><button className="flex items-center justify-center gap-2 bg-[#ea3435] px-4 py-3 text-sm font-bold text-white sm:col-span-2"><Send size={16} /> Submit access request</button></ActionFeedbackForm>
      </div>
    </main>
  );
}
