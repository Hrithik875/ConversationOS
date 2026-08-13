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

---

## Phase 2 — Import Engine

**Date:** 2026-08-02

### What was built

Phase 2 introduces the ability to import a real WhatsApp chat export (`.zip`) and encrypt it at rest inside the ConversationOS vault.

- **Data Model (Dexie v5):** Added `chats`, `messages`, `media`, and `imports` tables.
- **Zip Extraction (`fflate`):** Fast, worker-compatible zip decompression to extract the `_chat.txt` transcript and all attached media files.
- **Message Parser:** A pure, robust transcript parser with format auto-detection.
  - Automatically identifies Android 12h, Android 24h, iOS bracketed, and US date formats based on match rates.
  - Handles system messages (e.g., encryption notices), deleted messages, and media attachments/omissions.
  - Fixes WhatsApp's invisible Unicode injection (e.g., stripping LRM and narrow no-break space characters around timestamps).
  - Merges multi-line messages seamlessly.
- **Media Linking & OPFS Storage:**
  - Media files are hashed (SHA-256) for deduplication.
  - Encrypted with AES-GCM (raw bytes, no base64 overhead) using the vault key.
  - Stored securely in the Origin Private File System (OPFS) via standard WritableStream APIs.
- **Web Worker Orchestration:** The entire pipeline (unzip -> parse -> link media -> encrypt text -> encrypt media -> save to Dexie) runs inside a dedicated Web Worker (`import.worker.ts`). This guarantees the UI never freezes, even when processing massive chats.
- **Import UI:** Added a drag-and-drop file picker, a live progress screen reporting exactly what the worker is doing, and a detailed post-import report showing message stats, matched media counts, and parse warnings.

### Security & Privacy notes

- **What is encrypted:** Message text content (stored in Dexie as base64 ciphertext + IV) and actual media bytes (stored in OPFS as raw AES-GCM encrypted bytes).
- **What is NOT encrypted (Metadata tradeoff):** Timestamps, message types, chat IDs, and raw sender names are stored unencrypted in Dexie. This is a deliberate performance decision to allow sorting, filtering, and pagination of messages without having to decrypt thousands of rows upfront.
- **Zero-knowledge constraint:** The `CryptoKey` from the vault store is transferred directly to the Web Worker for the duration of the import, ensuring encryption happens client-side without the key ever being persisted to disk.

### Key decisions

- **fflate over JSZip:** `fflate` is smaller, faster, and works seamlessly in Web Workers without polyfills.
- **Vitest for parser logic:** The parser is a pure function. Vitest was added to provide a fast feedback loop for TDD, ensuring all the bizarre WhatsApp format edge cases (Android vs iOS) are correctly handled.
- **OPFS for media:** IndexedDB is notoriously slow and memory-intensive for large binary blobs. Using OPFS provides native file-system-like performance while still being constrained to the browser's origin sandbox.

### How to verify this phase

1. Run `pnpm dev`. Unlock the vault.
2. The Import UI will be presented.
3. Drag and drop a WhatsApp `.zip` export (ensure it contains media).
4. Watch the progress bar advance without the UI freezing.
5. Review the final Import Report (Message counts should match roughly the number of lines in the text file minus multi-line continuations).
6. Verify in DevTools (Application -> IndexedDB) that `messages.encryptedContent` is unreadable base64 text, and that `messages.content` does not exist.
7. Verify in DevTools (Application -> Storage) that OPFS contains files under `/media` with SHA-256 filenames.

### Known limitations / deferred items

- The "View Chat" button in the import report is disabled. The actual chat viewer interface is slated for Phase 3.
- Participant names are currently stored exactly as they appear in the transcript text file (which often depends on how the user saved the contact). Contact resolution and renaming is deferred.
- No support yet for standalone `.txt` imports without a zip file.

---

## Phase 3 — Chat Viewer
**Date:** 2026-08-13

### What was built

Phase 3 delivers the core reading experience — the ability to view imported chats with proper message rendering, media display, and a responsive sidebar layout.

**Chat sidebar (`ChatSidebar.tsx`):**
- Queries the `chats` table and renders each imported chat with title, participant names, message count, and a lazy-decrypted last-message preview.
- Last-message preview decrypts only the most recent message per chat on demand via `getCachedDecryption()`, not the entire chat.
- Clicking a chat sets it as the active chat in `viewerStore`. Empty state shows a prompt to import a chat.

**Self-participant selection (`SelfParticipantModal.tsx`):**
- On first chat open, prompts the user: "Which participant are you?" with the detected sender names as options.
- Stores the selection as `selfParticipant` on the `chats` record in Dexie.
- Drives message alignment: own messages → right, others → left.
- Accessible at any time from the chat header to change the selection.

