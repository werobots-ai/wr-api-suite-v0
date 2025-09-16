# Agent Guidelines for WR API Suite

## Repository overview
- **Monorepo layout.** The `backend/` directory houses an Express 5 + TypeScript API server. The `frontend/` directory contains a Next.js 15 (pages router) operator console written in React 19. Shared tooling lives at the repository root alongside helper scripts (`install.sh`, `dev.sh`, `test.sh`).
- **Runtime storage.** The application expects `data/` and `uploads/` directories to be created at runtime. Never commit generated artefacts from these folders.

## Required workflow for every change
1. Install dependencies through the provided script when new packages are added: `./install.sh` (runs `npm ci` in both workspaces).
2. Run the backend test suite via `./test.sh` whenever backend code, shared utilities, billing logic, or SSE handling change. The command enforces ≥80 % line coverage; add or update `node:test` unit tests under `backend/test/` to keep coverage healthy.
3. Run `npm run lint --prefix frontend` whenever you touch frontend code (React components, context, lib helpers, or types). Address all lint findings before committing.
4. If your change impacts both stacks, execute both commands. Only skip a check when no files in that stack are affected.
5. Surface any new scripts or required manual verification steps in your final summary.

## Coding conventions
- **TypeScript first.** Write new logic in TypeScript and keep type definitions in sync (`backend/src/types/`, `frontend/types/`). Prefer explicit interfaces and discriminated unions over `any`. If you must use `any`, annotate the reason with a short comment.
- **Match surrounding style.** Files use two-space indentation and semicolons. Follow existing quote style (backend source favors double quotes; backend tests may use single quotes). Keep imports sorted by package/local, and never wrap imports in try/catch blocks.
- **Async patterns.** Favor `async/await` with `try/catch` for asynchronous flows. When streaming SSE responses, re-use the helpers from `backend/src/utils/initStream` instead of writing raw `res.write` logic.
- **Configuration.** Introduce new environment variables via `backend/.env.sample` or `frontend/.env.sample` and document them in `README.md`. Defaults should be safe for local development.

## Backend-specific guidance (`backend/`)
- Register new HTTP routes in `backend/src/index.ts` and colocate handlers under `backend/src/routes/`. Keep routers small and delegate orchestration to helpers in `backend/src/utils/` or `backend/src/llmCalls/`.
- When extending billing, question storage, or SSE event payloads, update the corresponding utilities (`recordUsage`, `questionStore`, `initStream`) and ensure emitted event names remain consistent with the frontend listeners.
- Persisted data lives on disk via JSON helpers in `backend/src/utils/`; update serialization logic carefully to maintain backward compatibility with existing files in `data/`.
- Log actionable context with `console.log`/`console.error`, but avoid leaking secrets (API keys, auth tokens). Prefer structured objects in logs when dealing with multi-field payloads.

## Frontend-specific guidance (`frontend/`)
- Stick to function components and React hooks. Shared state should flow through the existing context providers (`frontend/context/`).
- Use the helper utilities in `frontend/lib/api.ts` for API calls so headers (API key, auth token, org id) stay consistent.
- Respect the `@/*` TypeScript path alias defined in `frontend/tsconfig.json` when importing local modules.
- Keep styling lightweight: existing files rely on Tailwind-compatible utility classes and scoped `styled-jsx`. Follow the surrounding approach instead of introducing heavy CSS frameworks.
- When adding or renaming SSE event handlers in pages like `frontend/pages/snippets.tsx`, mirror the backend event names and update any derived UI state accordingly.

## Testing and verification expectations
- Add or update backend unit/integration tests under `backend/test/` using Node's built-in `node:test` runner. Mock external services (e.g., OpenAI SDK) to keep tests deterministic.
- For frontend changes that materially alter UI logic (forms, SSE handling, derived state), prefer to add regression coverage through lightweight component tests or at minimum document manual test steps in your summary.
- Keep the documentation in `README.md` aligned with the implemented APIs, especially when endpoints, SSE event shapes, or billing rules change.

## Dependency and asset management
- Modify `package.json` and its corresponding `package-lock.json` together whenever dependencies change. Do not edit files under `node_modules/`.
- Static assets belong under `frontend/public/`. Large binary fixtures should stay out of the repository unless absolutely required for tests.

## Pull request expectations
- Summaries should call out backend and frontend impacts separately when both areas change, and always list the commands you ran (`./test.sh`, `npm run lint --prefix frontend`, etc.).
- Note any follow-up work (migrations, manual clean-up) so reviewers understand remaining risks.

