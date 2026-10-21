"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight } from "lucide-react";

type Match = { id: string; productModel: string; serialNumber: string; companyName: string };

/** Asks the server whether another customer already has a pump with this serial number. */
function useSerialElsewhere(companyId: string, serialNumber: string) {
  const [matches, setMatches] = useState<{ key: string; pumps: Match[] }>({ key: "", pumps: [] });
  const serial = serialNumber.trim();
  const key = companyId && serial ? `${companyId}:${serial.toLowerCase()}` : "";

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/internal/equipment/search?companyId=${companyId}&serial=${encodeURIComponent(serial)}&elsewhere=1`, { signal: controller.signal });
        if (response.ok) setMatches({ key, pumps: (await response.json()).results });
      } catch {
        // A newer check replaced this one, or the network dropped. The server checks again on save.
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, companyId, serial]);

  return matches.key === key ? matches.pumps : [];
}

/**
 * Warns when a serial number being added for one customer is already on record at another,
 * as when a pump is sold or moved. Adding it anyway takes a tick, which the server checks.
 * The earlier repairs stay with the customer they were done for.
 */
export function SerialElsewhereWarning({ companyId, serialNumber, className = "" }: { companyId: string; serialNumber: string; className?: string }) {
  const matches = useSerialElsewhere(companyId, serialNumber);
  if (!matches.length) return null;
  return (
    <aside className={`border-l-4 border-danger bg-danger-soft px-4 py-3 ${className}`} role="status">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-danger" size={18} />
        <div className="min-w-0">
          <p className="font-bold">That serial number is already on record at another customer</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {matches.map((pump) => (
              <Link className="flex items-center gap-2 border border-danger bg-paper px-3 py-2 text-sm font-bold text-danger hover:bg-danger hover:text-white" href={`/workspace/equipment/${pump.id}`} key={pump.id} target="_blank">
                {pump.companyName} · {pump.productModel}<ArrowUpRight size={15} />
              </Link>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">Check it&apos;s not a typo. If the pump has changed hands, add it for this customer: its earlier repairs stay with the customer they were done for.</p>
          <label className="mt-2 flex items-start gap-2 text-sm font-bold"><input className="mt-0.5 size-4 accent-brand" name="addAnyway" type="checkbox" /> It&apos;s right: add it for this customer</label>
        </div>
      </div>
    </aside>
  );
}
