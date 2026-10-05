import type { Prisma } from "@prisma/client";

/**
 * The full WIP number for a work order: the number staff type plus the service center code,
 * such as "48366" at AZ becoming "48366 AZ". A number that already ends with the code is
 * left alone, and extra spaces are tidied.
 */
export function wipNumber(number: string, centerCode: string | null) {
  const trimmed = number.trim().replace(/\s+/g, " ");
  if (!centerCode) return trimmed;
  return new RegExp(`\\s${centerCode}$`, "i").test(trimmed) ? trimmed.replace(new RegExp(`${centerCode}$`, "i"), centerCode) : `${trimmed} ${centerCode}`;
}

export const workOrderSequence = "work-order";

/** The number part of a WIP number, such as 48366 in "48366 AZ", or null for other formats. */
export function wipSequenceNumber(workOrderNumber: string) {
  const digits = /^\d{1,9}/.exec(workOrderNumber.trim())?.[0];
  return digits ? Number(digits) : null;
}

/**
 * Takes the next WIP number inside the intake transaction. Incrementing the counter locks its
 * row until the transaction ends, so two intakes never get the same number, and a failed intake
 * gives its number back. Numbers already on a work order (an imported job, say) are skipped.
 */
export async function assignWorkOrderNumber(transaction: Prisma.TransactionClient, centerCode: string | null) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const sequence = await transaction.numberSequence.upsert({
      where: { name: workOrderSequence },
      create: { name: workOrderSequence, nextValue: 2 },
      update: { nextValue: { increment: 1 } },
    });
    const number = sequence.nextValue - 1;
    const taken = await transaction.workOrder.findFirst({
      where: { OR: [{ workOrderNumber: String(number) }, { workOrderNumber: { startsWith: `${number} ` } }] },
      select: { id: true },
    });
    if (!taken) return wipNumber(String(number), centerCode);
  }
  throw new Error("Couldn't find an unused WIP number. Check the next WIP number in Settings.");
}

/** Display name for a catalog model, as stored on equipment ("Edwards IL70N"). */
export function modelDisplayName(manufacturer: string | null, name: string) {
  return [manufacturer?.trim(), name.trim()].filter(Boolean).join(" ");
}

/** Finds a catalog model by manufacturer and name ignoring case, or adds it. */
export async function findOrCreateProductModel(transaction: Prisma.TransactionClient, manufacturer: string | null, name: string) {
  const cleanManufacturer = manufacturer?.trim() || null;
  const cleanName = name.trim();
  const existing = await transaction.productModel.findFirst({
    where: {
      name: { equals: cleanName, mode: "insensitive" },
      ...(cleanManufacturer ? { manufacturer: { equals: cleanManufacturer, mode: "insensitive" } } : { manufacturer: null }),
    },
  });
  return existing ?? transaction.productModel.create({ data: { manufacturer: cleanManufacturer, name: cleanName } });
}
