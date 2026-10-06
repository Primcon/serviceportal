import { describe, expect, it, vi } from "vitest";
import { decideEmailLink, isPlaceholderIdentity } from "./identity-linking";
import { renderNotificationEmail } from "./email-template";
import { readUnsubscribeToken, unsubscribeToken } from "./unsubscribe";

describe("decideEmailLink", () => {
  const waiting = { identitySubject: "invited:1", internalRole: null, hasCustomerAccess: true };
  const linked = { ...waiting, identitySubject: "entra-subject-abc" };
  const staff = { identitySubject: "entra-staff-1", internalRole: "VACTECH_MANAGER" as const, hasCustomerAccess: false };

  it("lets a first sign-in claim an account that was set up in advance", () => {
    expect(decideEmailLink(waiting, "customer")).toBe("link");
    expect(decideEmailLink({ ...waiting, identitySubject: "customer:someone@example.com" }, "customer")).toBe("link");
    expect(decideEmailLink({ ...waiting, identitySubject: "wordpress:412" }, "customer")).toBe("link");
    expect(decideEmailLink({ ...waiting, identitySubject: "relink:9" }, "customer")).toBe("link");
  });

  it("never lets a different sign-in take over an account that's already linked", () => {
    expect(decideEmailLink(linked, "customer")).toBe("refuse-linked-elsewhere");
    expect(decideEmailLink(staff, "employee")).toBe("refuse-linked-elsewhere");
  });

  it("keeps customer and staff sign-ins apart, even for an account still waiting", () => {
    expect(decideEmailLink(staff, "customer")).toBe("refuse-staff-account");
    expect(decideEmailLink({ ...staff, identitySubject: "wordpress:7" }, "customer")).toBe("refuse-staff-account");
    expect(decideEmailLink(waiting, "employee")).toBe("refuse-customer-account");
    // An imported former technician with no customer access can be claimed by the staff sign-in.
    expect(decideEmailLink({ identitySubject: "wordpress:8", internalRole: null, hasCustomerAccess: false }, "employee")).toBe("link");
  });

  it("recognizes only its own placeholders", () => {
    expect(isPlaceholderIdentity("invited:abc")).toBe(true);
    expect(isPlaceholderIdentity("development:customer-user")).toBe(false);
    expect(isPlaceholderIdentity("9f1c-entra-subject")).toBe(false);
  });
});

describe("unsubscribe links", () => {
  it("round-trips the person and kind, and rejects anything altered", () => {
    const token = unsubscribeToken("0d0c5a52-6f0e-4f43-9d3e-0c8f1f3f5a11", "STATUS_CHANGE");
    expect(readUnsubscribeToken(token)).toEqual({ userId: "0d0c5a52-6f0e-4f43-9d3e-0c8f1f3f5a11", kind: "STATUS_CHANGE" });

    const [payload, signature] = token.split(".");
    const forged = Buffer.from("11111111-1111-4111-8111-111111111111:STATUS_CHANGE").toString("base64url");
    expect(readUnsubscribeToken(`${forged}.${signature}`)).toBeNull();
    expect(readUnsubscribeToken(`${payload}.${signature.slice(0, -2)}xx`)).toBeNull();
    expect(readUnsubscribeToken("")).toBeNull();
    expect(readUnsubscribeToken(undefined)).toBeNull();
  });

  it("depends on the portal's secret", () => {
    const token = unsubscribeToken("0d0c5a52-6f0e-4f43-9d3e-0c8f1f3f5a11", "SERVICE_UPDATE");
    vi.stubEnv("AUTH_SESSION_SECRET", "a-different-secret-that-is-long-enough-123");
    expect(readUnsubscribeToken(token)).toBeNull();
    vi.unstubAllEnvs();
  });
});

describe("renderNotificationEmail", () => {
  const base = { heading: "Repair 50112 AZ: In progress", body: "First paragraph.\n\nSecond <b>paragraph</b> & more.", link: { url: "https://portal.example/portal/work-orders/1", label: "View the repair" }, logoUrl: "https://portal.example/logo.png" };

  it("escapes the message, and includes the button and the ways to stop emails", () => {
    const { html, plainText } = renderNotificationEmail({ ...base, footer: { preferencesUrl: "https://portal.example/portal/notifications", unsubscribeUrl: "https://portal.example/unsubscribe?token=t" } });
    expect(html).toContain("Second &lt;b&gt;paragraph&lt;/b&gt; &amp; more.");
    expect(html).not.toContain("<b>paragraph</b>");
    expect(html).toContain('href="https://portal.example/portal/work-orders/1"');
    expect(html).toContain("stop emails like this one");
    expect(plainText).toContain("View the repair: https://portal.example/portal/work-orders/1");
    expect(plainText).toContain("Stop emails like this one: https://portal.example/unsubscribe?token=t");
  });

  it("leaves the opt-out footer off emails that can't be turned off", () => {
    const { html, plainText } = renderNotificationEmail({ ...base, link: null, footer: null });
    expect(html).not.toContain("stop emails like this one");
    expect(html).toContain("This message was sent by the VacTech service portal.");
    expect(plainText).not.toContain("Stop emails");
  });
});
