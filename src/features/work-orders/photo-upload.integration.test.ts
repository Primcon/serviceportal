import "dotenv/config";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient, UserRole } from "@prisma/client";
import { unzipSync } from "fflate";
import { GET as customerFile } from "@/app/api/attachments/[attachmentId]/route";
import { GET as customerFiles } from "@/app/api/work-orders/[workOrderId]/files/route";
import { GET as originalStatus, POST as requestOriginal } from "@/app/api/internal/attachments/[attachmentId]/original/route";
import { GET as staffFile } from "@/app/api/internal/attachments/[attachmentId]/route";
import { POST as uploadPhoto } from "@/app/api/internal/work-orders/[workOrderId]/photos/route";
import { originalRetrievalKey } from "@/features/work-orders/photo-upload";
import { privateFileState, readPrivateFile, startArchivedFileRetrieval, storePrivateBuffer } from "@/services/private-storage";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/private-storage", () => ({
  deletePrivateFile: vi.fn(),
  privateFileState: vi.fn(),
  readPrivateFile: vi.fn(),
  startArchivedFileRetrieval: vi.fn(),
  storePrivateBuffer: vi.fn(async () => true),
  storePrivateFile: vi.fn(),
}));

const prisma = new PrismaClient();
const suffix = crypto.randomUUID().slice(0, 8);
const savedEnvironment = { ...process.env };
const origin = "https://portal.test";
let companyId = "";
let workOrderId = "";
let customerUserId = "";

function upload(file: File | null, headers: Record<string, string> = { origin, host: "portal.test" }, fields: Record<string, string> = { photoCategory: "INSPECTION", visibility: "CUSTOMER_VISIBLE" }, id = workOrderId) {
  const body = new FormData();
  if (file) body.set("file", file);
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return uploadPhoto(new Request(`${origin}/api/internal/work-orders/${id}/photos`, { method: "POST", body, headers }), { params: Promise.resolve({ workOrderId: id }) });
}

async function jpeg() {
  return new File([new Uint8Array(await sharp({ create: { width: 3200, height: 2400, channels: 3, background: "#7a8c99" } }).jpeg().toBuffer())], "C:\\photos\\IMG_0412.JPG", { type: "image/jpeg" });
}

const attachmentRequest = (id: string, query = "", method = "GET") => [new Request(`${origin}/api/x/${id}${query}`, { method, headers: { origin, host: "portal.test" } }), { params: Promise.resolve({ attachmentId: id }) }] as const;

beforeAll(async () => {
  process.env.AUTH_MODE = "development";
  process.env.DEVELOPMENT_INTERNAL_ROLE = UserRole.VACTECH_SERVICE_USER;
  const company = await prisma.company.create({ data: { name: `Photo Company ${suffix}` } });
  const equipment = await prisma.equipment.create({ data: { companyId: company.id, productModel: "Photo Model", serialNumber: `PHOTO-${suffix}` } });
  const stage = await prisma.serviceStage.findUniqueOrThrow({ where: { code: "RECEIVED" } });
  const creator = await prisma.user.findFirstOrThrow({ where: { identitySubject: "development:service-manager" } });
  const workOrder = await prisma.workOrder.create({ data: { workOrderNumber: `PHOTO-${suffix}`, companyId: company.id, equipmentId: equipment.id, summary: "Photo test", serviceStageId: stage.id, customerFacingStatus: stage.customerFacingStatus, createdById: creator.id } });
  // The development customer identity is given access, so the customer file route can be exercised.
  const customer = await prisma.user.findFirstOrThrow({ where: { identitySubject: "development:customer-user" } });
  await prisma.userAccess.create({ data: { userId: customer.id, companyId: company.id, role: "CUSTOMER_USER", scope: "COMPANY" } });
  companyId = company.id;
  workOrderId = workOrder.id;
  customerUserId = customer.id;
});

beforeEach(() => {
  vi.mocked(storePrivateBuffer).mockClear();
  vi.mocked(readPrivateFile).mockReset();
  vi.mocked(privateFileState).mockReset();
  vi.mocked(startArchivedFileRetrieval).mockReset();
});

afterAll(async () => {
  await prisma.userAccess.deleteMany({ where: { userId: customerUserId, companyId } });
  await prisma.workOrder.deleteMany({ where: { companyId } });
  await prisma.equipment.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  process.env = savedEnvironment;
  await prisma.$disconnect();
});

