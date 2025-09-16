# WR API Suite

The WR API Suite monorepo houses the first production-ready pipeline for WeRobots: generating rich question sets from free-form briefs and applying them to large batches of documents. The backend streams generation and grading progress over Server-Sent Events (SSE), records token usage for each organization, and exposes tenant-level billing controls. The Next.js frontend offers operator tooling for designing question sets, uploading transcripts or snippets, reviewing answers, and managing credentials.

## Capabilities at a glance
- **Question set authoring.** The `/api/questions` endpoints orchestrate multiple LLM calls to reason over the change request, draft detailed guidance, finalize questions by type, and persist the resulting set with its execution plan and metadata.
- **Batch snippet evaluation.** The `/api/upload` endpoint accepts `.xlsx`, `.txt`, and `.md` files, links uploaded snippets to a question set, streams per-question reasoning and answers, and stores results for later retrieval.
- **Usage-aware billing.** Every question generation or snippet scoring run debits organization credits, records OpenAI token costs, and attributes activity to the API key that triggered the job.
- **Tenant administration.** Authenticated owners can mint and rotate API keys, top up credits, invite teammates, and inspect usage from the `/api/account` routes and the billing UI.
- **Platform console.** Sysadmins can review cross-tenant metrics and rotate client credentials from the `/api/admin` dashboard.

## Tech stack
- **Backend:** Express 5 + TypeScript, OpenAI SDK with a local JSON/file-based identity and results store.
- **Frontend:** Next.js 15 with the App Router disabled in favour of pages, React 19, and lightweight component styling.
- **Tooling:** Nodemon for hot reload, ts-node for execution, and a Jest-style Node test runner with coverage thresholds.

## Repository layout
| Path | Description |
| --- | --- |
| `backend/` | Express API server, including auth middleware, LLM orchestration, question storage, and billing logic. |
| `frontend/` | Next.js operator console for authoring question sets, launching uploads, and managing accounts. |
| `install.sh` / `dev.sh` / `test.sh` | Convenience scripts for installing dependencies, running both dev servers, and executing the backend test suite with coverage enforcement. |
| `data/` *(created at runtime)* | File-system persistence for question sets, QA results, cached OpenAI responses, and identity state. |
| `uploads/` *(created at runtime)* | Temporary storage for files received by the upload API. |

## Local setup
### Prerequisites
- Node.js 18 or newer
- npm 9+

### Environment variables
1. Bootstrap the backend configuration and provide a valid OpenAI API key:
   ```bash
   cp backend/.env.sample backend/.env.local
   ```
   Populate `OPENAI_API_KEY` with a usable secret before running the server.
2. Optional backend overrides:
   - `API_KEY_SECRET` / `API_KEY_HASH_SECRET` to re-encrypt stored API keys.
   - `WEROBOTS_INTERNAL_ORG_IDS` to mark internal organizations whose costs should be fully revealed in the UI.
   - `CACHE_DIR` and `CACHE_SPEED_RATIO` to tune the cached OpenAI connector.
   - `PLAY_SOUNDS` to silence cache hit/miss notifications (`0` or `false`).
   - `PORT` to change the backend listener from the default `4000`.
3. Configure the frontend (optional) if you need to point it at a different backend:
   ```bash
   cp frontend/.env.sample frontend/.env.local
   ```
   Update `NEXT_PUBLIC_API_URL` to the desired API host. The sample defaults to the local backend started by `dev.sh`.

### Install dependencies
```bash
./install.sh
```

### Run the full stack
```bash
./dev.sh
```
The backend listens on `http://localhost:4000`; the frontend runs on `http://localhost:3000` and proxies API requests to the backend using `NEXT_PUBLIC_API_URL`.

### Execute tests
The backend test suite runs via Node's built-in test runner and must retain at least 80 % line coverage:
```bash
./test.sh
```