**Decryption cache (`decryptionCache.ts`):**
- In-memory FIFO cache mapping `messageId → decryptedPlaintext` with a max size of 2,000 entries (~60 screens of content).
- FIFO eviction approximates LRU well for sequential scroll access patterns.
- Cache clears entirely on vault lock via `viewerStore.clearViewer()`.

**Media cache (`mediaCache.ts`):**
- In-memory cache mapping `mediaId → objectURL` with a max size of 100 entries.
- On eviction, `URL.revokeObjectURL()` is called to free the Blob and prevent memory leaks.
- On vault lock, `clearMediaCache()` revokes all object URLs and empties the cache.

**Viewer store (`viewerStore.ts`):**
- Zustand session store (not persisted) tracking `activeChatId`.
- `clearViewer()` clears both decryption and media caches plus resets the active chat.
- Hooked to vault lock in `App.tsx` — when the vault locks, `clearViewer()` fires immediately.

**Virtualized message list (`MessageList.tsx`):**
- Messages are fetched from Dexie sorted by `sortIndex` and rendered via `@tanstack/react-virtual`.
- Decryption is lazy: only messages in/near the viewport are decrypted via the decryption cache, with results stored in a local `Map<messageId, plaintext>`.
- Day grouping with date separators ("Today", "Yesterday", "12 January 2024") using sticky pill-style labels.
- Scroll-to-bottom on initial load.
- `overscan: 15` provides buffer for smooth scroll experience.

**Message bubble components:**
- `TextBubble`: Sender name (colorized by hash), timestamp, linkified URLs, preserved line breaks, left/right alignment.
- `SystemBubble`: Centered pill/label style for system messages (e.g. "Alice added Bob").
- `DeletedBubble`: Italic, muted, dashed-border style with a "blocked" icon. Never fabricates deleted content.
- `MediaBubble`: Handles all media types:
  - **Images (matched):** Decrypted from OPFS, rendered inline. Click opens lightbox.
  - **Missing media (`matched: false`):** Amber placeholder — "Media not found in export" + original filename.
  - **Media omitted (no `mediaRef`):** Italic caption with the original `<Media omitted>` text.
  - **Non-image media (video/audio/documents):** Generic fallback with file-type icon, filename, size, and a decrypt-and-download button.

**Image lightbox (`ImageLightbox.tsx`):**
- Full-screen overlay with backdrop blur. Close via × button, Escape key, or backdrop click.
- Prevents body scroll while open.
- Single-image view (gallery navigation deferred).

**App shell integration (`App.tsx`):**
- Layout: fixed header with lock button + theme toggle, sidebar (280px, hidden on mobile when chat is open), main content area.
- Route guard: the viewer is only accessible inside `UnlockedAppShell`, which only renders when `vaultStore.status === 'unlocked'`. Direct navigation while locked renders the lock screen.
- Import flow (progress/report) takes precedence over the viewer when active.

### Decryption/caching strategy

- **Text cache:** FIFO with 2,000-entry cap. Chosen because scroll access is predominantly sequential (scrolling through a chat), making FIFO a reasonable approximation of LRU. 2,000 entries ≈ 60 screens of messages at ~33 messages/screen, providing ample buffer for bi-directional scroll without excessive memory use.
- **Media cache:** 100-entry cap with `URL.revokeObjectURL()` on eviction. 100 entries limits memory to roughly 100 in-memory image Blobs, which is generous for typical viewport sizes.
- **Cache clearing on vault lock:** Both caches clear immediately when the vault locks. `viewerStore.clearViewer()` is called in the vault lock handler, ensuring no decrypted plaintext or media object URLs survive past lock.

### Performance notes

- Virtualization confirmed: `@tanstack/react-virtual` with `overscan: 15` keeps DOM node count bounded regardless of chat size. A chat with 10,000+ messages renders the same number of DOM nodes as a chat with 50 messages.
- Message metadata (timestamps, types, sender names, encrypted content strings) is loaded from Dexie in a single query per chat. For very large chats (50,000+ messages), this could consume noticeable memory. True cursor-based pagination is deferred as a performance optimization for a later phase.
- Image decryption involves OPFS reads + AES-GCM decrypt + Blob creation. Object URLs are cached to avoid re-decryption when scrolling back.

### Known limitations / deferred items

- **Single-image lightbox only:** No gallery navigation between media messages. Deferred to a later phase.
- **Non-image media is download-only:** Video, audio, and documents show a generic fallback with a download button. Inline players are deferred.
- **No search:** Text search and semantic search are explicitly out of scope for Phase 3.
- **No message reactions/replies/quotes rendering:** These WhatsApp features are not parsed or rendered yet.
- **No true cursor-based pagination:** All message metadata is loaded from Dexie at once. Virtualization handles rendering efficiency, but memory usage scales linearly with chat size.
- **Linkification is regex-based:** Simple `https?://` pattern matching. Does not handle phone numbers, emails, or other rich link types.
