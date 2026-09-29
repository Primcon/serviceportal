"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function PortalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <div className="border-l-4 border-danger bg-danger-soft p-6">
          <div className="flex items-start gap-4">
            <AlertCircle className="mt-1 shrink-0 text-danger" size={20} />
            <div className="flex-1">
              <h1 className="text-lg font-bold text-danger">Something went wrong</h1>
              <p className="mt-2 text-sm text-muted">
                We encountered an error loading this page. Please try again or contact support if the problem persists.
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={reset}
                  className="bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-strong"
                >
                  Try again
                </button>
                <Link
                  href="/portal"
                  className="border border-brand px-4 py-2 text-sm font-bold text-brand hover:bg-brand-soft"
                >
                  Back to portal
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
