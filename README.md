# api-address-fidelity-monitor

## Contributor test policy

Tests and coverage run locally only, never in GitHub Actions, directly or via lifecycle scripts, composites, workflow templates, or shared helpers. Preserve local test commands. Build, lint, publication, deployment, and production guards remain permitted. Retire obsolete required test checks from branch protections.

Handle API address resolution fidelity monitor.

Koios block timestamps arrive as Unix seconds and are normalized once at the provider boundary to Unix milliseconds. Recent address mismatches receive a 60-second grace window before a fresh API/provider recheck; API catch-up clears them, persistent mismatches keep the existing notice, and failed rechecks remain queued for retry.

See [CI checks, verified time contract, grace behavior and test coverage](CI.md). Run `pnpm test` for the offline native resolver/queue suite; it does not start the monitor or contact live providers.
