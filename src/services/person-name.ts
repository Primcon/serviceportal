export function normalizeNamePart(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.toLowerCase() !== "unknown" ? normalized : null;
}

export function firstUsableNamePart(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeNamePart(value);
    if (normalized) return normalized;
  }
  return null;
}

export function displayNameForPerson(firstName: string | null | undefined, lastName: string | null | undefined, email: string) {
  const parts = [normalizeNamePart(firstName), normalizeNamePart(lastName)].filter((part): part is string => Boolean(part));
  return parts.join(" ") || email;
}