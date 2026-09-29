import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonStyles } from "@/components/ui/styles";
import { roleLabels } from "@/lib/labels";
import { getWorkspaceViewer } from "@/services/page-access";

export const metadata = { title: "No access · VacTech Service Portal" };

export default async function NoAccessPage() {
  const viewer = await getWorkspaceViewer();

  return (
    <main className="mx-auto grid min-h-[70vh] max-w-2xl content-center px-5 py-12 sm:px-8">
      <div className="border-l-4 border-brand bg-paper p-8">
        <ShieldAlert className="text-brand" size={28} />
        <h1 className="mt-4 text-2xl font-bold">You don&apos;t have access to that page</h1>
        {viewer ? (
          <p className="mt-3 leading-7 text-muted">
            You&apos;re signed in as a <span className="font-bold text-ink">{roleLabels[viewer.internalRole]}</span>, and that page needs a different role. If you need it for your work, ask a portal administrator to change your role.
          </p>
        ) : (
          <p className="mt-3 leading-7 text-muted">
            Your account is inactive or doesn&apos;t have a portal role yet. Ask a portal administrator to activate your account and assign a role.
          </p>
        )}
        {viewer && <Link className={buttonStyles({ className: "mt-6" })} href="/workspace">Go to the overview</Link>}
      </div>
    </main>
  );
}
