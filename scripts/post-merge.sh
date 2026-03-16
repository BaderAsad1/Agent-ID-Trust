#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
npx tsc -p lib/db/tsconfig.json --noEmit false
