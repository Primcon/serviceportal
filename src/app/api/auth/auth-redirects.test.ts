import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { CustomerAccessNotApprovedError, exchangeEntraCode } = vi.hoisted(() => ({
  CustomerAccessNotApprovedError: class CustomerAccessNotApprovedError extends Error {},
  exchangeEntraCode: vi.fn(),
}));

vi.mock("@/services/entra-auth", () => ({ CustomerAccessNotApprovedError, exchangeEntraCode }));

import { GET as callback } from "./[audience]/callback/route";
import { POST as logout } from "./logout/route";

const publicOrigin = "https://portal.example.test";
const originalApplicationOrigin = process.env.APP_ORIGIN;

beforeEach(() => {
  process.env.APP_ORIGIN = publicOrigin;
  exchangeEntraCode.mockReset();
  exchangeEntraCode.mockResolvedValue({});
});

afterAll(() => {
  if (originalApplicationOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = originalApplicationOrigin;
});

describe("public authentication redirects", () => {
  it("redirects an employee callback to the public workspace origin", async () => {
    const response = await callback(new Request("https://0.0.0.0:3000/api/auth/employee/callback?code=test&state=test"), {
      params: Promise.resolve({ audience: "employee" }),
    });
    expect(response.headers.get("location")).toBe(`${publicOrigin}/workspace`);
  });

  it("redirects a customer callback to the public portal origin", async () => {
    const response = await callback(new Request("https://0.0.0.0:3000/api/auth/customer/callback?code=test&state=test"), {
      params: Promise.resolve({ audience: "customer" }),
    });
    expect(response.headers.get("location")).toBe(`${publicOrigin}/portal`);
  });

  it("redirects an authenticated but unapproved customer to the access-pending page", async () => {
    exchangeEntraCode.mockRejectedValue(new CustomerAccessNotApprovedError());
    const response = await callback(new Request("https://0.0.0.0:3000/api/auth/customer/callback?code=test&state=test"), {
      params: Promise.resolve({ audience: "customer" }),
    });
    expect(response.headers.get("location")).toBe(`${publicOrigin}/access-pending`);
  });

  it("redirects logout to the public application origin", async () => {
    const response = await logout();
    expect(response.headers.get("location")).toBe(`${publicOrigin}/`);
  });

  it("requires an explicit public application origin", async () => {
    delete process.env.APP_ORIGIN;
    await expect(logout()).rejects.toThrow("APP_ORIGIN is required.");
  });
});