describe("uploading a photo", () => {
  it("stores a compressed viewing copy and thumbnail, and archives the original", async () => {
    const file = await jpeg();
    const response = await upload(file);
    expect(response.status).toBe(200);
    const { id } = await response.json() as { id: string };

    const photo = await prisma.attachment.findUniqueOrThrow({ where: { id } });
    expect(photo).toMatchObject({ kind: "PHOTO", fileName: "IMG_0412.JPG", mimeType: "image/jpeg", sizeBytes: file.size, photoCategory: "INSPECTION", visibility: "CUSTOMER_VISIBLE" });
    expect(photo.originalArchivedAt).not.toBeNull();

    const stored = vi.mocked(storePrivateBuffer).mock.calls.map(([call]) => call);
    expect(stored.find((call) => call.key === photo.originalStorageKey)).toMatchObject({ archive: true, contentType: "image/jpeg" });
    const viewing = stored.find((call) => call.key === photo.optimizedStorageKey)!;
    expect(viewing.archive).toBeUndefined();
    expect(await sharp(viewing.content).metadata()).toMatchObject({ format: "webp", width: 2400, height: 1800 });
    expect(stored.find((call) => call.key === photo.thumbnailStorageKey)?.archive).toBeUndefined();
  });

  it("refuses requests from other sites, bad files, and unknown work orders", async () => {
    const file = await jpeg();
    expect((await upload(file, { origin: "https://evil.test", host: "portal.test" })).status).toBe(403);
    expect((await upload(file, { host: "portal.test" })).status).toBe(403);

    const notAPhoto = await upload(new File(["MZ not a photo"], "virus.jpg", { type: "image/jpeg" }));
    expect(notAPhoto.status).toBe(400);
    expect(await notAPhoto.json()).toMatchObject({ status: "error", message: expect.stringContaining("virus.jpg isn't a supported photo") });

    expect((await upload(null)).status).toBe(400);
    expect((await upload(file, undefined, { photoCategory: "SELFIE" })).status).toBe(400);
    expect((await upload(file, undefined, undefined, crypto.randomUUID())).status).toBe(404);
    expect((await upload(file, { origin, host: "portal.test", "content-length": String(60 * 1024 * 1024) })).status).toBe(413);
    expect(vi.mocked(storePrivateBuffer)).not.toHaveBeenCalled();
  });

  it("removes the stored files again if the photo can't be recorded", async () => {
    const { deletePrivateFile } = await import("@/services/private-storage");
    vi.mocked(storePrivateBuffer).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const response = await upload(await jpeg());
    expect(await response.json()).toEqual({ status: "error", message: "Private file storage is not configured." });
    expect(vi.mocked(deletePrivateFile)).toHaveBeenCalledTimes(3);
    vi.mocked(storePrivateBuffer).mockImplementation(async () => true);
  });
});

