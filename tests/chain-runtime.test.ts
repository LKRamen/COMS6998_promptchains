import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { runChain } from "../lib/chain-runtime";

const step = { id: "11111111-0000-4000-8000-000000000001", name: "Describe", model: "default", systemPrompt: "Look at the photo.", userPrompt: "{{context}}" };
const next = { ...step, id: "11111111-0000-4000-8000-000000000002", name: "Caption", model: "gemini-2.5-flash", userPrompt: "Use {{previous_output}} to write {{caption_count}} captions." };
const captions = ["Caption one", "Caption two", "Caption three", "Caption four", "Caption five"];
function response(output: string, finishReason = "STOP") {
  return new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text: output }] } }] }), { status: 200 });
}
function setup() { vi.stubEnv("GEMINI_API_KEY", "test-only-key"); vi.stubEnv("GEMINI_MODEL", "gemini-2.5-flash"); }
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("feeds the image to each step, substitutes previous output once and uses configured caption count", async () => {
  setup();
  const fetcher = vi.fn().mockResolvedValueOnce(response("A dog. Literal {{context}} remains data.")).mockResolvedValueOnce(response(JSON.stringify({ captions })));
  vi.stubGlobal("fetch", fetcher);
  const result = await runChain({ steps: [step, next], image: Buffer.from("jpeg bytes"), context: "A park", captionCount: 5 });
  expect(result.captions).toEqual(captions);
  expect(result.traces).toHaveLength(2);
  const bodies = fetcher.mock.calls.map(([, options]) => JSON.parse(options.body));
  for (const body of bodies) expect(body.contents[0].parts[1].inlineData).toEqual({ mimeType: "image/jpeg", data: Buffer.from("jpeg bytes").toString("base64") });
  expect(result.traces[1].userPrompt).toContain("A dog. Literal {{context}} remains data.");
  expect(bodies[1].generationConfig.responseSchema.properties.captions.minItems).toBe(5);
  expect(bodies[0].generationConfig.responseSchema).toBeUndefined();
  expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});

it("stops immediately after provider errors without exposing provider payloads", async () => {
  setup();
  const fetcher = vi.fn().mockResolvedValue(new Response("secret provider internals", { status: 500 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(runChain({ steps: [step, next], image: Buffer.from("image"), context: "", captionCount: 5 })).rejects.toThrow("provider could not run step 1");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("rejects incomplete, duplicate and wrong-count final captions", async () => {
  setup();
  for (const reply of [response(JSON.stringify({ captions }), "MAX_TOKENS"), response(JSON.stringify({ captions: ["Same", "same"] })), response(JSON.stringify({ captions: ["Only"] }))]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply));
    await expect(runChain({ steps: [step], image: Buffer.from("image"), context: "", captionCount: 2 })).rejects.toThrow("valid, distinct captions");
  }
});

it("bounds intermediate output and expanded prompts before the next provider call", async () => {
  setup();
  const hugeOutput = vi.fn().mockResolvedValue(response("x".repeat(8001)));
  vi.stubGlobal("fetch", hugeOutput);
  await expect(runChain({ steps: [step, next], image: Buffer.from("image"), context: "", captionCount: 5 })).rejects.toThrow("usable text response");
  expect(hugeOutput).toHaveBeenCalledTimes(1);
  const expansion = vi.fn().mockResolvedValueOnce(response("x".repeat(8000)));
  vi.stubGlobal("fetch", expansion);
  await expect(runChain({ steps: [step, { ...next, systemPrompt: "{{previous_output}}".repeat(3) }], image: Buffer.from("image"), context: "", captionCount: 5 })).rejects.toThrow("too much text");
  expect(expansion).toHaveBeenCalledTimes(1);
});

it("does not call a provider for missing configuration or invalid inputs", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); vi.stubEnv("GEMINI_API_KEY", "");
  await expect(runChain({ steps: [step], image: Buffer.from("image"), context: "", captionCount: 5 })).rejects.toThrow("not configured");
  setup();
  await expect(runChain({ steps: [step], image: Buffer.alloc(0), context: "", captionCount: 5 })).rejects.toThrow("image");
  expect(fetcher).not.toHaveBeenCalled();
});
