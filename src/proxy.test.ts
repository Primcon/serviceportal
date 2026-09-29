import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./proxy";

describe("contentSecurityPolicy", () => {
  it("only runs scripts that carry the request nonce, and blocks framing", () => {
    const policy = contentSecurityPolicy("abc123", { isDevelopment: false });
    expect(policy).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("lets sign-out forms continue to the customer Entra authority", () => {
    const policy = contentSecurityPolicy("n", { isDevelopment: false, customerAuthority: "https://vactechserviceportal.ciamlogin.com/" });
    expect(policy).toContain("form-action 'self' https://vactechserviceportal.ciamlogin.com");
  });

  it("allows React's development tooling only in development", () => {
    const policy = contentSecurityPolicy("n", { isDevelopment: true, customerAuthority: "not a url" });
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).not.toContain("upgrade-insecure-requests");
    expect(policy).toContain("form-action 'self';");
  });
});
