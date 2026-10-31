# api-address-fidelity-monitor canonical contract

I watch api.handle.me and check that the address it says each handle resolves to is the address the chain says holds that handle. The ecosystem rule is that handle addresses must be correct 100% of the time; I am the independent check on that rule. I only read and report. I never fix an address, write to the api, sign, or touch funds. The files that carry the rules below are listed in [`.enclave`](./.enclave); a change to them that merges into `master` needs operator approval. Authority: the ecosystem `AGENTS.md` "Critical Correctness" and "Logging Rules" sections, and kora-bot `v3/docs/ecosystem-ownership-plan.md` Phase 5.

## Invariants

1. **A mismatch is reported, never hidden or corrected.** If the api address differs from the chain address for the handle and the difference outlives the grace window, I log a `NOTIFY` event with the exact old and new addresses. Test: `test/queue.test.mjs` (persistent mismatch notice).
2. **Chain truth is the owner of the handle asset as Koios reports it**, matched on the exact Handles policy id and the exact asset name. An unrelated output, or a result for another asset, is never used. Test: `test/resolve.test.mjs` (exact policy/name selection, reordered and missing batch results).
3. **A handle with no chain owner found is a mismatch, not a match.** The chain address is empty, so it differs from any api address and is reported. Test: `test/resolve.test.mjs` (missing asset defaults).
4. **Times are milliseconds from the provider boundary on.** Koios block times arrive in seconds and are multiplied by exactly 1000 once, in `src/koios.ts`. Test: `test/queue.test.mjs` (recent provider-seconds input waits instead of notifying early).
5. **The grace window is 60,000 ms and its boundary is consistent.** A mismatch younger than the window is queued and rechecked with fresh api and chain data; a first mismatch at the window or older, and a queued item that comes due, are treated the same. A catch-up clears silently; a newer transfer gets its own full window. Test: `test/queue.test.mjs` (just before and exact expiry, API catch-up, newer transfer).
6. **A failed lookup never loses a queued handle.** API or Koios failure logs `ERROR` and returns the item to the queue tail for another check. Test: `test/queue.test.mjs` (failure and tail fairness, recovery).
7. **No secrets in git.** `HANDLE_ME_API_KEY` and `KOIOS_API_TOKEN` come from the environment (`.env.example` lists names only).

## Boundaries and known limits

- **Not enforced by a test:** a page-level failure. In `main.ts`, if fetching a page of handles or resolving it fails, that page is logged as `ERROR` and skipped until the next full pass, so the mismatches on it are not reported then. Invariant 1 is therefore "every mismatch that I manage to read". The full-list fetch (`fetchAllHandleNames`) does not check the HTTP status.
- **Known gap against the rate-limit rule:** the Koios and api.handle.me calls do not read `Retry-After` or rate-limit headers and have no shared wait. The ecosystem says HTTP code without this is unfinished; today the monitor relies on a fixed spacing of one day divided by the number of pages.
- Tests are offline and unmocked for decisions; they do not start the scheduler or call live providers, so shutdown and the periodic scheduling are untested.
- Reports go through the shared logger, so they only become alerts through the ecosystem's single alert path.

## Refactors needed to enforce this

- Route Koios and api.handle.me requests through one rate-limit helper that honors `Retry-After`, with a test that it waits.
- Re-queue a failed page instead of skipping it, and make `fetchAllHandleNames` fail on a non-2xx response; add tests for both.
- Add a negative-control test that a changed owner is still reported when the page loop recovers after a failure.
