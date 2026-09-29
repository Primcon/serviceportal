import { describe, expect, it } from "vitest";
import { UserRole } from "@prisma/client";
import { assertActiveUser, isAllowedInternalRole, isInternalRole } from "./authorization-policy";
import { resolveDevelopmentInternalRole } from "./development-identity";
import { getEntraApplication, parseEntraApplication } from "./entra-config";

describe("authorization policy", () => {
  it("allows only internal roles into the service workspace", () => {
    expect(isInternalRole(UserRole.PORTAL_ADMINISTRATOR)).toBe(true);
    expect(isInternalRole(UserRole.VACTECH_MANAGER)).toBe(true);
    expect(isInternalRole(UserRole.VACTECH_SERVICE_USER)).toBe(true);
    expect(isInternalRole(UserRole.CUSTOMER_USER)).toBe(false);
  });

  it("limits administration to managers and portal administrators", () => {
    const administrators = [UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER];
    expect(isAllowedInternalRole(UserRole.PORTAL_ADMINISTRATOR, administrators)).toBe(true);
    expect(isAllowedInternalRole(UserRole.VACTECH_MANAGER, administrators)).toBe(true);
    expect(isAllowedInternalRole(UserRole.VACTECH_SERVICE_USER, administrators)).toBe(false);
    expect(isAllowedInternalRole(UserRole.CUSTOMER_USER, administrators)).toBe(false);
  });

  it("rejects disabled or missing users", () => {
    expect(() => assertActiveUser(null)).toThrow("Your account is inactive.");
    expect(() => assertActiveUser({ isActive: false })).toThrow("Your account is inactive.");
    expect(() => assertActiveUser({ isActive: true })).not.toThrow();
  });

  it("resolves supported development roles and rejects invalid configuration", () => {
    expect(resolveDevelopmentInternalRole(undefined)).toBe(UserRole.VACTECH_MANAGER);
    expect(resolveDevelopmentInternalRole("PORTAL_ADMINISTRATOR")).toBe(UserRole.PORTAL_ADMINISTRATOR);
    expect(resolveDevelopmentInternalRole("VACTECH_SERVICE_USER")).toBe(UserRole.VACTECH_SERVICE_USER);
    expect(() => resolveDevelopmentInternalRole("CUSTOMER_USER")).toThrow("Unsupported DEVELOPMENT_INTERNAL_ROLE");
  });

  it("validates separate customer and employee Entra applications", () => {
    const customer = parseEntraApplication({ tenantId: "customer-tenant", clientId: "customer-client", clientSecret: "customer-secret", authority: "https://login.microsoftonline.com/customer", redirectUri: "https://portal.example.com/auth/customer/callback" });
    const employee = parseEntraApplication({ tenantId: "employee-tenant", clientId: "employee-client", clientSecret: "employee-secret", authority: "https://login.microsoftonline.com/employee", redirectUri: "https://portal.example.com/auth/employee/callback" });
    expect(customer.clientId).not.toBe(employee.clientId);
    expect(() => parseEntraApplication({ tenantId: "", clientId: "", clientSecret: "", authority: "invalid", redirectUri: "invalid" })).toThrow();
    expect(getEntraApplication("customer").clientId).toBeTruthy();
  });
});