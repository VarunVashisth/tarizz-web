import { describe, expect, it } from "vitest";
import { legacyToTiptap, tiptapToLegacy } from "@/lib/tarizz-archive";

describe("Tarizz archive conversion", () => {
  it("converts legacy text to editor JSON", () => {
    const result = legacyToTiptap({ content: "Hello\nWorld", tags: { bold: ["1.0", "1.5"] } });
    expect(result.type).toBe("doc");
    expect(JSON.stringify(result)).toContain('"type":"bold"');
  });
  it("preserves readable text in a round trip", () => {
    const original = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Safe notes", marks: [{ type: "italic" }] }] }] };
    const legacy = tiptapToLegacy(original);
    expect(legacy.content).toBe("Safe notes");
    expect(legacy.tags.italic).toEqual(["1.0", "1.10"]);
  });
});
