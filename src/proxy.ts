import { NextResponse, type NextRequest } from "next/server";

function originOf(value: string | undefined) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

/**
 * Builds the page Content Security Policy. Scripts must carry this request's nonce, which
 * Next.js adds to its own scripts automatically. Form submissions may also go to the
 * customer Entra authority, because sign-out redirects there after posting to the portal.
 */
export function contentSecurityPolicy(nonce: string, options: { isDevelopment: boolean; customerAuthority?: string }) {
  const customerAuthorityOrigin = originOf(options.customerAuthority);
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' blob: data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self'${customerAuthorityOrigin ? ` ${customerAuthorityOrigin}` : ""}`,
    "frame-ancestors 'none'",
    ...(options.isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce, {
    isDevelopment: process.env.NODE_ENV === "development",
    customerAuthority: process.env.ENTRA_CUSTOMER_AUTHORITY,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only. API routes set their own headers, and static assets don't need a policy.
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
