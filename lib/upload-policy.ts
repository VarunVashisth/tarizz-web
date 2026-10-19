export const MiB = 1024 * 1024;

export const UPLOAD_LIMITS = {
  imageSourceBytes: 15 * MiB,
  attachmentBytes: 20 * MiB,
  importBytes: 100 * MiB,
  importExpandedBytes: 200 * MiB,
  importFiles: 1000,
  importNodes: 500,
  filenameLength: 180,
} as const;

export const IMAGE_OUTPUT = {
  preview: { maxDimension: 1280, quality: 0.7 },
  download: { maxDimension: 2560, quality: 0.86 },
} as const;

export const ALLOWED_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MiB) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / MiB).toFixed(1)} MB`;
}

export function validateAttachment(file: Pick<File, "name" | "type" | "size">) {
  if (!(ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(file.type)) {
    return "That file type is not allowed.";
  }
  const limit = file.type.startsWith("image/") && file.type !== "image/gif"
    ? UPLOAD_LIMITS.imageSourceBytes
    : UPLOAD_LIMITS.attachmentBytes;
  if (file.size > limit) return `This file is larger than the ${formatBytes(limit)} limit.`;
  if (file.name.length > UPLOAD_LIMITS.filenameLength) return "The filename is too long.";
  return null;
}

