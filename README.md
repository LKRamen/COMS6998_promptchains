# Quip Chains

An independent, superadmin-only prompt-chain studio built for COMS6998.

## Features

- Create, rename, update and delete chains.
- Add, edit, remove and move steps up/down; save all steps atomically with revision conflict checks.
- Run an uploaded image through 1–6 ordered Gemini prompts. Each step receives the previous output. The final step produces 1–10 captions, rendered as JPEG media.
- Browse saved media and inspect the original image and each step's output by chain/run.
- Light, dark and system appearance, persisted in the browser.
- A live first-pipeline walkthrough spotlights real controls, explains the handoff between steps, and waits for actual edits, additions, a successful save, image selection and generation results. Skip before starting, pause with Escape, or resume from the editor. Optional suggested prompts only fill the draft when clicked. Tutorial progress is account-scoped in this browser; unsaved drafts and selected files are not persisted across reloads.
- Google OAuth and a fresh `profiles.is_superadmin` check protect pages, actions, media, and database RPCs.

## Run locally

Use Node.js 24, `npm ci`, and copy `.env.example` to `.env.local` with your configured credentials. Set `APP_ORIGIN` to your exact app URL and allow its `/auth/callback` URL in Supabase Authentication. Then `npm run dev -- --port 3124`.

The migration in `supabase/chain-tool.sql` depends on the existing scoped project's `private.require_superadmin()` helper. It creates separate `chain_tool_*` tables and a private `chain-tool-media` bucket; existing public/admin pipelines remain separate. Apply migrations only through the repository-authorized Supabase server.

## Example chain

1. **Describe image** — Describe the visible scene in two concise sentences. Avoid guesses about identities.
2. **Find the joke** — Use `{{previous_output}}` to develop a short funny observation grounded in the image.
3. **Write captions** — Turn `{{previous_output}}` into `{{caption_count}}` distinct, short, funny captions.

`{{context}}` includes optional user context. The runtime adds the structured final-output contract automatically. Each generation uses a frozen saved revision; save edits before generating.

## Validation

`npm test`, `npm run test:database`, `npm run lint`, and `npm run build`.

Security coverage includes live-role rechecks, same-origin writes, revision conflicts, private media access, generation quotas, frozen snapshots and storage cleanup failures. The database suite runs in isolated PGlite, not the hosted project.

## Operational behavior

Chain deletion removes it from the active catalog while preserving historical runs. Runs have a five-minute lease, one concurrent run per account, and a limit of ten starts per hour. Failed generation is recorded without pretending to produce media. If completion cannot be confirmed, the UI directs the user to history instead of deleting potentially committed images. Storage cleanup failure can leave private unreferenced files for later operator review.

Provider credentials remain server-side. Deployment protection may be disabled for course review; application authorization is always enforced.
