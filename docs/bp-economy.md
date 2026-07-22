# Velocity BP Economy

Velocity uses two separate progression values:

- **VP** is permanent experience. It raises tiers, progress, and achievements and is never spent.
- **BP** is the optional store currency. Purchases are validated and recorded by the server.

## Award sources

BP is awarded through idempotent transaction receipts for the first completed task of a local day, weekly reviews, Momentum milestones, achievement/title unlocks, and reward chests. Momentum is the lifetime number of distinct days on which a task was completed. It never resets or decreases.

## Server controls

Economy values and inventory live in `artifacts/api-server/src/lib/economyConfig.ts`. The BP service serializes balance changes per user, rejects negative balances, and writes an immutable receipt before a balance change is committed. Store prices, lock requirements, ownership, equipped items, chest upgrades, and chest rewards are never accepted from the client.

The startup migration adds BP balances, lifetime BP, chest keys, chest reward fields, equipped cosmetic slots, and the `bp_transactions` ledger. Existing VP totals, owned cosmetics, and legacy chest rewards are preserved.
