# Contributing to ConversationOS

## Branching Strategy

- **`main`** — Release-only branch. Never push directly to main.
- **`develop`** — Integration branch. All feature branches merge here.
- **`feature/<name>`** — Feature branches off `develop`, merge back to `develop`.

### Workflow

1. Create a feature branch from `develop`:

   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/<your-feature-name>
   ```

2. Make your changes, commit using [Conventional Commits](https://www.conventionalcommits.org/):

   ```
   feat(module): add new feature
   fix(module): fix a bug
   chore(module): maintenance task
   docs: update documentation
   ```

3. Push your branch and open a PR against `develop`.

4. After review and CI passing, merge to `develop`.

5. `develop` → `main` merges are done for releases only.

### Branch Protection (Manual Setup)

The following branch protection rules should be configured in the GitHub repository settings:

- **`main`**: Require pull request reviews, require status checks to pass, no direct pushes.
- **`develop`**: Require status checks to pass before merging.

## Code Quality

- ESLint + Prettier run on pre-commit via Husky + lint-staged.
- CI runs typecheck, lint, and build on every push/PR.
- All code must pass `pnpm lint` and `pnpm typecheck` before merging.
