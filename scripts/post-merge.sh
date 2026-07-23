#!/bin/bash
set -e
corepack pnpm install --frozen-lockfile
pnpm --filter db push
