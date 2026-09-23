import { describe, expect, it } from "vitest";

import { voice_request_fields, resolve_default_voice_fields, speakable_text, EMPTY_VOICE_OVERRIDE } from "./voice_settings";

describe("voice_request_fields (operator dm 130: override → synthesis fields)", () => {
  it("off = gateway default: no provider/model/voice, quality only if set", () => {
    expect(voice_request_fields(EMPTY_VOICE_OVERRIDE)).toEqual({});
    expect(voice_request_fields({ enabled: false, quality_preset: "high" })).toEqual({ quality_preset: "high" });
    // Disabled override drops provider/model/voice even when present.
    expect(voice_request_fields({ enabled: false, provider: "p", voice: "v" })).toEqual({});
  });

  it("on = the set fields flow; empty fields fall through to the default", () => {
    expect(voice_request_fields({ enabled: true, provider: "openai", model: "tts-1", voice: "cloned-x", quality_preset: "standard" })).toEqual({
      provider: "openai",
      model: "tts-1",
      voice: "cloned-x",
      quality_preset: "standard",
    });
    expect(voice_request_fields({ enabled: true, provider: "  ", voice: "v" })).toEqual({ voice: "v" });
  });

  it("null/undefined override = empty", () => {
    expect(voice_request_fields(null)).toEqual({});
    expect(voice_request_fields(undefined)).toEqual({});
  });
});

describe("resolve_default_voice_fields (dm 133: send the operator's configured default explicitly)", () => {
  it("reads the configured output.voice(.tts) row: provider/model/options.voice", () => {
    const payload = {
      routes: [
        { key: "output.text", configured: true, provider: "openai", model: "gpt-4o" },
        { key: "output.voice", configured: true, provider: "supertonic", model: "supertonic-3", options: { voice: "M2" } },
      ],
    };
    expect(resolve_default_voice_fields(payload)).toEqual({ provider: "supertonic", model: "supertonic-3", voice: "M2" });
  });

  it("prefers the more specific output.voice.tts row when both exist", () => {
    const payload = {
      routes: [
        { key: "output.voice", configured: true, provider: "supertonic", model: "supertonic-3" },
        { key: "output.voice.tts", configured: true, provider: "piper", model: "en_US" },
      ],
    };
    expect(resolve_default_voice_fields(payload)).toEqual({ provider: "piper", model: "en_US" });
  });

  it("returns {} when nothing is configured — never fabricates a selection", () => {
    expect(resolve_default_voice_fields({ routes: [{ key: "output.voice", configured: false, provider: "supertonic" }] })).toEqual({});
    expect(resolve_default_voice_fields({ routes: [] })).toEqual({});
    expect(resolve_default_voice_fields(null)).toEqual({});
    expect(resolve_default_voice_fields({})).toEqual({});
  });
});

describe("speakable_text (markdown → readable plain text)", () => {
  it("strips fences, links (keeps text), inline code, headings, list/quote marks, emphasis", () => {
    const md = [
      "# Section",
      "",
      "See **bold** and `code` and [the docs](https://x.dev).",
      "",
      "```js",
      "ignored();",
      "```",
      "",
      "- item one",
      "1. numbered",
      "> quoted line",
    ].join("\n");
    const out = speakable_text(md);
    expect(out).toContain("Section");
    expect(out).toContain("See bold and code and the docs.");
    expect(out).toContain("item one");
    expect(out).toContain("numbered");
    expect(out).toContain("quoted line");
    // Fence content is dropped; no markdown marks survive.
    expect(out).not.toContain("ignored");
    expect(out).not.toContain("```");
    expect(out).not.toContain("**");
    expect(out).not.toContain("[the docs]");
    expect(out).not.toContain("#");
  });

  it("collapses whitespace and returns empty for empty input", () => {
    expect(speakable_text("")).toBe("");
    expect(speakable_text("a\n\n\n   b")).toBe("a b");
  });

  it("keeps snake_case identifiers intact (does not eat interior underscores)", () => {
    expect(speakable_text("open voice_settings_panel and team_page now")).toBe("open voice_settings_panel and team_page now");
    // But real _emphasis_ at word boundaries still unwraps.
    expect(speakable_text("this is _important_ today")).toBe("this is important today");
  });

  it("strips table pipes into readable pauses", () => {
    expect(speakable_text("| a | b |")).toBe("a , b");
  });
});
