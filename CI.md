# Pull request checks

Every pull request and default-branch push runs two independent required checks on Node 22:

- **Install, lint and typecheck**: the existing frozen pnpm install, ESLint and TypeScript no-emit compilation.
- **Address resolution unit tests**: frozen installation and `pnpm test`, using the built-in Node test runner with the existing tsx dependency. No new dependency or weakened lint/typecheck rule is needed.

The monitor entrypoint and indefinite loop/intervals are never started by tests. No credentials, live provider recordings, wallet/signing/on-chain calls, browser/e2e journeys or deployments are used. The test command runs from the test directory so production dotenv calls do not read a root operator .env file.

## Time contract and root correction

Koios `asset_utxos.block_time` is integer **Unix seconds**. This is verified against the current official [API documentation](https://www.koios.rest/api.html#mainnet) and the endpoint's [published implementation](https://github.com/cardano-community/koios-artifacts/blob/c17697c1a6a6346bda24fbc28ca16f96c3937d0a/files/grest/rpc/assets/asset_utxos.sql): the returned column is `block_time integer`, populated by `EXTRACT(EPOCH FROM b.time)::integer`. The production client calls that `/asset_utxos` endpoint on Koios's v1 API; it previously copied this seconds value into a millisecond comparison.

The raw `KoiosAssetUTxO.block_time` type documents seconds. The KoiosProvider normalizes once, on receipt, to the internal `AssetUTxO.blockTime` in **Unix milliseconds**, multiplying by exactly 1000. It removes the raw seconds field from the internal shape so consumers cannot accidentally reuse it. There is no magnitude detection, guessed unit, or normalization fallback.

Both resolvers pass that internal millisecond value through to `ResolvedHandle.blockTime`. Only a missing asset uses `Date.now()`, already milliseconds; nullish fallback preserves a valid zero timestamp rather than substituting the clock. Address policy/name matching, old/new address selection and all other asset fields are unchanged.

The failure was premature mismatch notices: a recent provider seconds value looked decades old when subtracted from Date.now. The upstream condition was a numeric timestamp with no enforced/documented unit boundary. Normalization at the provider boundary is the root fix, not downstream magnitude guessing or a delay fallback.

## Grace and queue behavior

The existing grace contract is 60,000 milliseconds:

- An unchanged old/new owner neither queues nor notifies.
- A mismatch observed within the grace window queues for recheck and retains the original NOTIFY queue event.
- A first mismatch at exactly 60 seconds or older emits the original persistent-mismatch NOTIFY event.
- A queued item becomes eligible at `blockTime + 60000 <= Date.now()`, matching that same boundary. Previously its strict comparison delayed exact-boundary work even though a new observation at the same age would notify.
- A due item fetches the current Handle API record and resolves the actual provider data again. API catch-up clears it silently; a persistent mismatch reports exact old/new addresses; a newer transfer gets its own full grace window.
- API or provider failure emits the original ERROR event and moves the item to the queue tail for another check, without losing it or starving another queued handle.

No notice event names, messages or categories were changed. The only decision changes are the corrected time unit and consistent exact-expiry eligibility. The existing 30-second queue scheduling interval, request authentication, ownership matching, signing/financial/on-chain behavior and startup/shutdown paths are unchanged.

## Real tests and negative controls

The native suite has **18 cases**. Production resolver/provider/queue/decision functions run unmocked. Only the Axios HTTP transport, fetch HTTP transport, Date.now and Logger.log sink are controlled. Each queue test uses a separate real main-module instance with its own private queue; tests never inject or manipulate queue contents. Queue retention/removal/order is proven by actual subsequent HTTP requests and log records, including a later clock advance that exposes any leftover work.

The original nine resolver cases remain: exact policy/name selection amid unrelated outputs, unchanged owner equality, missing asset defaults, reordered/missing batch results, empty batch, single/batch transport errors, and single/batch malformed responses. Full address records and outbound query contracts remain asserted. Their successful provider timestamps now assert the documented milliseconds contract, while missing Date.now results remain unchanged. Since normalization traverses the response at the provider boundary, malformed non-array data now fails at the provider's map rather than the resolver's find; the exact error is still asserted, not converted to status-only or successful empty data. One additional resolver case checks that epoch zero is preserved without fallback.

Eight queue/grace cases cover recent real provider-seconds inputs waiting, just-before and exact expiry, exact/older first-observation notices, silent API catch-up, persistent mismatch removal, API failure and tail fairness, provider failure and recovery, a newer transfer's independent grace period, unchanged ownership and missing-asset millisecond timing (some cases combine successive observations to prove state transitions).

Two executed old-behavior controls establish that the tests reproduce the incident rather than only matching new code:

1. With only testability exports and the old seconds implementation, the recent-transfer test fails its FIRST event assertion: it sees `HandleAddressResolver.newResolvedAddress` instead of `HandleAddressResolver.queueNewResolvedAddress`.
2. With milliseconds fixed but the old strict queue comparator retained, the exact-expiry test fails because the persistent notice/recheck is missing at 60,000 milliseconds.

Test comments also identify precise regressions: removing the policy predicate selects the wrong owner, positional batch pairing contaminates results, dropping/reordering failed queue work changes recovery request order, swallowing failures creates false owner results, and reusing an old queued timestamp reports a newer transfer too early. These are behavior/output/side-effect controls, not source-text or mocked-unit assertions.

## Remaining coverage boundaries

The suite does not start the long-running scheduler, make live API/protocol calls, validate browser/wallet journeys, or claim full production acceptance. Pagination/list wrappers, signal-driven shutdown and periodic scheduling remain outside this suite. There is no separate bundle/build target. The existing recommended ESLint rules and CommonJS Node-globals override remain intact.
