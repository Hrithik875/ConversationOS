# ConversationOS

> Privacy-first, offline-first conversation archive platform.

## Status

**Phase 3 — Chat Viewer**

## Tech Stack

- **Package manager:** pnpm
- **Framework:** React 19 + TypeScript + Vite
- **Styling:** TailwindCSS + shadcn/ui + Radix UI primitives
- **Animation:** Framer Motion _(coming in later phases)_
- **State management:** Zustand
- **Routing:** React Router v6
- **PWA:** vite-plugin-pwa
- **Local storage:** Dexie.js (IndexedDB wrapper)
- **Linting/formatting:** ESLint + Prettier + Husky + lint-staged
- **CI:** GitHub Actions
- **License:** MPL-2.0

## Getting Started

```bash
pnpm install
pnpm dev
```

## Available Scripts

| Script           | Description                  |
| ---------------- | ---------------------------- |
| `pnpm dev`       | Start dev server             |
| `pnpm build`     | Production build             |
| `pnpm preview`   | Preview production build     |
| `pnpm lint`      | Run ESLint                   |
| `pnpm lint:fix`  | Run ESLint with auto-fix     |
| `pnpm format`    | Format code with Prettier    |
| `pnpm typecheck` | Run TypeScript type checking |

## License

[MPL-2.0](LICENSE)
