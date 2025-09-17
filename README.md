# WR API Suite

The WR API Suite monorepo houses the first production-ready pipeline for WeRobots: generating rich question sets from free-form briefs and applying them to large batches of documents. The backend streams generation and grading progress over Server-Sent Events (SSE), records token usage for each organization, and exposes tenant-level billing controls. The Next.js frontend offers operator tooling for designing question sets, uploading transcripts or snippets, reviewing answers, and managing credentials.

## Identity store bootstrap

- The local identity store now starts empty. When you load the operator console for the first time,
  the app prompts you to create a master organization and owner. Master owners can view
  platform-wide metrics and manage which organizations are treated as "master" tenants.
- Override the on-disk location of the identity store by setting `IDENTITY_FILE_PATH`. This is
  useful for tests or alternate deployments that want to isolate identity data from the default
  `data/identity.json` file.
