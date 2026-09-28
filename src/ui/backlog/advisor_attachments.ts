// Advisor attachments: local files inlined into the advisor composer as
// fenced blocks. Every picked file is inlined, whole (ADR-0026, operator
// ruling 2026-09-28: models get their full context — no per-file character
// cut, no file-count limit). The text lands in the composer first, so the
// operator sees exactly what will be sent before sending it.

/** The part of a browser `File` this needs (testable without a DOM). */
export type AttachmentSource = { name?: string; text(): Promise<string> };

export async function inline_attachments(files: AttachmentSource[]): Promise<{ picked: string[]; text: string }> {
  const chunks: string[] = [];
  const picked: string[] = [];
  for (const f of files) {
    const name = String(f?.name || "").trim() || "attachment";
    picked.push(name);
    try {
      const raw = await f.text();
      chunks.push(`[attached file: ${name}]\n\n\`\`\`\n${raw}\n\`\`\``);
    } catch {
      chunks.push(`[attached file: ${name}] (unreadable in browser)`);
    }
  }
  return { picked, text: chunks.join("\n\n") };
}
