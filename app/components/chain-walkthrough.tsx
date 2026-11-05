"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GuideProgress = { stage: number; chainId: string; paused: boolean };
export const guideKey = (userId: string) => `quip-chain-walkthrough-v1:${userId}`;
export const lessons = [
  { target: "name", title: "Give your pipeline a name", text: "A pipeline is a chain of AI instructions. We’ll build one that describes an image, finds a joke, then writes captions. Name yours—for example, Everyday absurdity.", action: "Enter a name, then continue." },
  { target: "prompt", title: "1. First, understand the image", text: "This step should describe what’s visible. Its answer becomes the material for the next step. Use the suggested instruction or write your own in Task and input.", action: "Edit the real prompt, then continue." },
  { target: "add", title: "Hand the description to another step", text: "The list runs from top to bottom. Click Add step to give the next AI instruction a place after the description.", action: "Click Add step in the editor." },
  { target: "prompt", title: "2. Find the funny angle", text: "{{previous_output}} inserts the description from step 1 automatically. Ask this step to turn it into a funny observation—not the final captions yet.", action: "Edit this step’s prompt, then continue." },
  { target: "add", title: "Add the final link", text: "You now have an image description and a funny angle. Add one more step to turn that angle into captions.", action: "Click Add step in the editor." },
  { target: "prompt", title: "3. Write the captions", text: "This final step receives the previous step’s answer. {{caption_count}} uses the number you chose above. The last step always produces captions; earlier steps produce text for the next step.", action: "Edit the final prompt, then continue." },
  { target: "save", title: "Save the recipe before running it", text: "Saving stores your instructions and their order as a revision. It does not call the AI. You can change the prompts later and compare the results.", action: "Click Save chain. We’ll wait until it succeeds." },
  { target: "upload", title: "Give your pipeline something to work with", text: "Choose an image from your computer. Every step sees this image, and each step after the first also receives the previous answer. Uploading alone does not start generation.", action: "Choose a JPEG, PNG or WebP image." },
  { target: "generate", title: "Run the steps, in order", text: "Click Generate to make a real AI request using your saved pipeline and selected image. The result of each step feeds the next. This can take a little while.", action: "Click Generate when you’re ready." },
  { target: "results", title: "You made your first pipeline", text: "These are your actual results. Open Source image & step details to see how each answer led to the next. Your images and prompts are saved in this chain’s media history.", action: "Try changing a prompt next, save, and compare another run." },
];

export function useChainWalkthrough(userId: string, chainId: string | undefined, eligible: boolean) {
  const [progress, setProgress] = useState<GuideProgress | null>(null);
  const [welcome, setWelcome] = useState(false);
  const current = useRef<GuideProgress | null>(null);
  const storageKey = guideKey(userId);
  const persist = useCallback((value: GuideProgress) => {
    current.current = value;
    setProgress(value);
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* The guide also works without browser storage. */ }
  }, [storageKey]);

  useEffect(() => {
    // Read browser preferences after hydration. Never store prompts or image data.
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const saved = JSON.parse(raw) as GuideProgress;
          if (Number.isInteger(saved.stage) && saved.stage >= 0 && saved.stage <= 9 && saved.chainId === (chainId ?? "new")) {
            // Unsaved fields and file selections do not survive navigation/reload.
            const restored = { ...saved, stage: chainId ? Math.min(saved.stage, 7) : 0, paused: saved.paused === true };
            current.current = restored;
            setProgress(restored);
          }
          return;
        }
      } catch { /* Invalid or unavailable storage must not block the editor. */ }
      if (eligible && !chainId) setWelcome(true);
    }, 0);
    return () => window.clearTimeout(timer);
    // A save changes the chain ID in place; persist() already carries its progress forward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const start = () => { setWelcome(false); persist({ stage: 0, chainId: chainId ?? "new", paused: false }); };
  const skip = () => { setWelcome(false); persist({ stage: -1, chainId: chainId ?? "new", paused: true }); };
  const advance = (stage: number, savedId?: string) => {
    const value = current.current;
    if (value && !value.paused) persist({ ...value, stage, chainId: savedId ?? value.chainId });
  };
  const pause = useCallback(() => {
    if (current.current) persist({ ...current.current, paused: true });
  }, [persist]);
  const resume = () => { if (current.current) persist({ ...current.current, paused: false }); };
  const reorient = () => {
    if (current.current && current.current.stage >= 0) persist({ ...current.current, stage: 0, paused: true });
  };
  const saved = (id: string) => {
    if (current.current && current.current.stage >= 0) persist({ ...current.current, chainId: id, stage: 7 });
  };
  const generated = () => {
    if (current.current && current.current.stage >= 0) persist({ ...current.current, stage: 9 });
  };
  const active = !!progress && !progress.paused && progress.stage >= 0;
  return { progress, welcome, active, start, skip, advance, pause, resume, reorient, saved, generated };
}

