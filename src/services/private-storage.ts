import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

function getContainerClient(): ContainerClient | null {
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  if (!containerName || (!connectionString && !accountName)) {
    return null;
  }

  if (connectionString) {
    return BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
  }

  return new BlobServiceClient(
    `https://${accountName!}.blob.core.windows.net`,
    new DefaultAzureCredential(),
  ).getContainerClient(containerName);
}

function localStoragePath(key: string) {
  const storageDirectory = resolve(/* turbopackIgnore: true */ process.cwd(), process.env.PRIVATE_STORAGE_DIRECTORY || ".data/private-storage");
  const filePath = resolve(/* turbopackIgnore: true */ storageDirectory, key);
  const filePathRelativeToStorage = relative(storageDirectory, filePath);
  if (filePathRelativeToStorage.startsWith("..") || isAbsolute(filePathRelativeToStorage)) {
    throw new Error("Invalid private storage key.");
  }
  return filePath;
}

export async function storePrivateFile(input: {
  key: string;
  file: File;
}) {
  return storePrivateBuffer({
    key: input.key,
    content: Buffer.from(await input.file.arrayBuffer()),
    contentType: input.file.type,
  });
}

export async function storePrivateBuffer(input: {
  key: string;
  content: Buffer;
  contentType: string;
  /** Store in the low-cost archive tier. The file can't be read directly; see startArchivedFileRetrieval. */
  archive?: boolean;
}) {
  const container = getContainerClient();
  if (container) {
    await container.getBlockBlobClient(input.key).uploadData(input.content, {
      blobHTTPHeaders: { blobContentType: input.contentType },
      ...(input.archive ? { tier: "Archive" } : {}),
    });
    return true;
  }
  const filePath = localStoragePath(input.key);
  await mkdir(resolve(/* turbopackIgnore: true */ filePath, ".."), { recursive: true });
  await writeFile(filePath, input.content);
  return true;
}

export function isMissingPrivateFileError(error: unknown) {
  return typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 404;
}

export async function readPrivateFile(key: string) {
  const container = getContainerClient();
  if (!container) {
    try {
      return await readFile(localStoragePath(key));
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  }

  try {
    return await container.getBlobClient(key).downloadToBuffer();
  } catch (error) {
    if (isMissingPrivateFileError(error)) return null;
    throw error;
  }
}

export async function deletePrivateFile(key: string) {
  const container = getContainerClient();
  if (container) {
    await container.getBlobClient(key).deleteIfExists();
    return true;
  }
  await rm(localStoragePath(key), { force: true });
  return true;
}

export type PrivateFileState = "missing" | "archived" | "retrieving" | "available";

/**
 * Whether a file can be read now. Archived files can't; a retrieved copy is "retrieving"
 * while Azure brings it out of the archive, which takes up to 15 hours.
 */
export async function privateFileState(key: string): Promise<PrivateFileState> {
  const container = getContainerClient();
  if (!container) {
    // Local development storage has no archive tier, so a stored file is always readable.
    try {
      await stat(localStoragePath(key));
      return "available";
    } catch {
      return "missing";
    }
  }
  try {
    const properties = await container.getBlobClient(key).getProperties();
    if (properties.archiveStatus) return "retrieving";
    return properties.accessTier === "Archive" ? "archived" : "available";
  } catch (error) {
    if (isMissingPrivateFileError(error)) return "missing";
    throw error;
  }
}

/**
 * Starts copying an archived file to a readable one at destinationKey. The archived file
 * stays archived. Azure finishes the copy in the background, so poll privateFileState on
 * the destination.
 */
export async function startArchivedFileRetrieval(sourceKey: string, destinationKey: string) {
  const container = getContainerClient();
  if (!container) {
    const destination = localStoragePath(destinationKey);
    await mkdir(resolve(/* turbopackIgnore: true */ destination, ".."), { recursive: true });
    await copyFile(localStoragePath(sourceKey), destination);
    return;
  }
  await container.getBlobClient(destinationKey).beginCopyFromURL(container.getBlobClient(sourceKey).url, { tier: "Hot", rehydratePriority: "Standard" });
}