describe("viewing a photo", () => {
  it("gives staff and customers the compressed copy, and never the archived original to customers", async () => {
    const { id } = await (await upload(await jpeg())).json() as { id: string };
    const photo = await prisma.attachment.findUniqueOrThrow({ where: { id } });
    vi.mocked(readPrivateFile).mockImplementation(async (key) => (key === photo.originalStorageKey ? null : Buffer.from(`file at ${key}`)));

    const forStaff = await staffFile(...attachmentRequest(id));
    expect(forStaff.headers.get("content-type")).toBe("image/webp");
    expect(await forStaff.text()).toBe(`file at ${photo.optimizedStorageKey}`);
    expect(await (await staffFile(...attachmentRequest(id, "?variant=thumbnail"))).text()).toBe(`file at ${photo.thumbnailStorageKey}`);

    const forCustomer = await customerFile(...attachmentRequest(id));
    expect(await forCustomer.text()).toBe(`file at ${photo.optimizedStorageKey}`);
    const customerAsksForOriginal = await customerFile(...attachmentRequest(id, "?variant=original"));
    expect(await customerAsksForOriginal.text()).toBe(`file at ${photo.optimizedStorageKey}`);
    expect(vi.mocked(readPrivateFile)).not.toHaveBeenCalledWith(photo.originalStorageKey);
  });

  it("puts only the files shared with the customer into their download", async () => {
    const uploaded = async (visibility: string) => (await (await upload(await jpeg(), undefined, { photoCategory: "TESTING", visibility })).json() as { id: string }).id;
    const [sharedId, staffOnlyId] = [await uploaded("CUSTOMER_VISIBLE"), await uploaded("INTERNAL_ONLY")];
    const uploader = await prisma.user.findFirstOrThrow({ where: { identitySubject: "development:service-manager" } });
    const document = (visibility: "CUSTOMER_VISIBLE" | "INTERNAL_ONLY", fileName: string) => prisma.attachment.create({ data: { workOrderId, kind: "DOCUMENT", visibility, documentType: "FINAL_SERVICE_REPORT", originalStorageKey: `doc/${fileName}`, fileName, mimeType: "application/pdf", sizeBytes: 10, uploadedById: uploader.id } });
    await Promise.all([document("CUSTOMER_VISIBLE", `Report ${suffix}.pdf`), document("INTERNAL_ONLY", `Cost sheet ${suffix}.pdf`)]);
    const sharedPhoto = await prisma.attachment.findUniqueOrThrow({ where: { id: sharedId } });
    const staffPhoto = await prisma.attachment.findUniqueOrThrow({ where: { id: staffOnlyId } });
    vi.mocked(readPrivateFile).mockImplementation(async (key) => Buffer.from(`file at ${key}`));

    const response = await customerFiles(new Request(`${origin}/x`), { params: Promise.resolve({ workOrderId }) });
    expect(response.headers.get("content-type")).toBe("application/zip");
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const names = Object.keys(entries);
    expect(names).toContain(`Documents/Report ${suffix}.pdf`);
    expect(names.some((name) => name.includes("Cost sheet"))).toBe(false);
    // Photos go in as their viewing copies, never the archived originals.
    expect(names.filter((name) => name.startsWith("Photos/")).every((name) => name.endsWith(".webp"))).toBe(true);
    const requested = vi.mocked(readPrivateFile).mock.calls.map(([key]) => key);
    expect(requested).toContain(sharedPhoto.optimizedStorageKey);
    expect(requested).not.toContain(sharedPhoto.originalStorageKey);
    expect(requested).not.toContain(staffPhoto.optimizedStorageKey);

    expect((await customerFiles(new Request(`${origin}/x`), { params: Promise.resolve({ workOrderId: crypto.randomUUID() }) })).status).toBe(404);
  });

  it("retrieves an archived original only when staff ask, then serves the retrieved copy", async () => {
    const { id } = await (await upload(await jpeg())).json() as { id: string };
    const photo = await prisma.attachment.findUniqueOrThrow({ where: { id } });
    const retrievalKey = originalRetrievalKey(id);

    vi.mocked(privateFileState).mockResolvedValue("missing");
    expect(await (await originalStatus(...attachmentRequest(id))).json()).toEqual({ state: "archived" });
    expect((await staffFile(...attachmentRequest(id, "?variant=original"))).status).toBe(409);

    // Asking starts the retrieval; asking again while it runs doesn't start another.
    vi.mocked(startArchivedFileRetrieval).mockImplementation(async () => { vi.mocked(privateFileState).mockResolvedValue("retrieving"); });
    expect((await requestOriginal(new Request(`${origin}/x`, { method: "POST", headers: { origin: "https://evil.test", host: "portal.test" } }), { params: Promise.resolve({ attachmentId: id }) })).status).toBe(403);
    expect(await (await requestOriginal(...attachmentRequest(id, "", "POST"))).json()).toEqual({ state: "retrieving" });
    expect(await (await requestOriginal(...attachmentRequest(id, "", "POST"))).json()).toEqual({ state: "retrieving" });
    expect(vi.mocked(startArchivedFileRetrieval)).toHaveBeenCalledExactlyOnceWith(photo.originalStorageKey, retrievalKey);
    expect(await prisma.auditEvent.count({ where: { entityId: id, eventType: "photo.original-requested" } })).toBe(1);
    expect((await staffFile(...attachmentRequest(id, "?variant=original"))).status).toBe(409);

    vi.mocked(privateFileState).mockResolvedValue("available");
    vi.mocked(readPrivateFile).mockImplementation(async (key) => Buffer.from(`file at ${key}`));
    const original = await staffFile(...attachmentRequest(id, "?variant=original"));
    expect(original.headers.get("content-type")).toBe("image/jpeg");
    expect(original.headers.get("content-disposition")).toContain("IMG_0412.JPG");
    expect(await original.text()).toBe(`file at ${retrievalKey}`);
  });
});
