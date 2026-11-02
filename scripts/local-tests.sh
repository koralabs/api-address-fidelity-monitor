#!/usr/bin/env bash
# Local test run recorded by adahandle-deployments/common/test-evidence.sh (replaces the old Actions tests).
set -euo pipefail
( set -e; pnpm install --frozen-lockfile )
( set -e; pnpm exec eslint . )
( set -e; pnpm exec tsc --noEmit )
( set -e; pnpm install --frozen-lockfile --ignore-scripts )
( set -e; pnpm test )
