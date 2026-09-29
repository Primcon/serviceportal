import "dotenv/config";
import { afterAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createAccessRequest } from "@/features/access/actions";
import { allowRequest } from "@/lib/rate-limit";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250)}` }) }));

const prisma = new PrismaClient();
const suffix = crypto.randomUUID();
const email = `access-request-${suffix}@test.invalid`;

function requestForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  const values = { firstName: "Pat", lastName: "Tester", email, requestedCompany: "Example Fab Co.", message: "", ...overrides };
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

afterAll(async () => {
  await prisma.accessRequest.deleteMany({ where: { email: { in: [email, `bot-${suffix}@test.invalid`] } } });
  await prisma.$disconnect();
});

describe("public access requests", () => {
  it("quietly ignores submissions that fill in the hidden field", async () => {
    const result = await createAccessRequest(requestForm({ email: `bot-${suffix}@test.invalid`, website: "https://spam.example" }));
    expect(result.status).toBe("success");
    expect(await prisma.accessRequest.count({ where: { email: `bot-${suffix}@test.invalid` } })).toBe(0);
  });

  it("keeps one pending request per address and answers repeats the same way", async () => {
    const first = await createAccessRequest(requestForm());
    const second = await createAccessRequest(requestForm());
    expect(second).toEqual(first);
    expect(await prisma.accessRequest.count({ where: { email } })).toBe(1);
  });

  it("rejects oversized messages", async () => {
    const result = await createAccessRequest(requestForm({ email: `long-${suffix}@test.invalid`, message: "x".repeat(2001) }));
    expect(result).toMatchObject({ status: "error", fieldErrors: { message: "Keep the message under 2,000 characters." } });
  });
});

describe("allowRequest", () => {
  it("allows up to the limit within the window, then again after it passes", () => {
    const key = `test:${suffix}`;
    expect([1, 2, 3].map(() => allowRequest(key, 2, 1000, 5000))).toEqual([true, true, false]);
    expect(allowRequest(key, 2, 1000, 6001)).toBe(true);
  });
});
