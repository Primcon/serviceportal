import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, UserRole } from "@prisma/client";
import { assertCustomerAccess, startingEmployeeRole, upsertEntraUser } from "./entra-auth";
import { assertPersistedInternalRole } from "./authorization";

const prisma = new PrismaClient();
const suffix = crypto.randomUUID();
const email = `entra-link-${suffix}@test.invalid`;
let userId = "";
let companyId = "";
let unapprovedUserId = "";
let employeeUserId = "";

beforeAll(async () => {
  const [user, company] = await Promise.all([
    prisma.user.create({ data: { identitySubject: `customer:${email}`, email, displayName: "Requested Customer" } }),
    prisma.company.create({ data: { name: `Entra Link Test ${suffix}` } }),
  ]);
  userId = user.id;
  companyId = company.id;
  await prisma.userAccess.create({ data: { userId, companyId, role: UserRole.CUSTOMER_USER } });
  const unapprovedUser = await prisma.user.create({ data: { identitySubject: `unapproved:${suffix}`, email: `unapproved-${suffix}@test.invalid`, displayName: "Unapproved Customer" } });
  unapprovedUserId = unapprovedUser.id;
});

afterAll(async () => {
  await prisma.userAccess.deleteMany({ where: { userId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.user.deleteMany({ where: { id: unapprovedUserId } });
  await prisma.user.deleteMany({ where: { id: employeeUserId } });
  await prisma.$disconnect();
});

describe("Entra account linking", () => {
  it("links a verified Entra identity to the approved user without removing company grants", async () => {
    const user = await upsertEntraUser({ identitySubject: `entra-subject-${suffix}`, email, firstName: " Verified ", lastName: " Customer " });
    expect(user.id).toBe(userId);
    expect(user.identitySubject).toBe(`entra-subject-${suffix}`);
    expect(user.displayName).toBe("Verified Customer");
    expect(user.firstName).toBe("Verified");
    expect(user.lastName).toBe("Customer");
    await expect(prisma.userAccess.count({ where: { userId, companyId, role: UserRole.CUSTOMER_USER } })).resolves.toBe(1);
    await expect(assertCustomerAccess(user.id)).resolves.toBeUndefined();
  });

  it("rejects customer accounts without an approved company grant", async () => {
    await expect(assertCustomerAccess(unapprovedUserId)).rejects.toThrow("Customer access has not been approved.");
  });

  it("seeds an employee role once and preserves later portal-side role changes", async () => {
    const employee = await upsertEntraUser({ identitySubject: `employee:${suffix}`, email: `employee-${suffix}@test.invalid`, displayName: "Employee", internalRole: UserRole.VACTECH_MANAGER });
    employeeUserId = employee.id;
    expect(employee.internalRole).toBe(UserRole.VACTECH_MANAGER);
    await prisma.user.update({ where: { id: employee.id }, data: { internalRole: UserRole.VACTECH_SERVICE_USER } });
    const linkedEmployee = await upsertEntraUser({ identitySubject: `employee:${suffix}`, email: `employee-${suffix}@test.invalid`, displayName: "Employee", internalRole: UserRole.PORTAL_ADMINISTRATOR });
    expect(linkedEmployee.internalRole).toBe(UserRole.VACTECH_SERVICE_USER);
  });

  it("takes only the starting employee role from Entra, highest role first", () => {
    expect(startingEmployeeRole(["VacTech.ServiceUser", "Portal.Administrator"])).toBe(UserRole.PORTAL_ADMINISTRATOR);
    expect(startingEmployeeRole(["VacTech.Manager"])).toBe(UserRole.VACTECH_MANAGER);
    expect(startingEmployeeRole(["Something.Else"])).toBeNull();
    expect(startingEmployeeRole(undefined)).toBeNull();
  });

  it("denies manager access immediately after a persisted role downgrade", async () => {
    const employee = await prisma.user.findUniqueOrThrow({ where: { id: employeeUserId } });
    await prisma.user.update({ where: { id: employee.id }, data: { internalRole: UserRole.VACTECH_MANAGER } });
    await expect(assertPersistedInternalRole(employee.id, [UserRole.VACTECH_MANAGER])).resolves.toMatchObject({ id: employee.id });
    await prisma.user.update({ where: { id: employee.id }, data: { internalRole: UserRole.VACTECH_SERVICE_USER } });
    await expect(assertPersistedInternalRole(employee.id, [UserRole.VACTECH_MANAGER])).rejects.toThrow("You don't have permission to do that.");
  });
});
