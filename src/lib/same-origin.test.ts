import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "./same-origin";

function request(headers: Record<string, string>) {
  return new Request("https://portal.example/api/internal/x", { method: "POST", headers });
}

describe("isSameOriginRequest", () => {
  it("accepts requests from the portal's own pages", () => {
    expect(isSameOriginRequest(request({ origin: "https://portal.example", host: "portal.example" }))).toBe(true);
    // Behind the Azure ingress, the public host arrives in x-forwarded-host.
    expect(isSameOriginRequest(request({ origin: "https://portal.example", host: "10.0.0.4:3000", "x-forwarded-host": "portal.example" }))).toBe(true);
  });

  it("refuses other sites, and requests with no origin", () => {
    expect(isSameOriginRequest(request({ origin: "https://evil.example", host: "portal.example" }))).toBe(false);
    expect(isSameOriginRequest(request({ host: "portal.example" }))).toBe(false);
    expect(isSameOriginRequest(request({ origin: "null", host: "portal.example" }))).toBe(false);
  });
});
