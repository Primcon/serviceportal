"use client";

import { Check } from "lucide-react";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { approveAccessRequest } from "@/features/access/actions";
import { fieldStyles } from "@/components/ui/styles";

type Company = { id: string; name: string };

export default function AccessRequestApprovalForm({ requestId, email, companies }: { requestId: string; email: string; companies: Company[] }) {
  return <ActionFeedbackForm action={approveAccessRequest} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:w-80" feedbackClassName="col-span-2" successMessage="Request approved." validate={(formData) => formData.get("companyId")?.toString().trim() ? undefined : { message: "Select a company before approving access.", fieldErrors: { companyId: "Select a company before approving access." } }}><input name="requestId" type="hidden" value={requestId} /><label className="sr-only" htmlFor={`company-${requestId}`}>Assign company for {email}</label><select className={fieldStyles} id={`company-${requestId}`} name="companyId"><option value="">Assign company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select><button className="flex items-center gap-2 bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong"><Check size={16} /> Approve</button></ActionFeedbackForm>;
}