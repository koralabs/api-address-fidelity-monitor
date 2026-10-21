import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, mock, test } from 'node:test';

import { LogCategory, Logger } from '@koralabs/kora-labs-common';

import {
  ALPHA, BETA, BLOCK_MS, BLOCK_SECONDS, offlineTransport, utxo,
} from './support/offline.mjs';

const transport = offlineTransport();
const { resolveHandle } = await import('../src/resolve.ts');
let now;
let records;
let checkQueue;
let checkResolvedHandle;
let instance = 0;

beforeEach(async () => {
  now = BLOCK_MS + 20000;
  records = [];
  mock.method(Date, 'now', () => now);
  mock.method(Logger, 'log', (record) => { records.push(record); });
  // Each real module instance owns a fresh private queue. No queue state, resolver,
  // provider or decision function is mocked or manually mutated by these tests.
  ({ checkQueue, checkResolvedHandle } = await import(`../src/main.ts?queue=${instance++}`));
});
afterEach(() => { mock.restoreAll(); transport.reset(); });
after(() => transport.restore());

const queued = (handle) => ({
  message: `"${handle.name}" resolved to new address within threshold. Pushed to queue`,
  category: LogCategory.NOTIFY,
  event: 'HandleAddressResolver.queueNewResolvedAddress',
});
const mismatch = (handle, address) => ({
  message: `"${handle.name}" resolved to new address.\nfrom: ${handle.resolvedAddress}\nto: ${address}`,
  category: LogCategory.NOTIFY,
  event: 'HandleAddressResolver.newResolvedAddress',
});
const failure = (message) => ({
  message, category: LogCategory.ERROR, event: 'HandleAddressResolver.resolveHandleInQueue',
});
const apiRequest = (handle) => ({ url: `https://api.handle.me/handles/${handle.name}`, method: 'GET' });

async function observe(handle = ALPHA, address = 'new-alpha', seconds = BLOCK_SECONDS) {
  transport.respond([utxo(handle.hex, address, { block_time: seconds })]);
  const result = await resolveHandle(handle);
  assert.equal(result.ok, true);
  checkResolvedHandle(result.data);
}
function recheck(handle, apiAddress, owner, seconds = BLOCK_SECONDS) {
  transport.apiHandle(handle, apiAddress);
  transport.respond([utxo(handle.hex, owner, { block_time: seconds })]);
}
async function assertDrained() {
  // Infer queue removal through its actual external behavior, even after any
  // remaining grace period: no extra API/provider request or log is allowed.
  const before = { api: transport.apiRequests.length, koios: transport.requests.length, records: [...records] };
  now += 120000;
  await checkQueue();
  assert.deepEqual({ api: transport.apiRequests.length, koios: transport.requests.length, records }, before);
}

// Invariant: actual Koios seconds for a recent transfer receive a full grace
// period; API catch-up clears the queued mismatch without a persistent notice.
// Failure: raw seconds look ancient against Date.now. Removing provider *1000
// makes the FIRST queue-event assertion fail (the old implementation's bug).
test('recent provider seconds wait, then API catch-up clears the queue silently', async () => {
  await observe();
  assert.deepEqual(records, [queued(ALPHA)]);
  now = BLOCK_MS + 59999;
  await checkQueue();
  assert.deepEqual(transport.apiRequests, []);
  assert.equal(transport.requests.length, 1);
  assert.deepEqual(records, [queued(ALPHA)]);
  now = BLOCK_MS + 60000;
  recheck(ALPHA, 'new-alpha', 'new-alpha');
  await checkQueue();
  assert.deepEqual(transport.apiRequests, [apiRequest(ALPHA)]);
  assert.equal(transport.requests.length, 2);
  assert.deepEqual(records, [queued(ALPHA)]);
  await assertDrained();
});

// Invariant: a first mismatch at exactly 60s or older emits the original notice
// with exact old/new addresses and category, not a queue notice. Changing < to
// <= in checkResolvedHandle makes the exact-boundary record wrong.
test('exact-boundary and older observations report persistent mismatches immediately', async () => {
  now = BLOCK_MS + 60000;
  await observe();
  now = BLOCK_MS + 60001;
  await observe(BETA, 'new-beta');
  assert.deepEqual(records, [mismatch(ALPHA, 'new-alpha'), mismatch(BETA, 'new-beta')]);
  await assertDrained();
});

// Invariant: the same <60s grace expires at exactly 60s for a queued mismatch.
// Failure: strict < in queue eligibility delays a due recheck. Restoring that old
// comparator leaves only the queue record, failing the expected persistent notice.
test('persistent mismatch is noticed at exact queue expiry and removed', async () => {
  await observe();
  now = BLOCK_MS + 60000;
  recheck(ALPHA, ALPHA.resolvedAddress, 'new-alpha');
  await checkQueue();
  assert.deepEqual(records, [queued(ALPHA), mismatch(ALPHA, 'new-alpha')]);
  assert.deepEqual(transport.apiRequests, [apiRequest(ALPHA)]);
  await assertDrained();
});

