# WR API Suite

The WR API Suite monorepo houses the first production-ready pipeline for WeRobots: generating rich question sets from free-form briefs and applying them to large batches of documents. The backend streams generation and grading progress over Server-Sent Events (SSE), records token usage for each organization, and exposes tenant-level billing controls. The Next.js frontend offers operator tooling for designing question sets, uploading transcripts or snippets, reviewing answers, and managing credentials.
