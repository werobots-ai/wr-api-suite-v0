# WR API Suite

**Work in Progress**

This monorepo contains the first API in the WR API Suite. It generates an augmented question set with rich metadata from any textual input and then uses that set to evaluate large volumes of documents. The same pipeline can power many workflows: scoring CVs for a role, auditing customer service snippets, or running continuous quality checks on arbitrary log batches. Results are produced with full reasoning, metadata, and auditability.

Batch jobs run in the background when triggered by the consumer. A status endpoint lets clients poll progress, and generated results remain available for a short time-to-live window for download (and can be deleted early by the user).

## Prerequisites

- Node.js 18+
- npm

## Installation

Install dependencies for both the backend and the frontend:

```bash
./install.sh
```

## Development

Run both development servers simultaneously:

```bash
./dev.sh
```

The backend listens on `http://localhost:4000` and the frontend on `http://localhost:3000`.

## Project Structure

- `backend/` – Express API server written in TypeScript.
- `frontend/` – Next.js application.
- `data/` – caches, question sets and QA results (ignored by Git).
- `uploads/` – temporary file uploads (ignored by Git).

The backend expects the `data/` and `uploads/` directories at the repository root. They are created automatically if missing.

## Environment Variables

Copy the sample file and configure the required variables (e.g. `OPENAI_API_KEY`):

```bash
cp .sample.env backend/.env.local
```

Use different suffixes (e.g. `.env.production`) to run in other environments.

## Scripts

- `install.sh` – runs `npm ci` inside `backend` and `frontend`.
- `dev.sh` – runs `npm run dev` in both folders in parallel.

