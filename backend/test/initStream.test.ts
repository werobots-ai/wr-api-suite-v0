import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { initStream } from '../src/utils/initStream';

test('initializes SSE and sends events', () => {
  const res: any = {
    headers: [] as any[],
    setHeader(key: string, value: string) {
      this.headers.push([key, value]);
    },
    flushHeadersCalled: false,
    flushHeaders() {
      this.flushHeadersCalled = true;
    },
    writes: [] as string[],
    write(chunk: string) {
      this.writes.push(chunk);
    },
    flushCalled: false,
    flush() {
      this.flushCalled = true;
    },
  };

  const { sendEvent, sendError } = initStream(res);

  assert.deepEqual(res.headers, [
    ['Content-Type', 'text/event-stream'],
    ['Cache-Control', 'no-cache'],
    ['Connection', 'keep-alive'],
  ]);
  assert.ok(res.flushHeadersCalled);

  sendEvent('msg', { hello: 'world' });
  assert.deepEqual(res.writes, [
    'event: msg\n',
    'data: {"hello":"world"}\n\n',
  ]);
  assert.ok(res.flushCalled);

  res.writes = [];
  res.flushCalled = false;
  const errorSpy = mock.method(console, 'error', () => {});
  sendError(new Error('oops'), 'sn1');
  errorSpy.mock.restore();

  assert.deepEqual(res.writes, [
    'event: error\n',
    'data: {"message":"oops","snippetId":"sn1"}\n\n',
  ]);
});

