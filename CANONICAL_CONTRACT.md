# api-address-fidelity-monitor canonical contract

**Status: proposal (ecosystem-ownership-plan row 5.3). Operator review pending.**

Monitor that compares api.handle.me resolved addresses with chain truth. The code that holds the rules below is listed in [`.enclave`](./.enclave);
K.O.R.A.'s `merge_pr` asks the operator before a change to it merges into `master`.

## Source requirements

- Ecosystem `AGENTS.md` (koralabs root): "Critical Correctness" (addresses 100% correct, never
  double-mint, chain-accurate properties) and "Merging" (double-mint, contract/settings edits and
  automated burns need operator approval).
- kora-bot `v3/docs/ecosystem-ownership-plan.md` §6 decision 2 (enclave = key/security material,
  prompt files, and the files that define, support or enforce this contract) and Phase 5 row 5.3
  ("every remaining repo, even if the enclave is empty; each AGENTS.md points at both").
- kora-bot `v3/docs/tool-surface.md` (`merge_pr`): cards enclave paths merged into
  `master`/`main`/`mainnet`/`preprod`, reading a root `.enclave`.
- Ecosystem `AGENTS.md` "Critical Correctness" (addresses correct 100% of the time).

## Must never be violated

1. **It reports every mismatch** between the api's resolved address and the chain; it never hides or auto-corrects one.
2. **No secrets in the repo.** Keys, tokens, mnemonics and `.env` values live in the box SOPS stores or local `.env.local.*` files, never in git or GitHub secrets copied from them.

## Where it is enforced today

| # | Code |
|---|---|
| 1 | `src/monitor.ts`, `src/resolve.ts` |

## Refactor needed for enforcement

- None found.
