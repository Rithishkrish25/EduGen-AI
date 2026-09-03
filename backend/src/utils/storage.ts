import crypto from "crypto";
import fs from "fs";
import path from "path";
import { env } from "../config/env";

const uploadDirAbsolute = path.resolve(process.cwd(), env.uploadDir);

export function getUploadDir(): string {
  return uploadDirAbsolute;
}

export function ensureUploadDir(): void {
  if (!fs.existsSync(uploadDirAbsolute)) {
    fs.mkdirSync(uploadDirAbsolute, { recursive: true });
  }
}

export function generateStoredFileName(originalFileName: string): string {
  const ext = path.extname(originalFileName).toLowerCase();
  return `${crypto.randomUUID()}${ext}`;
}

export function resolveStoragePath(storedFileName: string): string {
  const resolved = path.resolve(uploadDirAbsolute, storedFileName);

  if (!resolved.startsWith(uploadDirAbsolute)) {
    throw new Error("Invalid storage path");
  }

  return resolved;
}

export async function deleteStoredFile(storagePath: string): Promise<void> {
  try {
    await fs.promises.unlink(storagePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
