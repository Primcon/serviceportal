import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: queryRaw } }));

import { GET as live } from "./live/route";
import { GET as ready } from "./ready/route";

beforeEach(() => {
  queryRaw.mockReset();
});

describe("health endpoints", () => {
  it("returns a no-store liveness response", async () => {
    const response = await live();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns ready when PostgreSQL is reachable", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const response = await ready();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns a generic unavailable response when PostgreSQL is unreachable", async () => {
    queryRaw.mockRejectedValue(new Error("database connection details"));
    const response = await ready();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
  });
});