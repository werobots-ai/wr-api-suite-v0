# WR API Suite

The WR API Suite monorepo houses the first production-ready pipeline for WeRobots: generating rich question sets from free-form briefs and applying them to large batches of documents. The backend streams generation and grading progress over Server-Sent Events (SSE), records token usage for each organization, and exposes tenant-level billing controls. The Next.js frontend offers operator tooling for designing question sets, uploading transcripts or snippets, reviewing answers, and managing credentials.

## Identity store bootstrap

- The local identity store now starts empty. When you load the operator console for the first time,
  the app prompts you to create a master organization and owner. Master owners can view
  platform-wide metrics and manage which organizations are treated as "master" tenants.
- Override the on-disk location of the identity store by setting `IDENTITY_FILE_PATH`. This is
  useful for tests or alternate deployments that want to isolate identity data from the default
  `data/identity.json` file.

## Local infrastructure

Local development depends on Docker to emulate AWS DynamoDB and Keycloak. The `dev.sh` helper spins
up both services alongside the frontend and backend development servers.

```bash
./dev.sh
```

The script launches the services defined in `docker-compose.dev.yml` and tears them down when the
frontend/backend processes stop. The Compose stack exposes the following ports on the host:

- DynamoDB Local: http://localhost:8000
- Keycloak: http://localhost:8080 (admin username/password: `admin` / `admin`)

You can manage the containers independently with the Docker CLI if needed, for example:

```bash
docker compose -f docker-compose.dev.yml up -d
# ...
docker compose -f docker-compose.dev.yml down --remove-orphans
```

When deploying to staging or production, replace these containers with the managed AWS DynamoDB
service and the dedicated Keycloak instances provisioned for each environment.
