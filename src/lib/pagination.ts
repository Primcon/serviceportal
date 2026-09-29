export type SearchParams = Record<string, string | string[] | undefined>;

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads a 1-based page number from the query string, falling back to page 1 for anything invalid. */
export function pageFromParams(params: SearchParams) {
  const requested = Number(firstParam(params.page) ?? "1");
  return Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : 1;
}

/** Skip/take for a page, plus helpers to clamp the page once the total is known. */
export function pageWindow(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function pageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Builds a link to another page of the same list, keeping the other query parameters. */
export function pageHref(pathname: string, params: SearchParams, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== "") query.append(key, item);
    }
  }
  if (page > 1) query.set("page", String(page));
  const search = query.toString();
  return search ? `${pathname}?${search}` : pathname;
}
