import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
}) {
  const container = getContainerClient();
  if (container) {
    await container.getBlockBlobClient(input.key).uploadData(input.content, {
      blobHTTPHeaders: { blobContentType: input.contentType },
    });
    return true;
  }
  const filePath = localStoragePath(input.key);
  await mkdir(resolve(/* turbopackIgnore: true */ filePath, ".."), { recursive: true });
  await writeFile(filePath, input.content);
  return true;
}

export const storePrivatePhoto = storePrivateFile;

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
