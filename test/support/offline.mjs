import assert from 'node:assert/strict';

import axios from 'axios';

export const POLICY = 'f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a';
export const BLOCK_SECONDS = 1700000000;
export const BLOCK_MS = 1700000000000;
export const ALPHA = { name: 'unit-alpha', hex: '756e69742d616c706861', resolvedAddress: 'old-alpha' };
export const BETA = { name: 'unit-beta', hex: '756e69742d62657461', resolvedAddress: 'old-beta' };
export const MISSING = { name: 'unit-missing', hex: '756e69742d6d697373696e67', resolvedAddress: 'old-missing' };

// Synthetic wire DTOs retain Koios's documented seconds contract. No real assets,
// live provider recordings, wallet or signing keys are used.
export function utxo(hex, address, overrides = {}) {
  return {
    tx_hash: 'ab'.repeat(32), tx_index: 0, address, value: '2000000',
    stake_address: null, payment_cred: null, epoch_no: 500,
    block_height: 12345, block_time: BLOCK_SECONDS,
    datum_hash: null, inline_datum: null, reference_script: null,
    asset_list: [{ policy_id: POLICY, asset_name: hex, finger_print: 'synthetic', decimals: 0, quantity: '1' }],
    is_spent: false,
    ...overrides,
  };
}

// Install before importing production modules: the real provider/interceptor and
// Axios transformations run, but all HTTP terminates at these explicit replies.
export function offlineTransport() {
  const originalAdapter = axios.defaults.adapter;
  const originalFetch = globalThis.fetch;
  const requests = [];
  const apiRequests = [];
  const replies = [];
  const apiReplies = [];
  axios.defaults.adapter = async (config) => {
    requests.push({ method: config.method, baseURL: config.baseURL, url: config.url, body: JSON.parse(config.data) });
    const reply = replies.shift();
    assert.ok(reply, 'Every Koios HTTP request needs an explicit offline reply');
    return reply(config);
  };
  globalThis.fetch = async (url, options) => {
    apiRequests.push({ url: String(url), method: options?.method || 'GET' });
    const response = apiReplies.shift();
    assert.ok(response, 'Every Handle API request needs an explicit offline reply');
    return response;
  };
  return {
    requests,
    apiRequests,
    respond(data) {
      replies.push((config) => ({ data, status: 200, statusText: 'OK', headers: {}, config }));
    },
    fail(message) {
      replies.push(() => { throw new Error(message); });
    },
    apiHandle(handle, address = handle.resolvedAddress) {
      apiReplies.push(new Response(JSON.stringify({
        name: handle.name, hex: handle.hex, resolved_addresses: { ada: address },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    },
    apiFailure() {
      apiReplies.push(new Response('', { status: 503, statusText: 'Offline API unavailable' }));
    },
    reset() {
      assert.equal(replies.length, 0, 'Every expected Koios reply must be consumed');
      assert.equal(apiReplies.length, 0, 'Every expected API reply must be consumed');
      requests.length = 0;
      apiRequests.length = 0;
    },
    restore() {
      axios.defaults.adapter = originalAdapter;
      globalThis.fetch = originalFetch;
    },
  };
}

export function expected(handle, address, overrides = {}) {
  return {
    name: handle.name, hex: handle.hex, oldResolvedAddress: handle.resolvedAddress,
    newResolvedAddress: address, blockHeight: 12345, blockTime: BLOCK_MS,
    ...overrides,
  };
}
export function assertQuery(requests, assetNames) {
  assert.deepEqual(requests, [{
    method: 'post', baseURL: 'https://api.koios.rest/api/v1', url: '/asset_utxos',
    body: { _asset_list: assetNames.map((hex) => [POLICY, hex]), _extended: true },
  }]);
}
