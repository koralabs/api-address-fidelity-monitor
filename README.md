# api-address-fidelity-monitor

Handle API address resolution fidelity monitor.

Koios block timestamps arrive as Unix seconds and are normalized once at the provider boundary to Unix milliseconds. Recent address mismatches receive a 60-second grace window before a fresh API/provider recheck; API catch-up clears them, persistent mismatches keep the existing notice, and failed rechecks remain queued for retry.

See [CI checks, verified time contract, grace behavior and test coverage](CI.md). Run `pnpm test` for the offline native resolver/queue suite; it does not start the monitor or contact live providers.