## Working with question sets and snippets
1. **Create a question set.** From the frontend, navigate to `/questions`, draft a change request, and start the pipeline. The UI displays streaming `log` events and, when complete, loads the generated question set for inspection. Saved sets are persisted to `data/questions` alongside their execution plan and snippet metadata.
2. **Load an existing set.** Use the "Load" dialog to fetch saved question sets. Each set includes prior QA results, which the UI hydrates immediately after download.
3. **Answer snippets.** Switch to `/snippets`, select or drop `.xlsx`, `.txt`, or `.md` files, and watch SSE events report snippet counts, per-question reasoning, short answers, and detailed writeups. Completed answers are saved under `data/qaResults` and linked to the originating files for auditability.
4. **Review outputs.** Filter by conversation, open the detail drawer to read long-form reasoning, and export results directly from the file-system storage if needed.

### Streaming events
Both generation and grading pipelines rely on SSE. Clients should subscribe for:
- `log` – human-readable progress updates.
- `processingQuestions` – high-level milestones while orchestrating question generation.
- `reasoning` / `detailedReasoning` – incremental rationale for each snippet/question pair.
- `shortAnswer` / `detailedAnswer` – structured answers ready for rendering in the UI.
- `metrics`, `snippetCount`, `rowCount`, `linkFileToSnippet` – telemetry about workload size and billing.
- `qaResults` – final payload with the full structured answer set.
- `error` – recoverable issues tied to the current snippet or global job state.
- `done` – signals completion of the pipeline.

## Key API endpoints
| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/questions` | Stream question-set generation from a change request and persist the result. |
| `GET` | `/api/questions/:id` | Retrieve a saved question set with rendered markdown answers. |
| `DELETE` | `/api/questions/:id` | Soft-delete a question set and its associated QA results. |
| `POST` | `/api/upload` | Upload snippets/transcripts tied to a question set and stream grading results. |
| `POST` | `/api/auth/dev/signup` | Create a development organization + owner and mint initial API keys. |
| `POST` | `/api/auth/dev/login` | Issue a short-lived developer bearer token for local auth. |
| `GET` | `/api/account` | Fetch organization profile, permissions, credits, and usage history. |
| `POST` | `/api/account/keysets` | Create a new API key set and return freshly issued secrets once. |
| `POST` | `/api/account/keysets/:id/keys/:index/rotate` | Rotate an API key, revealing the new secret for secure storage. |
| `POST` | `/api/account/topup` | Add prepaid credits to the active organization. |
| `GET` | `/api/account/users` | List organization members and their role assignments. |
| `POST` | `/api/account/users` | Invite or update a member; optionally auto-generate credentials. |
| `GET` | `/api/admin/overview` | Platform-level metrics for sysadmins across all tenants. |
| `POST` | `/api/admin/organizations/:orgId/keysets/:setId/keys/:index/rotate` | Rotate a customer API key from the platform console. |

## Frontend surfaces
- **Developer auth (`/auth/dev-login`).** Local-only signup/login flow that mimics the future Keycloak integration and reveals API secrets immediately after organization creation.
- **Question design (`/questions`).** Compose change requests, watch generation streams, edit question copy, and manage saved sets.
- **Snippet grading (`/snippets`).** Drag-and-drop upload experience with live logs, answer grids, and detailed reasoning drawers.
- **Billing & members (`/account/billing`).** Manage credits, rotate API keys, invite teammates, and inspect usage trends.
- **Platform console (`/admin/users`).** Sysadmin-only view with global revenue/cost summaries, tenant search, and emergency key rotation.

## Future improvements
> **Future improvement – Authentication & session management**
> - Replace the in-memory development token issuer with the planned identity provider so sessions survive process restarts and honor enterprise SSO requirements.
> - Introduce refresh tokens or JWT expiration to avoid unbounded dev token lifetime.
>
> **Future improvement – Persistence & scale**
> - Migrate question sets, QA results, and identity data from JSON files under `data/` to managed storage (SQL or object store) for durability and concurrent access.
> - Add background job infrastructure for long-running snippet processing instead of handling every upload within a single request worker.
>
> **Future improvement – Observability & guardrails**
> - Expand structured logging/metrics around SSE pipelines to expose throughput, failure causes, and OpenAI latency in dashboards.
> - Enforce configurable per-organization quotas on snippet volume and concurrent jobs to protect shared infrastructure.
