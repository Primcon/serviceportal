"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function WorkspaceError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-[#f6f6f6] text-[#000000]">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="border-l-4 border-[#b42318] bg-[#fff4f4] p-6">
          <div className="flex items-start gap-4">
            <AlertCircle className="mt-1 shrink-0 text-[#b42318]" size={20} />
            <div className="flex-1">
              <h1 className="text-lg font-bold text-[#b42318]">Something went wrong</h1>
              <p className="mt-2 text-sm text-[#5a5a5a]">
                We encountered an error loading this page. Please try again or contact support if the problem persists.
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={reset}
                  className="bg-[#ea3435] px-4 py-2 text-sm font-bold text-white hover:bg-[#c72028]"
                >
                  Try again
                </button>
                <Link
                  href="/workspace"
                  className="border border-[#ea3435] px-4 py-2 text-sm font-bold text-[#ea3435] hover:bg-[#fde5e5]"
                >
                  Back to workspace
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
