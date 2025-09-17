import test from 'node:test';
import assert from 'node:assert/strict';

import { getCostReporter } from "../src/shared/utils/costReporter";

test('tracks cost and requests', () => {
  const events: Array<{ event: string; data: unknown }> = [];
  const reporter = getCostReporter((event: string, data: unknown) => {
    events.push({ event, data });
  });

  reporter.addCost(0.5);
  reporter.addCost(1.0, 2);

  assert.equal(reporter.getTotalCost(), 1.5);
  assert.equal(reporter.getTotalRequests(), 3);
  assert.deepEqual(reporter.getMetrics(), { cost: 1.5, requests: 3 });

  assert.deepEqual(events, [
    { event: 'metrics', data: { metrics: { cost: 0.5, requests: 1 } } },
    { event: 'metrics', data: { metrics: { cost: 1.5, requests: 3 } } },
  ]);
});

