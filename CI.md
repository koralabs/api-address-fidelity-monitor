# Pull request checks

Every pull request and default-branch push runs two independent checks on Node 22:

- **Install, lint and typecheck**: the existing frozen pnpm install, ESLint and TypeScript no-emit compilation. This required context is preserved, not renamed or replaced by tests.
- **Address resolution unit tests**: frozen installation and `pnpm test`, using the built-in Node test runner with the existing tsx dependency. No new dependency or application source change is needed. The new context is required only after its tested head and actual default run succeed.

The monitor entrypoint and its infinite loop/intervals are never started. No credentials, live provider recordings, wallet/signing/on-chain calls, browser/e2e journeys or deployments are used.

## Real resolver coverage

`test/resolve.test.mjs` imports the production `resolveHandle` and `resolveHandles`, and exercises the real KoiosProvider, Axios request construction/interceptor/transforms, asset matching and error conversion. Only the Axios HTTP adapter is replaced with an in-memory transport; Date.now is fixed in missing-asset cases. The unit under test and the provider implementation are not mocked.

The nine cases validate concrete resolved records and outbound query payloads:

- Exact policy **and** asset-name matching despite wrong-policy, wrong-name and no-asset outputs; preservation of old API address and selection of the new chain address.
- Unchanged owner equality, rather than inventing drift.
- Missing asset: explicit empty new address, preserved old address and current clock/default fields, never an unrelated owner.
- Batch identity/input order with reordered provider rows and an absent asset.
- Empty batch/query behavior.
- Transport failures for single and batch resolution return the provider error, not successful empty addresses.
- Malformed non-array provider output returns an error for single and batch resolution, not fabricated owner data.

Each case documents the invariant, failure and exact change that would make it fail. For example, removing the policy predicate selects the deliberately first wrong-policy output; positional batch matching pairs the wrong owners; swallowing failures as Ok(empty) fails the error assertions. This is not status-only, source-text or helper-only coverage.

Run locally with `pnpm test` after dependency installation. The test command runs from the test directory so the production dotenv calls do not read a root operator `.env` file. All provider DTOs are synthetic and the adapter consumes only explicitly queued replies; no network transport is invoked.

## Existing lint rule

The ESLint configuration declares Node globals only for CommonJS files, correcting the false `module is not defined` failure in `ecosystem.config.cjs`. All existing recommended lint rules remain enabled. A negative control is removing that CommonJS override: `pnpm exec eslint .` must fail on `module` again. The new test file passes the existing configuration without weakening any rule.

## Remaining gaps and preserved behavior

There is still no separate bundle/build target. These are native resolver unit tests, not live address-fidelity or full monitor acceptance. Pagination/fetch wrappers, queue timing/rechecks, alert emission, shutdown and long-running scheduling are not covered by this suite.

The resolver currently passes the provider's block_time through unchanged while missing-asset timestamps use Date.now; the monitor compares blockTime with Date.now for a millisecond grace window. The tests preserve and expose the current resolver output contract, not validate that queue time units are consistent. In particular, provider second-based timestamps versus millisecond queue arithmetic need a separately scoped runtime correction/test. No timestamp normalization or other fidelity semantics were changed just to make this CI green.
