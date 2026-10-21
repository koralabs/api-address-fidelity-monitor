import assert from 'node:assert/strict';
import { after, afterEach, mock, test } from 'node:test';

import axios from 'axios';

// Replace only Axios's HTTP transport, before the real KoiosProvider creates its
// client. The resolver, provider, request interceptor and Axios transforms all run.
// No socket, provider response recording, wallet, signing key or live fixture.
const originalAdapter = axios.defaults.adapter;
const requests = [];
const replies = [];
axios.defaults.adapter = async (config) => {
  requests.push({
    method: config.method,
    baseURL: config.baseURL,
    url: config.url,
    body: JSON.parse(config.data),
  });
  const reply = replies.shift();
  assert.ok(reply, 'Every HTTP request must have an explicit offline reply');
  return reply(config);
};
const { resolveHandle, resolveHandles } = await import('../src/resolve.ts');

after(() => { axios.defaults.adapter = originalAdapter; });
afterEach(() => {
  mock.restoreAll();
  assert.equal(replies.length, 0, 'The resolver must consume its expected request');
  requests.length = 0;
  replies.length = 0;
});

const POLICY = 'f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a';
const ALPHA = { name: 'unit-alpha', hex: '756e69742d616c706861', resolvedAddress: 'old-alpha' };
const BETA = { name: 'unit-beta', hex: '756e69742d62657461', resolvedAddress: 'old-beta' };
const MISSING = { name: 'unit-missing', hex: '756e69742d6d697373696e67', resolvedAddress: 'old-missing' };

// Synthetic Koios DTOs, not chain-resident assets or live provider fixtures.
function utxo(hex, address, overrides = {}) {
  return {
    tx_hash: 'ab'.repeat(32), tx_index: 0, address, value: '2000000',
    stake_address: null, payment_cred: null, epoch_no: 500,
    block_height: 12345, block_time: 1700000000,
    datum_hash: null, inline_datum: null, reference_script: null,
    asset_list: [{ policy_id: POLICY, asset_name: hex, finger_print: 'synthetic', decimals: 0, quantity: '1' }],
    is_spent: false,
    ...overrides,
  };
}
function respond(data) {
  replies.push((config) => ({ data, status: 200, statusText: 'OK', headers: {}, config }));
}
function fail(message) {
  replies.push(() => { throw new Error(message); });
}
function expected(handle, address, overrides = {}) {
  return {
    name: handle.name, hex: handle.hex, oldResolvedAddress: handle.resolvedAddress,
    newResolvedAddress: address, blockHeight: 12345, blockTime: 1700000000,
    ...overrides,
  };
}
function assertQuery(assetNames) {
  assert.deepEqual(requests, [{
    method: 'post', baseURL: 'https://api.koios.rest/api/v1', url: '/asset_utxos',
    body: { _asset_list: assetNames.map((hex) => [POLICY, hex]), _extended: true },
  }]);
}

// Feature: a changed owner is resolved by BOTH policy and asset name, preserving
// the old API address for comparison. Failure: first-output, policy-only or
// name-only selection assigns another asset's owner. Each weakened predicate or
// deleting either policy/hex half of the request makes these assertions fail.
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
    expected(BETA, 'new-beta', { blockHeight: 23456, blockTime: 1700000010 }),
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
// Returning Ok([]/empty address) on this schema error makes these tests fail.
for (const [label, run, names] of [
  ['single', () => resolveHandle(ALPHA), [ALPHA.hex]],
  ['batch', () => resolveHandles([ALPHA]), [ALPHA.hex]],
]) {
  test(`${label} resolution rejects a malformed provider response`, async () => {
    respond({ unexpected: 'not an asset list' });
    const result = await run();
    assert.equal(result.ok, false);
    assert.equal(result.error, 'assetUtxos.find is not a function');
    assertQuery(names);
  });
}
