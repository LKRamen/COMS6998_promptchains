// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ChainEditor from "../app/components/chain-editor";
import { guideKey } from "../app/components/chain-walkthrough";
import type { Chain } from "../lib/chains";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("scrollBy", vi.fn());
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => window.setTimeout(() => fn(0), 0));
  vi.stubGlobal("cancelAnimationFrame", window.clearTimeout);
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
const current = () => JSON.parse(localStorage.getItem(guideKey("tester"))!);
async function start() {
  render(<ChainEditor userId="tester" />);
  fireEvent.click(await screen.findByRole("button", { name: "Guide me through it →" }));
}
async function recipe() {
  await start();
  fireEvent.change(screen.getByLabelText("Chain name"), { target: { value: "First pipeline" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue →" }));
  for (let i = 0; i < 3; i++) {
    fireEvent.click(screen.getByRole("button", { name: "Use suggested prompt" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue →" }));
    if (i < 2) fireEvent.click(screen.getByRole("button", { name: "＋ Add step" }));
  }
}
it("allows skipping before starting, remembers the choice per account, and never changes the draft", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const view = render(<ChainEditor userId="tester" />);
  fireEvent.change(screen.getByLabelText("Chain name"), { target: { value: "My own draft" } });
  fireEvent.click(await screen.findByRole("button", { name: "Skip tutorial" }));
  expect((screen.getByLabelText("Chain name") as HTMLInputElement).value).toBe("My own draft");
  expect(current().stage).toBe(-1);
  expect(fetcher).not.toHaveBeenCalled();
  view.unmount(); render(<ChainEditor userId="tester" />);
  await waitFor(() => expect(screen.queryByRole("button", { name: "Guide me through it →" })).toBeNull());
  expect(screen.getByRole("button", { name: "Show me how to build a pipeline" })).toBeTruthy();
});
it("requires real field and add-step actions, and only saves the example after the user clicks Save", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Save failed" }) }); vi.stubGlobal("fetch", fetcher);
  await recipe();
  expect(current().stage).toBe(6);
  expect(screen.getByRole("button", { name: "Edit step 1: Describe the image" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Edit step 2: Find the funny angle" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Edit step 3: Write the captions" })).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save chain" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  await screen.findByRole("alert");
  expect(current().stage).toBe(6);
  expect(JSON.parse(fetcher.mock.calls[0][1].body).data.steps[1].userPrompt).toContain("{{previous_output}}");
});
it("does not advance an empty name and preserves edits when paused with Escape", async () => {
  await start();
  expect((screen.getByRole("button", { name: "Continue →" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Chain name"), { target: { value: "Keep this" } });
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.getByRole("button", { name: "Resume walkthrough" })).toBeTruthy();
  expect((screen.getByLabelText("Chain name") as HTMLInputElement).value).toBe("Keep this");
});
it("resumes on the saved chain after navigation, with file selection required again after reload", async () => {
  localStorage.setItem(guideKey("tester"), JSON.stringify({ stage: 8, chainId: "saved-id", paused: false }));
  const chain = { id: "saved-id", name: "Saved", description: "", version: 1, caption_count: 5, steps: [{ id: "step", name: "Captions", model: "default", systemPrompt: "Write captions", userPrompt: "Use the image" }] } as Chain;
  render(<ChainEditor userId="tester" firstChain={false} initialChain={chain} />);
  expect(await screen.findByText("Give your pipeline something to work with")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Guide me through it →" })).toBeNull();
});
it("does not auto-offer the guide to an experienced creator", async () => {
  render(<ChainEditor userId="tester" firstChain={false} />);
  await new Promise(resolve => setTimeout(resolve, 5));
  expect(screen.queryByRole("button", { name: "Guide me through it →" })).toBeNull();
});
it("waits for an actual prompt edit or suggestion before continuing", async () => {
  await start();
  fireEvent.change(screen.getByLabelText("Chain name"), { target: { value: "Test" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue →" }));
  expect((screen.getByRole("button", { name: "Continue →" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Use suggested prompt" }));
  expect((screen.getByRole("button", { name: "Continue →" }) as HTMLButtonElement).disabled).toBe(false);
});
it("pauses rather than applying a lesson to a different selected step", async () => {
  await recipe();
  fireEvent.click(screen.getByRole("button", { name: "← Back" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit step 1: Describe the image" }));
  expect(screen.queryByRole("button", { name: "Use suggested prompt" })).toBeNull();
  expect(screen.getByRole("button", { name: "Resume walkthrough" })).toBeTruthy();
});
it("keeps paused progress bound to the chain when the user saves", async () => {
  let savedChain: Chain;
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    savedChain = { ...JSON.parse(init.body).data, id: "saved-after-pause", version: 1 };
    return { ok: true, json: async () => ({ chain: savedChain }) };
  }));
  await recipe();
  fireEvent.click(screen.getByRole("button", { name: "Pause / exit" }));
  fireEvent.click(screen.getByRole("button", { name: "Save chain" }));
  await waitFor(() => expect(current().chainId).toBe("saved-after-pause"));
  expect(current().paused).toBe(true);
  cleanup(); render(<ChainEditor userId="tester" firstChain={false} initialChain={savedChain!}/>);
  fireEvent.click(await screen.findByRole("button", { name: "Resume walkthrough" }));
  expect(screen.getByText("Give your pipeline something to work with")).toBeTruthy();
});
it("waits for successful generation and keeps the result milestone when paused during the request", async () => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() }));
  let finish!: (value: unknown) => void;
  const fetcher = vi.fn(async (url, init) => {
    if (url === "/api/chains") return { ok: true, json: async () => ({ chain: { ...JSON.parse(init.body).data, id: "generated-chain", version: 1 } }) };
    return new Promise(resolve => { finish = resolve; });
  });
  vi.stubGlobal("fetch", fetcher);
  await recipe();
  fireEvent.click(screen.getByRole("button", { name: "Save chain" }));
  await waitFor(() => expect(current().stage).toBe(7));
  fireEvent.change(screen.getByLabelText("Source image"), { target: { files: [new File(["image"], "photo.jpg", { type: "image/jpeg" })] } });
  expect(current().stage).toBe(8);
  fireEvent.submit(screen.getByRole("button", { name: "Generate 5 captions →" }).closest("form")!);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(current().stage).toBe(8);
  fireEvent.click(screen.getByRole("button", { name: "Pause / exit" }));
  finish({ ok: true, json: async () => ({ run: { id: "run", chain_version: 1, created_at: "2026-11-04T12:00:00Z", status: "succeeded", captions: ["A result"], traces: [] } }) });
  await waitFor(() => expect(current().stage).toBe(9));
  expect(current().paused).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Resume walkthrough" }));
  expect(screen.getByRole("button", { name: "Finish walkthrough ✓" })).toBeTruthy();
});
