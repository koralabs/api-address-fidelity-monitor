# Pull request checks

Every pull request runs a frozen pnpm install, ESLint, and TypeScript no-emit compilation on Node 22. These are actual checks over the project; the monitor is never started in CI and receives no credentials.

The ESLint configuration declares Node globals only for CommonJS files, correcting the false `module is not defined` failure in `ecosystem.config.cjs`. All existing recommended lint rules remain enabled. A negative control is removing that CommonJS override: `pnpm exec eslint .` must fail on `module` again.

## Explicit gaps

There is no unit-test suite, no separate bundle/build script, and no dedicated test harness. Type checking and lint are not represented as tests. Live address-fidelity checks, signing, wallet operations, browser journeys, and network probes are not invoked by this workflow.
