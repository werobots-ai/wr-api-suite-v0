import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import {
  AttributeType,
  BillingMode,
  Table,
  TableEncryption,
  ProjectionType,
} from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface WrApiSuiteStorageStackProps extends StackProps {
  readonly identityTableName?: string;
  readonly questionSetsTableName?: string;
  readonly questionSetsSnippetIndexName?: string;
  readonly openAiCacheTableName?: string;
}

export class WrApiSuiteStorageStack extends Stack {
  constructor(scope: Construct, id: string, props: WrApiSuiteStorageStackProps = {}) {
    super(scope, id, props);

    const identityTableName =
      props.identityTableName ||
      this.node.tryGetContext('identityTableName') ||
      'wr-api-suite-identity';
    const questionSetsTableName =
      props.questionSetsTableName ||
      this.node.tryGetContext('questionSetsTableName') ||
      'wr-api-suite-question-sets';
    const snippetIndexName =
      props.questionSetsSnippetIndexName ||
      this.node.tryGetContext('questionSetsSnippetIndexName') ||
      'questionSetsBySnippet';
    const openAiCacheTableName =
      props.openAiCacheTableName ||
      this.node.tryGetContext('openAiCacheTableName') ||
      'wr-api-suite-openai-cache';

    new Table(this, 'IdentityTable', {
      tableName: identityTableName,
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const questionSetsTable = new Table(this, 'QuestionSetsTable', {
      tableName: questionSetsTableName,
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    questionSetsTable.addGlobalSecondaryIndex({
      indexName: snippetIndexName,
      partitionKey: { name: 'snippetIndexPk', type: AttributeType.STRING },
      sortKey: { name: 'updatedAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    new Table(this, 'OpenAiCacheTable', {
      tableName: openAiCacheTableName,
      partitionKey: { name: 'cacheKey', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
