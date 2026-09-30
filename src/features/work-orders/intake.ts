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
