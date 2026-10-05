/**
 * True when a state-changing request came from the portal's own pages. Server actions get
 * this check from Next.js; route handlers that change data call it themselves. Browsers
 * always send Origin on a POST, so a missing one is refused.
 */
export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
