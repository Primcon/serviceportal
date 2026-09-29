import type { CopperClassification, CustomerFacingStatus, DocumentType, PhotoCategory, UserRole } from "@prisma/client";

export const customerStatusLabels: Record<CustomerFacingStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting",
  COMPLETED: "Completed",
};

/** Turns an enum value such as WAITING_ON_PARTS into "Waiting On Parts". */
export function formatEnumLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const roleLabels: Record<UserRole, string> = {
  PORTAL_ADMINISTRATOR: "Portal administrator",
  VACTECH_MANAGER: "VacTech manager",
  VACTECH_SERVICE_USER: "VacTech service user",
  CUSTOMER_USER: "Customer user",
};

export const documentTypeLabels: Record<DocumentType, string> = {
  CUSTOMER_PO: "Customer PO",
  REPAIR_QUOTE: "Repair quote",
  INVOICE: "Invoice",
  INSPECTION_REPORT: "Inspection report",
  TEST_REPORT: "Test report",
  FINAL_SERVICE_REPORT: "Final service report",
  SHIPPING_DOCUMENTATION: "Shipping documentation",
  MANUAL: "Manual",
  WARRANTY_CERTIFICATE: "Warranty certificate",
  SIGNED_TRAVELER: "Signed traveler",
  OTHER: "Other",
};

export const photoCategoryLabels: Record<PhotoCategory, string> = {
  ARRIVAL: "Arrival",
  IDENTIFICATION: "Identification (nameplate, serial)",
  INITIAL_CONDITION: "Initial condition",
  INSPECTION: "Inspection",
  DISASSEMBLY: "Disassembly",
  FINDINGS: "Findings",
  REPAIR: "Repair",
  REPLACEMENT_PARTS: "Replacement parts",
  TESTING: "Testing",
  FINAL_CONDITION: "Final condition",
  SHIPPING: "Shipping",
};

export const copperClassificationLabels: Record<CopperClassification, string> = {
  UNKNOWN: "Not recorded",
  COPPER: "Copper",
  NON_COPPER: "Non-copper",
};
