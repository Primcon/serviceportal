"use client";

import { Printer } from "lucide-react";
import { buttonStyles } from "@/components/ui/styles";

export function PrintButton() {
  return <button className={buttonStyles({ size: "sm" })} onClick={() => window.print()} type="button"><Printer size={16} /> Print</button>;
}
