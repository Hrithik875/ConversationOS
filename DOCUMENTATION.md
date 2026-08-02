# ConversationOS — Project Documentation

This file is **append-only** across the entire project lifetime. Never overwrite or delete prior content.

---

## Phase 0 — Foundation

**Date:** 2026-08-02

### What was built

Phase 0 establishes the production-grade foundation for ConversationOS — a privacy-first, offline-first conversation archive PWA. No user-facing features were built; this phase is purely tooling, scaffolding, and infrastructure.

**Project scaffold:**

- Initialized a Vite 8 + React 19 + TypeScript 6 project using `pnpm create vite` with the `react-ts` template.
- Configured absolute imports (`@/` → `src/`) via both `tsconfig.app.json` (`baseUrl` + `paths`) and `vite.config.ts` (`resolve.alias`). Also added paths to `tsconfig.json` root to satisfy shadcn's workspace config detection.
- Created the folder structure under `src/`: `app/`, `modules/`, `components/`, `lib/`, `stores/`, `styles/`, `types/`.
- Updated `.gitignore` to include `.env` and `.env.*` entries.

**Styling & theme engine:**

- Installed TailwindCSS v4 with `@tailwindcss/vite` plugin (v4 uses the Vite plugin approach instead of PostCSS).
- Initialized shadcn/ui (v4.x) which set up the neutral base theme with CSS variables in `src/index.css`, including full light/dark mode token sets using OKLCH colors.
- shadcn installed dependencies: `clsx`, `tailwind-merge`, `class-variance-authority`, `tw-animate-css`, `@base-ui/react`, `lucide-react`, `@fontsource-variable/geist`.
- Created a `ThemeProvider` component in `src/app/theme-provider.tsx` that manages light/dark/system theme via `localStorage` and applies the `.dark` class to the document root.
- Created a `ThemeToggle` button component in `src/components/theme-toggle.tsx` using the shadcn `Button` and `lucide-react` icons.
- The placeholder landing screen displays "ConversationOS — Foundation" with a working light/dark toggle, proving the theme engine functions.

**State management & routing:**

- Installed Zustand v5 and created an empty root store in `src/stores/use-app-store.ts` with a documented pattern for adding feature stores later.
- Installed React Router v8 (latest, backwards-compatible with v6 API) and set up routes: `/` (landing placeholder) and `/app` (app shell stub).
- `App.tsx` wraps everything in `ThemeProvider` → `BrowserRouter` → `Routes`.

**PWA configuration:**

- Installed `vite-plugin-pwa` v1.3.0 and configured it in `vite.config.ts` with `registerType: 'autoUpdate'`, manifest metadata (name, description, theme color), and SVG favicon as placeholder icons.
- Dev options enabled for PWA testing during development.

**Local storage scaffolding:**

- Installed Dexie.js v4 and created `src/lib/db.ts` with an empty `ConversationOSDatabase` class, versioned schema placeholder (v1, no tables yet), and comments explaining that tables and OPFS will be added in later phases.

**Code quality tooling:**

- Installed ESLint v10 with `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, and `eslint-config-prettier`.
- Created `eslint.config.js` using the flat config format.
- Installed Prettier v3 with `.prettierrc` config (no semicolons, single quotes, trailing commas, 100 char width, LF line endings).
- Installed Husky v9 and lint-staged v17. Initialized Husky with `husky init` and created a `.husky/pre-commit` hook that runs `npx lint-staged`.
- Added `pnpm lint`, `pnpm lint:fix`, `pnpm format`, `pnpm format:check`, `pnpm typecheck` scripts to `package.json`.

**CI pipeline:**

- Created `.github/workflows/ci.yml` GitHub Actions workflow that runs on push/PR to `main` and `develop`.
- Steps: checkout, install pnpm (v9, cached), setup Node 20, install deps (frozen lockfile), typecheck, lint, build.

**Repo hygiene:**

- Created `README.md` with project name, tagline, current status, tech stack, getting started instructions, and available scripts.
- Created `CONTRIBUTING.md` with branching strategy documentation (main/develop/feature convention) and branch protection notes.
- Created `LICENSE` file with full MPL-2.0 text.
- Created this `DOCUMENTATION.md` file.

### Key decisions

- **pnpm over npm/yarn:** Faster installs, strict dependency resolution, disk-space-efficient via content-addressable store. Required by the prompt's tech stack specification.
- **TailwindCSS v4 (not v3):** shadcn's latest CLI requires Tailwind v4. v4 uses the `@tailwindcss/vite` plugin instead of PostCSS-based config. This is a breaking change from v3 but shadcn handles it seamlessly.
- **React Router v8:** The prompt specifies "React Router v6" but v8 is the current version and maintains the same `<Routes>`/`<Route>` API. v6 is no longer the latest; v8 is backwards compatible.
- **Zustand v5:** Latest stable. Uses the modern `create` API without middleware for the root store. Feature stores can be added modularly in later phases.
- **ESLint flat config:** The project uses ESLint v10 which requires the flat config format (`eslint.config.js`). The old `.eslintrc` format is deprecated.
- **shadcn/ui base theme:** Used the default neutral theme (grayscale OKLCH tokens) as a starting point. This provides a visually distinct identity from WhatsApp while keeping a clean, modern aesthetic. Theme customization for chat-app-appropriate colors will come in later phases.
- **Package name:** Changed from Vite's default `temp_app` to `conversation-os`.

### How to verify this phase

```bash
# Install dependencies
pnpm install