type Guide = ReturnType<typeof useChainWalkthrough>;
export default function ChainWalkthrough({ guide, canContinue, onContinue, onBack, onSuggestion, error, busy }: {
  guide: Guide; canContinue: boolean; onContinue: () => void; onBack: () => void;
  onSuggestion?: () => void; error: string; busy: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const stage = guide.progress?.stage ?? 0;
  const lesson = lessons[stage];
  const { active, pause } = guide;
  useEffect(() => {
    if (!active || !lesson) return;
    const target = document.querySelector<HTMLElement>(`[data-guide="${lesson.target}"]`);
    if (!target) return;
    const previousDescription = target.getAttribute("aria-describedby");
    target.setAttribute("aria-describedby", "guide-explanation");
    let frame = 0;
    const measure = () => {
      const bounds = target.getBoundingClientRect();
      setRect({ top: bounds.top - 6, left: Math.max(4, bounds.left - 6), width: Math.min(bounds.width + 12, window.innerWidth - 8), height: bounds.height + 12 });
    };
    const position = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const fitTarget = () => {
      const bounds = target.getBoundingClientRect();
      const reserved = (panel.current?.getBoundingClientRect().height ?? 280) + 36;
      const available = window.innerHeight - reserved;
      if (bounds.top < 40 || bounds.bottom > available) window.scrollBy({ top: bounds.top - Math.max(32, (available - bounds.height) / 2), behavior: "instant" });
      measure();
    };
    const resized = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fitTarget); };
    const initial = requestAnimationFrame(() => {
      if (window.innerWidth > 680 && target.matches("input,textarea,button")) target.focus({ preventScroll: true });
      else panel.current?.focus({ preventScroll: true });
      fitTarget();
    });
    const observer = new ResizeObserver(position);
    observer.observe(target);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", resized);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") pause(); };
    window.addEventListener("keydown", escape);
    return () => { if (previousDescription) target.setAttribute("aria-describedby", previousDescription); else target.removeAttribute("aria-describedby"); cancelAnimationFrame(initial); cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("scroll", position, true); window.removeEventListener("resize", resized); window.removeEventListener("keydown", escape); };
  }, [active, lesson, pause]);

  if (guide.welcome) return <section className="guide-welcome" aria-labelledby="guide-welcome-title">
    <div><span className="eyebrow">YOUR FIRST PIPELINE · LEARN BY DOING</span><h2 id="guide-welcome-title">Let’s make your first chain together.</h2><p>We’ll highlight what to click as you build a real image → idea → captions pipeline. You stay in control of every save and AI request.</p></div>
    <div className="guide-welcome-actions"><button className="button primary" type="button" onClick={guide.start}>Guide me through it →</button><button className="text-button" type="button" onClick={guide.skip}>Skip tutorial</button></div>
  </section>;
  if (!guide.active || !lesson) return <div className="guide-launch"><button type="button" className="text-link text-button" onClick={guide.progress && guide.progress.stage >= 0 ? guide.resume : guide.start}>{guide.progress && guide.progress.stage >= 0 ? "Resume walkthrough" : "Show me how to build a pipeline"}</button></div>;
  return <>
    {rect && <div className="guide-spotlight" aria-hidden="true" style={rect}><span>{stage + 1}</span></div>}
    <aside ref={panel} tabIndex={-1} className="guide-panel" aria-label="Live pipeline walkthrough">
      <div className="guide-panel-top"><span className="eyebrow">LIVE WALKTHROUGH · {stage + 1} / {lessons.length}</span><button type="button" className="text-button" onClick={guide.pause}>Pause / exit</button></div>
      <div className="guide-progress" aria-hidden="true">{lessons.map((_,i)=><i key={i} className={i<=stage?"reached":""}/>)}</div>
      <div key={stage} id="guide-explanation" className="guide-annotation" aria-live="polite"><h2>{lesson.title}</h2><p>{lesson.text}</p><strong>{busy ? "Working… You can leave the guide open." : lesson.action}</strong></div>
      {error && <p className="guide-error" role="status">{error} Your progress is kept; fix the issue and try again.</p>}
      <div className="guide-actions">
        {stage>0 && <button type="button" className="text-button" onClick={onBack} disabled={busy}>← Back</button>}
        {onSuggestion && <button type="button" className="button" onClick={onSuggestion} disabled={busy}>Use suggested prompt</button>}
        {[0,1,3,5].includes(stage) && <button type="button" className="button primary" disabled={!canContinue || busy} onClick={onContinue}>Continue →</button>}
        {stage===9 && <button type="button" className="button primary" onClick={guide.skip}>Finish walkthrough ✓</button>}
      </div>
      <p className="guide-footnote">You’re editing your actual pipeline. Press Esc to pause.</p>
    </aside>
  </>;
}