// Invariant: API failure retains the queued record at the tail so other handles
// progress, and a later corrected API result clears it. Dropping the failed item,
// keeping it at the head, or emitting a mismatch on failure changes the exact
// request order/log payloads and makes this fail.
test('API failure retries at the tail without losing or starving queued handles', async () => {
  await observe();
  await observe(BETA, 'new-beta');
  now = BLOCK_MS + 60000;
  transport.apiFailure();
  await checkQueue();
  assert.deepEqual(records, [queued(ALPHA), queued(BETA), failure('Offline API unavailable')]);
  assert.equal(transport.requests.length, 2);
  recheck(BETA, BETA.resolvedAddress, 'new-beta');
  await checkQueue();
  recheck(ALPHA, 'new-alpha', 'new-alpha');
  await checkQueue();
  assert.deepEqual(transport.apiRequests, [apiRequest(ALPHA), apiRequest(BETA), apiRequest(ALPHA)]);
  assert.deepEqual(records, [queued(ALPHA), queued(BETA), failure('Offline API unavailable'), mismatch(BETA, 'new-beta')]);
  await assertDrained();
});

// Invariant: a failed chain lookup is an ERROR and retained work, not a fabricated
// ownership result. Dropping the item or turning failure into an empty/false
// owner notice fails both the recovery record and the real request/log sequence.
test('provider failure preserves the queue and later rechecks the real owner', async () => {
  await observe();
  now = BLOCK_MS + 60000;
  transport.apiHandle(ALPHA);
  transport.fail('Offline Koios unavailable');
  await checkQueue();
  assert.deepEqual(records, [queued(ALPHA), failure('Offline Koios unavailable')]);
  now += 1;
  recheck(ALPHA, ALPHA.resolvedAddress, 'new-alpha');
  await checkQueue();
  assert.deepEqual(transport.apiRequests, [apiRequest(ALPHA), apiRequest(ALPHA)]);
  assert.deepEqual(records, [queued(ALPHA), failure('Offline Koios unavailable'), mismatch(ALPHA, 'new-alpha')]);
  await assertDrained();
});

// Invariant: another transfer found during a recheck gets its OWN grace window
// and latest owner, not the old queued timestamp/address. Reusing the old record
// or retaining seconds causes early/wrong notices or extra requests before due.
test('a newer transfer found on recheck gets its own full grace window', async () => {
  await observe();
  now = BLOCK_MS + 60000;
  recheck(ALPHA, ALPHA.resolvedAddress, 'newer-owner', BLOCK_SECONDS + 50);
  await checkQueue();
  assert.deepEqual(records, [queued(ALPHA), queued(ALPHA)]);
  now = BLOCK_MS + 50000 + 59999;
  await checkQueue();
  assert.equal(transport.apiRequests.length, 1);
  assert.equal(transport.requests.length, 2);
  assert.deepEqual(records, [queued(ALPHA), queued(ALPHA)]);
  now += 1;
  recheck(ALPHA, ALPHA.resolvedAddress, 'newer-owner', BLOCK_SECONDS + 50);
  await checkQueue();
  assert.deepEqual(records, [queued(ALPHA), queued(ALPHA), mismatch(ALPHA, 'newer-owner')]);
  assert.deepEqual(transport.apiRequests, [apiRequest(ALPHA), apiRequest(ALPHA)]);
  await assertDrained();
});

// Invariant: an unchanged owner never queues or notifies. Removing the old/new
// comparison creates a queue record or request, failing these actual side effects.
test('unchanged ownership neither queues nor emits a mismatch notice', async () => {
  await observe(ALPHA, ALPHA.resolvedAddress);
  assert.deepEqual(records, []);
  await assertDrained();
});

// Invariant: the missing-asset Date.now fallback is already milliseconds and
// gets the same grace window; it must not be multiplied again. Normalizing in the
// queue/entire resolved record instead of the Koios boundary makes this fail.
test('missing-asset millisecond clock gets grace and clears after API catch-up', async () => {
  transport.respond([]);
  const result = await resolveHandle(ALPHA);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    name: ALPHA.name, hex: ALPHA.hex, oldResolvedAddress: ALPHA.resolvedAddress,
    newResolvedAddress: '', blockHeight: 0, blockTime: now,
  });
  checkResolvedHandle(result.data);
  assert.deepEqual(records, [queued(ALPHA)]);
  now += 59999;
  await checkQueue();
  assert.deepEqual(transport.apiRequests, []);
  now += 1;
  transport.apiHandle(ALPHA, '');
  transport.respond([]);
  await checkQueue();
  assert.deepEqual(records, [queued(ALPHA)]);
  assert.deepEqual(transport.apiRequests, [apiRequest(ALPHA)]);
  await assertDrained();
});
