export type ChainStep = {
  id: string;
  name: string;
  systemPrompt: string;
  userPrompt: string;
  model: string;
};
export type ChainInput = { name: string; description: string; steps: ChainStep[]; caption_count: number };
export type Chain = ChainInput & {
  id: string; version: number; created_by: string;
  created_at: string; updated_at: string; deleted_at: string | null;
};
export type ChainTrace = { name: string; model: string; systemPrompt: string; userPrompt: string; output: string };
export type ChainResult = { captions: string[]; traces: ChainTrace[] };
export type ChainRun = ChainResult & {
  id: string; chain_id: string; chain_version: number;
  snapshot: ChainInput & { id: string; version: number };
  status: "pending" | "succeeded" | "failed";
  context: string; input_path: string; output_paths: string[];
  error: string | null; created_by: string; created_at: string;
  finished_at: string | null; lease_expires_at: string;
};
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MODEL_PATTERN = /^gemini-[a-zA-Z0-9._-]{1,100}$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Enter a valid chain.");
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, max: number, optional = false) {
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  const result = value.trim();
  if ((!optional && !result) || result.length > max) throw new Error(`${field} must be ${optional ? "0" : "1"}–${max} characters.`);
  return result;
}
function onlyKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error("Unknown chain field.");
}
export function parseChainInput(value: unknown): ChainInput {
  const data = object(value);
  onlyKeys(data, ["name", "description", "steps", "caption_count"]);
  const caption_count = data.caption_count === undefined ? 5 : data.caption_count;
  if (!Number.isInteger(caption_count) || Number(caption_count) < 1 || Number(caption_count) > 10) throw new Error("Choose 1–10 captions.");
  if (!Array.isArray(data.steps) || data.steps.length < 1 || data.steps.length > 6) throw new Error("A chain needs 1–6 steps.");
  const ids = new Set<string>();
  const steps = data.steps.map((raw, index): ChainStep => {
    const step = object(raw);
    onlyKeys(step, ["id", "name", "systemPrompt", "userPrompt", "model"]);
    if (typeof step.id !== "string" || !UUID_PATTERN.test(step.id) || ids.has(step.id.toLowerCase())) throw new Error("Every step needs a unique ID.");
    ids.add(step.id.toLowerCase());
    if (typeof step.model !== "string" || (step.model !== "default" && !MODEL_PATTERN.test(step.model))) throw new Error(`Choose a Gemini model for step ${index + 1}.`);
    const systemPrompt = text(step.systemPrompt, "System prompt", 8000);
    const userPrompt = text(step.userPrompt, "User prompt", 8000);
    for (const prompt of [systemPrompt, userPrompt]) {
      for (const token of prompt.matchAll(/\{\{([^{}]+)\}\}/g)) {
        if (!["context", "previous_output", "caption_count"].includes(token[1])) throw new Error(`Unknown prompt variable: ${token[1]}.`);
      }
    }
    return { id: step.id.toLowerCase(), name: text(step.name, "Step name", 120), model: step.model, systemPrompt, userPrompt };
  });
  return { name: text(data.name, "Chain name", 120), description: text(data.description === undefined ? "" : data.description, "Description", 1000, true), caption_count: Number(caption_count), steps };
}

/** Replace only tokens in the template; inserted text is never interpreted again. */
export function expandPrompt(template: string, values: { context: string; previous_output: string; caption_count: number }): string {
  return template.replace(/\{\{(context|previous_output|caption_count)\}\}/g, (_, key: keyof typeof values) => String(values[key]));
}

export function validateCaptions(value: unknown, count: number): string[] {
  const data = object(value);
  if (!Array.isArray(data.captions) || data.captions.length !== count) throw new Error(`Expected exactly ${count} captions.`);
  const captions = data.captions.map((caption) => text(caption, "Caption", 240));
  if (new Set(captions.map((caption) => caption.toLowerCase())).size !== count) throw new Error("Captions must be distinct.");
  return captions;
}
