import multer, { FileFilterCallback, MulterError } from "multer";
import { Request, Response } from "express";
import { env } from "../config/env";
import { PayloadTooLargeError, UnsupportedMediaTypeError } from "../utils/errors";
import { ensureUploadDir, generateStoredFileName, getUploadDir } from "../utils/storage";

const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".pptx", ".txt"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
]);

function getExtension(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index === -1 ? "" : fileName.slice(index).toLowerCase();
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    ensureUploadDir();
    callback(null, getUploadDir());
  },
  filename: (_req, file, callback) => {
    callback(null, generateStoredFileName(file.originalname));
  },
});

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback
): void {
  const extension = getExtension(file.originalname);

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    callback(new UnsupportedMediaTypeError("Unsupported file type"));
    return;
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    callback(new UnsupportedMediaTypeError("Unsupported file type"));
    return;
  }

  callback(null, true);
}

const documentUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.maxFileSizeMb * 1024 * 1024,
  },
});

export function runDocumentUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    documentUpload.single("file")(req, res, (error: unknown) => {
      if (!error) {
        resolve();
        return;
      }

      if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
        reject(
          new PayloadTooLargeError(
            `File exceeds the maximum allowed size of ${env.maxFileSizeMb}MB`
          )
        );
        return;
      }

      reject(error);
    });
  });
}
