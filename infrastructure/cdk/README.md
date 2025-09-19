# Infrastructure (AWS CDK)

This package defines the DynamoDB tables backing the WR API Suite. It provisions three
`PAY_PER_REQUEST` tables with AWS-managed encryption:

- **IdentityTable** (`wr-api-suite-identity`): stores the serialized identity store document.
- **QuestionSetsTable** (`wr-api-suite-question-sets`): stores question sets and QA results using a
  single-table design with a `questionSetsBySnippet` GSI for snippet lookups.
- **OpenAiCacheTable** (`wr-api-suite-openai-cache`): stores cached OpenAI responses with a TTL on
  the `expiresAt` attribute.

## Usage

```bash
cd infrastructure/cdk
npm install
npm run build
npm run synth    # or npm run deploy
```

Override table names or index names with CDK context parameters:

```bash
cdk synth \
  -c identityTableName=my-identity \
  -c questionSetsTableName=my-question-sets \
  -c questionSetsSnippetIndexName=my-snippet-index \
  -c openAiCacheTableName=my-openai-cache
```

For local development, `./dev.sh` starts DynamoDB Local with table names matching the defaults
above, so no additional configuration is required.
