import assert from 'node:assert/strict';
import { after, afterEach, mock, test } from 'node:test';

import {
  ALPHA, assertQuery as assertTransportQuery, BETA, expected, MISSING,
  offlineTransport, utxo,
} from './support/offline.mjs';

const transport = offlineTransport();
const { requests, respond, fail } = transport;
const assertQuery = (names) => assertTransportQuery(requests, names);
const { resolveHandle, resolveHandles } = await import('../src/resolve.ts');
after(() => transport.restore());
afterEach(() => { mock.restoreAll(); transport.reset(); });

// Feature: a changed owner is resolved by BOTH policy and asset name, preserving
// the old API address for comparison. Failure: first-output, policy-only or
// name-only selection assigns another asset's owner. Each weakened predicate or
// deleting either policy/hex half of the request makes these assertions fail.
// Koios wire seconds must also become the documented internal milliseconds.
test('single resolution selects the exact asset, not an unrelated output', async () => {
  respond([
    utxo(ALPHA.hex, 'wrong-policy', { asset_list: [{ policy_id: 'ff'.repeat(28), asset_name: ALPHA.hex }] }),
    utxo(BETA.hex, 'wrong-name'),
    utxo(ALPHA.hex, 'no-assets', { asset_list: null }),
    utxo(ALPHA.hex, 'new-alpha'),
  ]);
  const result = await resolveHandle(ALPHA);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, expected(ALPHA, 'new-alpha'));
  assertQuery([ALPHA.hex]);
});

// Feature: an unchanged owner stays equal on both sides of the fidelity result.
// Failure: replacing the old address or inventing a new one creates false drift.
// Returning an empty/new address instead of the matching owner makes this fail.
test('unchanged ownership retains equal old and new addresses', async () => {
  respond([utxo(ALPHA.hex, ALPHA.resolvedAddress)]);
  const result = await resolveHandle(ALPHA);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, expected(ALPHA, ALPHA.resolvedAddress));
  assertQuery([ALPHA.hex]);
});

// Feature: no matching asset is represented explicitly, never as another owner's
// address. Failure: using any returned UTxO as a fallback. Replacing find with
// assetUtxos[0] fails; removing the clock fallback also fails the fixed timestamp.
test('a missing asset retains the API address and returns empty chain resolution', async () => {
  mock.method(Date, 'now', () => 1800000000123);
  respond([utxo(BETA.hex, 'unrelated-owner')]);
  const result = await resolveHandle(ALPHA);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, expected(ALPHA, '', { blockHeight: 0, blockTime: 1800000000123 }));
  assertQuery([ALPHA.hex]);
});

// Feature: batch results retain input order and identity even when provider rows
// are reordered, absent or unrelated. Failure: positional pairing/cross-handle
// contamination. Pairing handles with UTxOs by array index makes this fail.
test('batch resolution matches each asset independently and preserves input order', async () => {
  mock.method(Date, 'now', () => 1800000000456);
  respond([
    utxo(BETA.hex, 'new-beta', { block_height: 23456, block_time: 1700000010 }),
    utxo(ALPHA.hex, 'wrong-policy', { asset_list: [{ policy_id: 'ff'.repeat(28), asset_name: ALPHA.hex }] }),
    utxo(ALPHA.hex, 'new-alpha'),
  ]);
  const result = await resolveHandles([ALPHA, MISSING, BETA]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, [
    expected(ALPHA, 'new-alpha'),
    expected(MISSING, '', { blockHeight: 0, blockTime: 1800000000456 }),
    expected(BETA, 'new-beta', { blockHeight: 23456, blockTime: 1700000010000 }),
  ]);
  assertQuery([ALPHA.hex, MISSING.hex, BETA.hex]);
});

// Feature: the empty batch returns an empty result, not an invented record.
// Failure: indexing the first handle unconditionally. That change fails this test.
// The current provider request for an empty asset list is intentionally preserved.
test('an empty batch has an empty query and result', async () => {
  respond([]);
  const result = await resolveHandles([]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, []);
  assertQuery([]);
});

// Feature: epoch zero is a valid seconds value, not an absent timestamp. Failure:
// truthy/magnitude guessing replaces it with Date.now. Restoring || instead of
// the missing-only ?? fallback makes this exact output fail.
test('provider epoch zero stays zero milliseconds instead of using the missing-asset clock', async () => {
  mock.method(Date, 'now', () => 1800000000123);
  respond([utxo(ALPHA.hex, 'new-alpha', { block_time: 0 })]);
  const result = await resolveHandle(ALPHA);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, expected(ALPHA, 'new-alpha', { blockTime: 0 }));
  assertQuery([ALPHA.hex]);
});

// Feature: a provider outage is an error with its actionable reason, not a
// successful empty address. Failure: swallowing transport errors as missing
// assets. Returning Ok(empty/default) in either catch makes these tests fail.
for (const [label, run, names] of [
  ['single', () => resolveHandle(ALPHA), [ALPHA.hex]],
  ['batch', () => resolveHandles([ALPHA, BETA]), [ALPHA.hex, BETA.hex]],
]) {
  test(`${label} resolution propagates a provider failure instead of false drift`, async () => {
    fail('offline provider unavailable');
    const result = await run();
    assert.equal(result.ok, false);
    assert.equal(result.error, 'offline provider unavailable');
    assertQuery(names);
  });
}

// Feature: malformed provider output fails the resolution instead of producing
// plausible owner addresses. Failure: accepting a non-array as empty success.
// Normalization now rejects this shape at the provider's map, before resolver
// matching; retain the exact error assertion at that earlier boundary. Returning
// Ok([]/empty address) on this schema error still makes these tests fail.
for (const [label, run, names] of [
  ['single', () => resolveHandle(ALPHA), [ALPHA.hex]],
  ['batch', () => resolveHandles([ALPHA]), [ALPHA.hex]],
]) {
  test(`${label} resolution rejects a malformed provider response`, async () => {
    respond({ unexpected: 'not an asset list' });
    const result = await run();
    assert.equal(result.ok, false);
    assert.equal(result.error, 'result.data.map is not a function');
    assertQuery(names);
  });
}
