import { describe, expect, it } from "vitest";

import { inline_attachments } from "./advisor_attachments";

const file = (name: string, body: string) => ({ name, text: async () => body });

describe("inline_attachments (ADR-0026: whole files, every file)", () => {
  it("inlines a file far past the old 20,000-char cut whole, with no truncation marker", async () => {
    const body = "line\n".repeat(12_000); // 60,000 chars
    const { text } = await inline_attachments([file("big.log", body)]);
    expect(text).toContain(body);
    expect(text).not.toContain("truncated");
  });

  it("inlines every picked file (the old limit kept 6)", async () => {
    const files = Array.from({ length: 9 }, (_, i) => file(`f${i + 1}.md`, `content ${i + 1}`));
    const { picked, text } = await inline_attachments(files);
    expect(picked).toEqual(files.map((f) => f.name));
    for (let i = 1; i <= 9; i++) expect(text).toContain(`[attached file: f${i}.md]\n\n\`\`\`\ncontent ${i}\n\`\`\``);
  });

  it("names an unreadable file instead of dropping it", async () => {
    const { text } = await inline_attachments([{ name: "bin.dat", text: async () => Promise.reject(new Error("nope")) }]);
    expect(text).toBe("[attached file: bin.dat] (unreadable in browser)");
  });
});
