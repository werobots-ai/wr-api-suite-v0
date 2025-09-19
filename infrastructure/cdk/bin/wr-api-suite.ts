#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { WrApiSuiteStorageStack } from '../lib/storage-stack.js';

const app = new App();

new WrApiSuiteStorageStack(app, 'WrApiSuiteStorageStack', {
  env: {
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});
