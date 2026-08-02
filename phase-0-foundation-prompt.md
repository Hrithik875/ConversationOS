# ConversationOS — Phase 0: Foundation

**Repo:** https://github.com/Hrithik875/ConversationOS
**Phase goal:** Set up a production-grade project foundation. Nothing user-facing yet — this phase is purely tooling, scaffolding, and infrastructure that every later phase depends on.

---

## Context for the agent

ConversationOS is a privacy-first, offline-first conversation archive platform. It parses WhatsApp chat exports (.zip / .txt + media folder) and renders them in a WhatsApp-like UI, with local search and local AI features. Phase 1 target is a **Progressive Web App** — no backend, no server, no paid services. Everything must run entirely client-side and cost $0 to build and host.

This is a multi-phase project. This prompt covers **Phase 0 only**. Do not implement Vault, Import, Chat Viewer, Search, or any other feature described in future phases — even if it seems convenient to start early. Stay strictly inside this phase's scope.

---

## Tech stack (lock these in — do not substitute alternatives without asking)

- **Package manager:** pnpm
- **Framework:** React 19 + TypeScript + Vite
- **Styling:** TailwindCSS + shadcn/ui + Radix UI primitives
- **Animation:** Framer Motion
- **State management:** Zustand (no Redux)
- **Routing:** React Router v6
- **PWA:** vite-plugin-pwa
- **Local storage (setup only, not used yet):** Dexie.js (IndexedDB wrapper) for structured data; OPFS for media blobs later
- **Linting/formatting:** ESLint + Prettier + Husky (pre-commit hook) + lint-staged
- **CI:** GitHub Actions (free tier — public repo)
- **License:** MPL-2.0

---

## Tasks

### Task 1 — Project scaffold
- Initialize a Vite + React + TypeScript project in the repo root.
- Configure absolute imports (`@/` → `src/`).
- Set up the following folder structure under `src/`:
  ```
  src/
    app/            # app shell, routing, providers
    modules/        # feature modules (empty for now, each future phase adds one)
    components/     # shared/reusable UI components
    lib/            # utilities, helpers
    stores/         # Zustand stores
    styles/         # global styles, theme tokens
    types/          # shared TypeScript types
  ```
- Add a `.gitignore` appropriate for a Node/Vite project (node_modules, dist, .env, etc.)

