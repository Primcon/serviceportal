import Link from "next/link";
import { MailX } from "lucide-react";
import type { NotificationKind } from "@prisma/client";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { buttonStyles, eyebrowStyles, panelStyles } from "@/components/ui/styles";
import { unsubscribeFromEmails } from "@/features/customer/actions";
import { firstParam, type SearchParams } from "@/lib/pagination";
import { readUnsubscribeToken } from "@/services/unsubscribe";

export const dynamic = "force-dynamic";

const kindDescriptions: Partial<Record<NotificationKind, string>> = {
  SERVICE_UPDATE: "updates from your service team",
  STATUS_CHANGE: "repair status changes",
  DOCUMENT_SHARED: "new documents",
};

/**
 * Reached from the "stop emails like this one" link in an email. It asks before changing
 * anything, so a mail scanner that follows links can't unsubscribe someone by accident.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const token = firstParam((await searchParams).token) ?? "";
  const target = readUnsubscribeToken(token);
  const description = target ? kindDescriptions[target.kind] : undefined;

  return (
    <main className="min-h-screen bg-surface px-5 py-12 text-ink">
      <div className={`${panelStyles} mx-auto max-w-lg`}>
        <p className={`flex items-center gap-2 ${eyebrowStyles}`}><MailX size={16} /> EMAIL SETTINGS</p>
        {description ? (
          <>
            <h1 className="mt-2 text-2xl font-bold">Stop emails about {description}?</h1>
            <p className="mt-3 text-muted">You&apos;ll still see them in the portal under Notifications. You can turn the emails back on there at any time.</p>
            <ActionFeedbackForm action={unsubscribeFromEmails} className="mt-6 grid gap-3">
              <input name="token" type="hidden" value={token} />
              <button className={buttonStyles({ className: "w-fit" })}>Stop these emails</button>
            </ActionFeedbackForm>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-2xl font-bold">This link isn&apos;t valid any more</h1>
            <p className="mt-3 text-muted">Sign in to the portal to choose which emails you get.</p>
          </>
        )}
        <p className="mt-6 border-t border-line pt-4 text-sm"><Link className="font-bold text-brand" href="/portal/notifications">Sign in to manage all email settings</Link></p>
      </div>
    </main>
  );
}