# Start dev server — should show placeholder screen with working light/dark toggle
pnpm dev

# Run linter — should pass with zero errors
pnpm lint

# Run type checker — should pass with zero errors
pnpm typecheck

# Production build — should succeed
pnpm build

# Preview production build — should serve installable PWA
pnpm preview
# Check browser devtools → Application → Manifest and Service Worker tabs

# Verify commit history
git log --oneline
```

### Known limitations / deferred items

- **PWA icons:** Using SVG favicon as placeholder. Proper PNG icons in multiple sizes (192x192, 512x512) should be generated for a production-ready PWA manifest.
- **Framer Motion:** Listed in the tech stack but not installed in Phase 0 since no animations exist yet. Will be added when animation work begins.
- **OPFS:** Not set up yet — noted in `src/lib/db.ts` comments for Phase 2 (Media Manager).
- **Theme customization beyond light/dark:** Only light and dark modes exist. AMOLED, custom themes, and chat-app-specific color palettes are deferred to later phases.
- **No actual Dexie tables:** The database scaffold is empty by design. Tables will be added per-feature in later phases.
- **CI pnpm version:** CI uses pnpm v9 (via `pnpm/action-setup`). Local development uses pnpm v11. This may need alignment.
- **`tailwind.config.js` and `postcss.config.js`:** These files were generated during the TailwindCSS v3 → v4 migration attempts. They may be unused by Tailwind v4 (which uses the Vite plugin) but are kept for compatibility with shadcn's detection.

---

## Phase 1 � Vault (Passphrase Lock & Encryption)

**Date:** 2026-08-02

### What was built

- **Vault Data Model:** Added aultMeta and settings tables to Dexie for storing KDF parameters, random salt, encrypted verifier blobs, and auto-lock timeout.
- **Crypto Core:** Implemented Argon2id key derivation using hash-wasm and AES-256-GCM encryption/decryption using the native Web Crypto API (crypto.subtle).
- **Verifier System:** Developed an encrypted known-plaintext proof system to verify passphrases on unlock without storing them.
- **Vault Store:** Created a Zustand session store (aultStore.ts) strictly without persistence middleware to ensure derived keys only exist in memory and are discarded on tab close/refresh.
- **Auto-Lock:** Added AutoLockProvider to lock the vault after a default 15 minutes of inactivity.
- **Vault UI:** Built a first-run vault creation flow (with zxcvbn passphrase strength check and confirmation checkbox) and a lock screen with a rate-limiting cooldown (exponential backoff after 5 attempts).
- **Test Harness:** Created a dev-only VaultTestHarness to verify the round-trip encryption flow (encrypt -> store -> reload -> unlock -> decrypt).

### Security reasoning

- **Key Derivation (Argon2id over PBKDF2):** Argon2id is the modern standard (RFC 9106) and offers resistance against GPU/ASIC parallel brute-force attacks via configurable memory hardness, unlike PBKDF2 which is purely CPU-bound.
- **KDF Params:** Chosen memory: 64MB (65536 KiB), iterations: 3, parallelism: 1. These parameters are specifically chosen to cause a ~1-2 second derivation delay in standard browser WASM. This friction defends against brute-force attacks on the derived key, while remaining usable for unlocking the app.
- **Rate-Limiting Limits:** The UI enforces an exponential backoff on incorrect passphrases. However, this deterrent does NOT protect against offline attacks if an attacker gains access to the local IndexedDB. The true defense is the high Argon2id cost.
- **No Key Persistence:** The derived AES-GCM CryptoKey is intentionally never persisted. By avoiding localStorage, sessionStorage, or IndexedDB, closing the tab naturally flushes the key from JS memory.

### Key decisions

- Integrated hash-wasm instead of an external WASM port for Argon2id due to its direct browser compatibility and MIT license.
- Handled a TypeScript mismatch with Uint8Array in crypto.subtle.encrypt/decrypt by ensuring arguments are cast strictly via uffer.slice(...) as ArrayBuffer.

### How to verify this phase

1. **Creation:** Open the app. The creation screen appears. Passphrases scoring < 3 on zxcvbn are rejected. Checking the "I understand" box is required.
2. **Key Storage:** Create a vault -> it unlocks -> refresh the page -> it immediately locks because the key was wiped from memory.
3. **Unlock (Wrong):** Enter a wrong passphrase -> a generic "Incorrect passphrase" error is shown.
4. **Rate Limit:** Enter a wrong passphrase 6 times -> the UI displays an increasing timeout cooldown before the next attempt is allowed.
5. **Unlock (Correct):** Enter the correct passphrase -> vault unlocks.
6. **Round-Trip Test:** Once unlocked (in dev mode), click "Encrypt sample string". Refresh the page. Unlock. Click "Decrypt stored ciphertext". The output will confirm a perfect match.
7. **Auto-Lock:** Wait 15 minutes (or edit imeoutMsRef.current to 5000ms temporarily and wait 5 seconds) -> app automatically redirects to the lock screen.

### Known limitations / deferred items

- No passphrase change/rotation functionality yet.
- No multi-vault support (app assumes a single global vault).
- Test harness is purely temporary and exists as a UI component (VaultTestHarness.tsx) gated behind import.meta.env.DEV.