### Task 2 — Styling & theme engine skeleton
- Install and configure TailwindCSS.
- Install shadcn/ui and initialize it with a neutral base theme (do NOT copy WhatsApp's exact color palette/bubble shapes — establish a visually distinct but chat-app-appropriate identity; light green/teal family is fine as inspiration, not replication).
- Create a minimal theme engine: CSS variables for colors, spacing, radius, font-family, driven by a `ThemeProvider` in `src/app/`. Support light/dark mode toggle only for now (no AMOLED/custom themes yet — that's a later phase).
- No actual chat UI yet — just a placeholder landing screen that says "ConversationOS — Foundation" and shows the light/dark toggle working, to prove the theme engine functions.

### Task 3 — State management & routing skeleton
- Set up Zustand store structure (empty root store, documented pattern for adding feature stores later).
- Set up React Router with a placeholder route structure: `/` (landing/placeholder) and a `/app` route stub for where the real application shell will live in later phases.

### Task 4 — PWA configuration
- Configure vite-plugin-pwa: manifest.json (name: "ConversationOS", appropriate icons — generate simple placeholder icons if none exist), offline-capable service worker, installability.
- Verify the app is installable and works offline in a production build (`pnpm build && pnpm preview`).

### Task 5 — Local storage scaffolding (setup only, no usage yet)
- Install Dexie.js.
- Create `src/lib/db.ts` with an empty Dexie database class, versioned schema placeholder (no tables yet — just the scaffold and a comment explaining tables will be added per-feature in later phases).
- Do NOT implement OPFS usage yet — just note in code comments where it will be integrated (Phase 2, Media Manager).

### Task 6 — Code quality tooling
- ESLint (TypeScript + React rules) + Prettier, with a shared config.
- Husky pre-commit hook: run lint-staged (eslint --fix + prettier) on staged files.
- Add `pnpm lint`, `pnpm format`, `pnpm typecheck` scripts.

### Task 7 — CI pipeline
- GitHub Actions workflow (`.github/workflows/ci.yml`) that runs on every push and PR to `main`/`develop`:
  - Install deps (pnpm, cached)
  - Typecheck
  - Lint
  - Build
- Must be green before this phase is considered complete.

### Task 8 — Branching & repo hygiene
- Create a `develop` branch from `main`. All feature work in this and future phases branches off `develop` as `feature/<name>`, merges back to `develop`, and `main` stays release-only.
- Add branch protection notes to `CONTRIBUTING.md` (just document the convention — actual GitHub branch protection rules can be set manually by me later, don't attempt to configure repo settings via API).
- Add a root `README.md` with: project name, one-line tagline, current status ("Phase 0 — Foundation"), tech stack list, how to run locally (`pnpm install && pnpm dev`).
- Add `LICENSE` file (MPL-2.0 full text).

### Task 9 — Documentation file (READ CAREFULLY — this rule applies to every future phase too)
- Create a file at the repo root named `DOCUMENTATION.md`.
- This file is **append-only** across the entire project lifetime. Never overwrite or delete prior content in this file, in this phase or any future phase.
- At the end of this phase, append a new dated section:
  ```markdown
  ---
  ## Phase 0 — Foundation
  **Date:** <actual date>

  ### What was built
  <detailed description of every decision made, every package installed and why,
  folder structure rationale, any deviation from the prompt and why>

  ### Key decisions
  <e.g. why pnpm over npm, any config choices worth remembering>

  ### How to verify this phase
  <exact commands to run to confirm everything works>

  ### Known limitations / deferred items
  <anything intentionally not done, to be picked up in a later phase>
  ```
- Be genuinely thorough here — this file is the permanent project history and should read like real-world engineering documentation, not a changelog one-liner.

---

## Git workflow — feature-wise commits, NOT one giant commit

Push incrementally, one logical unit of work per commit, using Conventional Commits format:

1. `chore(scaffold): initialize vite + react + typescript project`
2. `chore(styling): configure tailwind, shadcn/ui, theme engine skeleton`
3. `chore(state): set up zustand store structure and react router skeleton`
4. `chore(pwa): configure vite-plugin-pwa with manifest and service worker`
5. `chore(storage): scaffold dexie database (no tables yet)`
6. `chore(tooling): add eslint, prettier, husky, lint-staged`
7. `chore(ci): add github actions ci workflow`
8. `docs: add readme, license, contributing, and initial documentation.md entry`

Each commit should be **pushed to `develop`** individually (not squashed into one push at the end). Do not push directly to `main`. Open one PR from `develop` → `main` at the end of the phase summarizing everything, but do not merge it — leave it open for my review.

---

## Validation checklist — agent must confirm ALL of these before declaring the phase complete

- [ ] `pnpm install` succeeds with no errors
- [ ] `pnpm dev` starts a working dev server showing the placeholder screen with functioning light/dark toggle
- [ ] `pnpm build` succeeds
- [ ] `pnpm preview` serves a working, installable PWA (verify manifest + service worker registration in browser devtools)
- [ ] `pnpm lint` passes with zero errors
- [ ] `pnpm typecheck` passes with zero errors
- [ ] GitHub Actions CI workflow is green on the `develop` branch
- [ ] `DOCUMENTATION.md` exists and contains a complete, honest Phase 0 entry
- [ ] Each task above was pushed as its own commit (verify with `git log --oneline`)
- [ ] A PR from `develop` → `main` is open and unmerged, with a clear description
- [ ] No feature code from Phase 1+ (Vault, Import, Viewer, Search, AI) exists anywhere in the codebase

If any validation step fails, fix it before reporting completion. Do not report "done" with known failing checks.

---

## Explicitly out of scope for this phase

Do not implement: authentication/vault/encryption, file import/parsing, chat rendering, media handling, search, AI features, themes beyond light/dark, monorepo/workspace restructuring, cloud sync, or any backend/server code. If you find yourself writing code for any of these, stop and flag it instead of proceeding.
