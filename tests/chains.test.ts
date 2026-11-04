import { describe, expect, it } from "vitest";
import { expandPrompt, parseChainInput, validateCaptions } from "../lib/chains";

const step = { id: "11111111-0000-4000-8000-000000000001", name: "Caption", model: "default", systemPrompt: "Write captions.", userPrompt: "Use {{context}} and {{previous_output}}." };
describe("chain validation", () => {
  it("defaults to five captions and preserves step order", () => {
    const second = { ...step, id: "11111111-0000-4000-8000-000000000002", name: "Second" };
    const parsed = parseChainInput({ name: " Test ", steps: [second, step] });
    expect(parsed.caption_count).toBe(5);
    expect(parsed.name).toBe("Test");
    expect(parsed.steps.map((s) => s.name)).toEqual(["Second", "Caption"]);
  });
  it.each([0, 11, 2.5, "5", null])("rejects invalid caption count %s", (count) => {
    expect(() => parseChainInput({ name: "Test", steps: [step], caption_count: count })).toThrow();
  });
  it("rejects duplicate IDs, excess steps, unknown variables and arbitrary model URLs", () => {
    for (const steps of [[step, step], [], Array(7).fill(step), [{ ...step, userPrompt: "{{secret}}" }], [{ ...step, model: "https://example.com" }]]) {
      expect(() => parseChainInput({ name: "Test", steps })).toThrow();
    }
    expect(() => parseChainInput({ name: "Test", steps: [step], is_superadmin: true })).toThrow();
  });
  it("substitutes once without interpreting variables inside untrusted input", () => {
    expect(expandPrompt("{{context}} | {{previous_output}} | {{caption_count}}", { context: "literal {{previous_output}}", previous_output: "literal {{context}}", caption_count: 7 })).toBe("literal {{previous_output}} | literal {{context}} | 7");
  });
  it("requires the configured number of bounded distinct captions", () => {
    expect(validateCaptions({ captions: [" First ", "Second"] }, 2)).toEqual(["First", "Second"]);
    for (const captions of [["Same", " same "], ["Only"], ["", "Second"], ["x".repeat(241), "Second"]]) expect(() => validateCaptions({ captions }, 2)).toThrow();
  });
});
