import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deletePrivateFile, isMissingPrivateFileError, readPrivateFile, storePrivateBuffer } from "./private-storage";

let temporaryStorageDirectory = "";
let originalStorageDirectory: string | undefined;
let originalConnectionString: string | undefined;
let originalAccountName: string | undefined;

afterEach(async () => {
  if (temporaryStorageDirectory) await rm(temporaryStorageDirectory, { force: true, recursive: true });
  if (originalStorageDirectory === undefined) delete process.env.PRIVATE_STORAGE_DIRECTORY;
  else process.env.PRIVATE_STORAGE_DIRECTORY = originalStorageDirectory;
  if (originalConnectionString === undefined) delete process.env.AZURE_STORAGE_CONNECTION_STRING;
  else process.env.AZURE_STORAGE_CONNECTION_STRING = originalConnectionString;
  if (originalAccountName === undefined) delete process.env.AZURE_STORAGE_ACCOUNT_NAME;
  else process.env.AZURE_STORAGE_ACCOUNT_NAME = originalAccountName;
});

describe("private storage errors", () => {
  it("recognizes missing Azure blobs for fallback delivery", () => {
    expect(isMissingPrivateFileError({ statusCode: 404 })).toBe(true);
    expect(isMissingPrivateFileError({ statusCode: 403 })).toBe(false);
    expect(isMissingPrivateFileError(new Error("network unavailable"))).toBe(false);
    expect(isMissingPrivateFileError(null)).toBe(false);
  });

  it("stores, reads, and deletes private files locally when Azure is not configured", async () => {
    originalStorageDirectory = process.env.PRIVATE_STORAGE_DIRECTORY;
    originalConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    originalAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    temporaryStorageDirectory = await mkdtemp(join(tmpdir(), "vactech-private-storage-"));
    process.env.PRIVATE_STORAGE_DIRECTORY = temporaryStorageDirectory;
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    delete process.env.AZURE_STORAGE_ACCOUNT_NAME;

    const key = "work-orders/test/original";
    await expect(storePrivateBuffer({ key, content: Buffer.from("private content"), contentType: "text/plain" })).resolves.toBe(true);
    await expect(readPrivateFile(key)).resolves.toEqual(Buffer.from("private content"));
    await expect(deletePrivateFile(key)).resolves.toBe(true);
    await expect(readPrivateFile(key)).resolves.toBeNull();
  });
});