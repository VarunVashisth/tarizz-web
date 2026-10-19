import { describe, expect, it } from "vitest";
import { MiB, UPLOAD_LIMITS, formatBytes, validateAttachment } from "../lib/upload-policy";

describe("attachment policy", () => {
  it("accepts supported files within their limit", () => {
    expect(validateAttachment({ name: "notes.pdf", type: "application/pdf", size: 4 * MiB })).toBeNull();
    expect(validateAttachment({ name: "photo.jpg", type: "image/jpeg", size: 12 * MiB })).toBeNull();
  });

  it("rejects unsafe types and oversized sources", () => {
    expect(validateAttachment({ name: "script.html", type: "text/html", size: 200 })).toContain("not allowed");
    expect(validateAttachment({ name: "huge.png", type: "image/png", size: UPLOAD_LIMITS.imageSourceBytes + 1 })).toContain("15.0 MB");
    expect(validateAttachment({ name: "huge.pdf", type: "application/pdf", size: UPLOAD_LIMITS.attachmentBytes + 1 })).toContain("20.0 MB");
  });

  it("formats user-facing limits", () => {
    expect(formatBytes(UPLOAD_LIMITS.importBytes)).toBe("100.0 MB");
  });
});

