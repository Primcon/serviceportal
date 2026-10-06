import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, UserRole } from "@prisma/client";
import { approveAccessRequest, createAccessRequest, inviteCustomerUser, rejectAccessRequest } from "@/features/access/actions";
import { resetSignInLink, updateDocumentVisibility } from "@/features/admin/actions";
import { markAllNotificationsRead, unsubscribeFromEmails, updateCustomerNotificationPreference } from "@/features/customer/actions";
import { countUnreadNotifications, listCustomerNotifications } from "@/features/work-orders/customer-queries";
import { updateWorkOrderStatus } from "@/features/work-orders/actions";
import { getActiveInternalUserForRoles } from "@/services/authorization";
import { IdentityLinkRefusedError, upsertEntraUser } from "@/services/entra-auth";
import { emailContent } from "@/services/notifications";
import { unsubscribeToken } from "@/services/unsubscribe";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250)}` }), cookies: async () => ({ get: () => undefined }) }));

const prisma = new PrismaClient();
const suffix = crypto.randomUUID().slice(0, 8);
const savedEnvironment = { ...process.env };
const address = (label: string) => `invite-${label}-${suffix}@test.invalid`;
let companyId = "";
let workOrderId = "";
let managerId = "";

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

const invite = (label: string, extra: Record<string, string> = {}) => inviteCustomerUser(form({ companyId, locationId: "", firstName: "Pat", lastName: label, email: address(label), ...extra }));
const emailsTo = (label: string) => prisma.notification.findMany({ where: { recipientEmail: address(label) }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  process.env.AUTH_MODE = "development";
  process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
  delete process.env.AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING;
  delete process.env.AZURE_COMMUNICATION_SERVICES_SENDER_ADDRESS;
  managerId = (await getActiveInternalUserForRoles([UserRole.VACTECH_MANAGER])).id;
  const stage = await prisma.serviceStage.findUniqueOrThrow({ where: { code: "RECEIVED" } });
  const company = await prisma.company.create({ data: { name: `Invite Company ${suffix}` } });
  companyId = company.id;
  const equipment = await prisma.equipment.create({ data: { companyId, productModel: "Invite Model", serialNumber: `INV-${suffix}` } });
  workOrderId = (await prisma.workOrder.create({ data: { workOrderNumber: `INV-${suffix}`, companyId, equipmentId: equipment.id, summary: "Invite test", serviceStageId: stage.id, customerFacingStatus: stage.customerFacingStatus, createdById: managerId } })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { recipientEmail: { contains: suffix } } });
  await prisma.notification.deleteMany({ where: { eventKey: { startsWith: "access-request:" }, body: { contains: suffix } } });
  await prisma.accessRequest.deleteMany({ where: { email: { contains: suffix } } });
  await prisma.workOrder.deleteMany({ where: { companyId } });
  await prisma.equipment.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { email: { contains: `-${suffix}@test.invalid` } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  process.env = savedEnvironment;
  await prisma.$disconnect();
});

describe("inviting a customer", () => {
  it("creates the account and access, and emails how to sign in", async () => {
    await expect(invite("new")).resolves.toEqual({ status: "success", message: `Invitation sent to ${address("new")}.` });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: address("new") }, include: { access: true } });
    expect(user).toMatchObject({ displayName: "Pat new", internalRole: null, isActive: true });
    expect(user.identitySubject.startsWith("invited:")).toBe(true);
    expect(user.access).toMatchObject([{ companyId, role: "CUSTOMER_USER", scope: "COMPANY" }]);

    const [email] = await emailsTo("new");
    expect(email).toMatchObject({ kind: "ACCESS", userId: user.id, linkPath: "/portal", workOrderId: null });
    expect(email.body).toContain(`Sign in with this email address (${address("new")})`);
    // An invitation can't be opted out of, so it carries no unsubscribe footer.
    expect(emailContent(email).html).not.toContain("stop emails like this one");

    await expect(invite("new")).resolves.toEqual({ status: "error", message: "Pat new already has that access." });
  });

  it("links the invited account at first sign-in, and never to a second sign-in", async () => {
    await invite("link");
    const invited = await prisma.user.findUniqueOrThrow({ where: { email: address("link") } });
    const signedIn = await upsertEntraUser({ identitySubject: `entra-${suffix}-first`, email: address("link").toUpperCase(), firstName: "Pat", lastName: "Link", audience: "customer" });
    expect(signedIn.id).toBe(invited.id);
    expect(signedIn.identitySubject).toBe(`entra-${suffix}-first`);

    await expect(upsertEntraUser({ identitySubject: `entra-${suffix}-other`, email: address("link"), firstName: "Mallory", lastName: "Other", audience: "customer" })).rejects.toBeInstanceOf(IdentityLinkRefusedError);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: invited.id } })).identitySubject).toBe(`entra-${suffix}-first`);

    // After a manager resets the link, the next sign-in with that address is accepted.
    await expect(resetSignInLink(form({ userId: invited.id }))).resolves.toMatchObject({ status: "success" });
    const relinked = await upsertEntraUser({ identitySubject: `entra-${suffix}-other`, email: address("link"), firstName: "Pat", lastName: "Link", audience: "customer" });
    expect(relinked).toMatchObject({ id: invited.id, identitySubject: `entra-${suffix}-other` });
  });

  it("keeps staff and customer sign-ins apart", async () => {
    const staff = await prisma.user.create({ data: { identitySubject: `entra-${suffix}-staff`, email: address("staff"), displayName: "Staff Member", internalRole: UserRole.VACTECH_SERVICE_USER } });
    await expect(invite("staff")).resolves.toMatchObject({ status: "error", message: expect.stringContaining("belongs to a staff member") });
    await expect(upsertEntraUser({ identitySubject: `entra-${suffix}-attacker`, email: address("staff"), firstName: "A", lastName: "B", audience: "customer" })).rejects.toThrow("staff account");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: staff.id } })).identitySubject).toBe(`entra-${suffix}-staff`);

    await invite("customer");
    await expect(upsertEntraUser({ identitySubject: `entra-${suffix}-employee`, email: address("customer"), displayName: "X", audience: "employee" })).rejects.toThrow("customer account");
  });

  it("is limited to managers and administrators", async () => {
    process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_QA;
    try {
      await expect(invite("blocked")).resolves.toEqual({ status: "error", message: "You don't have permission to do that." });
    } finally {
      process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_MANAGER;
    }
  });
});

describe("access request emails", () => {
  it("tells the reviewers about a request, and the requester the decision", async () => {
    const reviewer = await prisma.user.create({ data: { identitySubject: `entra-${suffix}-reviewer`, email: address("reviewer"), displayName: "Reviewer", internalRole: UserRole.VACTECH_MANAGER } });
    await expect(createAccessRequest(form({ firstName: "Robin", lastName: "Requester", email: address("requester"), requestedCompany: `Invite Company ${suffix}`, message: "", website: "" }))).resolves.toMatchObject({ status: "success" });
    const request = await prisma.accessRequest.findFirstOrThrow({ where: { email: address("requester") } });
    const toReviewers = await prisma.notification.findMany({ where: { eventKey: `access-request:${request.id}` } });
    expect(toReviewers.some((email) => email.userId === reviewer.id && email.recipientEmail === address("reviewer"))).toBe(true);
    expect(toReviewers.every((email) => email.linkPath === "/workspace/access-requests" && email.kind === "ACCESS")).toBe(true);

    await expect(approveAccessRequest(form({ requestId: request.id, companyId }))).resolves.toMatchObject({ status: "success" });
    expect(await emailsTo("requester")).toMatchObject([{ subject: "Your VacTech service portal access is ready", linkPath: "/portal" }]);

    await createAccessRequest(form({ firstName: "Dana", lastName: "Declined", email: address("declined"), requestedCompany: "Somewhere", message: "", website: "" }));
    const declined = await prisma.accessRequest.findFirstOrThrow({ where: { email: address("declined") } });
    await rejectAccessRequest(form({ requestId: declined.id }));
    expect(await emailsTo("declined")).toMatchObject([{ subject: "About your VacTech service portal request", userId: null, linkPath: null }]);
  });
});

describe("the customer's notification feed", () => {
  it("shows everything, emails only what the customer chose, and tracks what's unread", async () => {
    await invite("feed");
    const customer = await prisma.user.findUniqueOrThrow({ where: { email: address("feed") } });
    const subject = `feed-${suffix}`;
    await prisma.user.update({ where: { id: customer.id }, data: { identitySubject: subject } });
    // Turn off status emails with the link from an email; no sign-in needed.
    await expect(unsubscribeFromEmails(form({ token: unsubscribeToken(customer.id, "STATUS_CHANGE") }))).resolves.toMatchObject({ status: "success" });
    await expect(unsubscribeFromEmails(form({ token: "forged.token" }))).resolves.toMatchObject({ status: "error" });
    await expect(unsubscribeFromEmails(form({ token: unsubscribeToken(customer.id, "ACCESS") }))).resolves.toMatchObject({ status: "error" });

    const inspection = await prisma.serviceStage.findUniqueOrThrow({ where: { code: "INITIAL_INSPECTION" } });
    await updateWorkOrderStatus(form({ workOrderId, serviceStageId: inspection.id, condition: "NORMAL", note: "" }));
    const uploader = await prisma.user.findUniqueOrThrow({ where: { id: managerId } });
    const document = await prisma.attachment.create({ data: { workOrderId, kind: "DOCUMENT", documentType: "REPAIR_QUOTE", visibility: "INTERNAL_ONLY", originalStorageKey: `doc/${suffix}`, fileName: "Quote.pdf", mimeType: "application/pdf", sizeBytes: 10, uploadedById: uploader.id } });
    // Sharing, hiding and sharing again tells the customer once.
    for (const visibility of ["CUSTOMER_VISIBLE", "INTERNAL_ONLY", "CUSTOMER_VISIBLE"]) await updateDocumentVisibility(form({ attachmentId: document.id, visibility }));

    const feed = await listCustomerNotifications(subject);
    expect(feed.notifications.map((item) => [item.kind, item.subject])).toEqual([
      ["DOCUMENT_SHARED", `Repair INV-${suffix}: repair quote available`],
      ["STATUS_CHANGE", `Repair INV-${suffix}: In progress`],
    ]);
    expect(feed.unread).toBe(2);
    expect(await countUnreadNotifications(subject)).toBe(2);
    const stored = await prisma.notification.findMany({ where: { userId: customer.id, kind: { not: "ACCESS" } }, select: { kind: true, status: true } });
    expect(stored).toEqual(expect.arrayContaining([{ kind: "STATUS_CHANGE", status: "OPTED_OUT" }, { kind: "DOCUMENT_SHARED", status: "LOGGED" }]));

    // The invitation email isn't part of the feed, and losing access empties it.
    expect(feed.notifications.some((item) => item.kind === "ACCESS")).toBe(false);
    await prisma.userAccess.deleteMany({ where: { userId: customer.id } });
    expect((await listCustomerNotifications(subject)).total).toBe(0);
    expect(await countUnreadNotifications("nobody")).toBe(0);
  });
});

// The customer-side actions use the development customer identity, exercised here for their own account only.
describe("marking notifications read", () => {
  it("clears the unread count without touching anyone else's", async () => {
    const developmentCustomer = await prisma.user.findUniqueOrThrow({ where: { identitySubject: "development:customer-user" } });
    const other = await prisma.user.create({ data: { identitySubject: `other-${suffix}`, email: address("other"), displayName: "Other" } });
    const item = (userId: string, recipientEmail: string, label: string) => prisma.notification.create({ data: { userId, recipientEmail, workOrderId, kind: "SERVICE_UPDATE", eventKey: `read-test:${label}:${suffix}`, subject: label, body: label, status: "LOGGED" } });
    const [mine, theirs] = await Promise.all([item(developmentCustomer.id, developmentCustomer.email, "mine"), item(other.id, other.email, "theirs")]);
    try {
      await expect(markAllNotificationsRead()).resolves.toMatchObject({ status: "success" });
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt).not.toBeNull();
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull();
      await expect(updateCustomerNotificationPreference(form({ emailUpdates: "on" }))).resolves.toEqual({ status: "success", message: "Preferences saved." });
      expect(await prisma.notificationPreference.findUniqueOrThrow({ where: { userId: developmentCustomer.id } })).toMatchObject({ emailUpdates: true, emailStatusChanges: false, emailDocuments: false });
    } finally {
      await prisma.notification.deleteMany({ where: { id: { in: [mine.id, theirs.id] } } });
      await prisma.notificationPreference.deleteMany({ where: { userId: developmentCustomer.id } });
    }
  });
});
