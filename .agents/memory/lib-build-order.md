---
name: Lib build order
description: Composite libs must be built before leaf-package typechecks; otherwise declaration files are missing and TS6305 errors appear.
---

Run `pnpm run typecheck:libs` (which runs `tsc --build`) before running `pnpm --filter @workspace/<leaf> run typecheck`.
The root `pnpm run typecheck` script already does both in the right order.

**Why:** `lib/replit-auth-web` (and any other composite lib) emits `.d.ts` files to `dist/`. Leaf packages import from `dist/index.d.ts`. If those files haven't been built yet, TypeScript reports TS6305 ("Output file has not been built from source file").

**How to apply:** Whenever adding a new composite lib or after a clean checkout, run `pnpm run typecheck:libs` first. CI / the root `typecheck` script handles this automatically.
