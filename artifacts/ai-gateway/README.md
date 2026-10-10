# Nimbus AI gateway

A free Cloudflare Pages Function forwards General and Task AI requests to the existing `nimbus-ai` Worker using an internal service binding. This provides a `pages.dev` endpoint for browsers that block `workers.dev`. It holds no Groq key, retains the Nimbus origin restriction, and delegates Firebase token verification and rate limits to the existing Worker.

Deploy this directory using the official Wrangler CLI: `wrangler pages project create nimbus-ai-gateway --production-branch main`, then `wrangler pages deploy public --project-name nimbus-ai-gateway --branch main`. Pages deployment needs the Cloudflare Pages write OAuth scope. Activate the new frontend endpoint only after browser reachability, CORS, and authentication checks pass.

Run `node --test test/*.test.mjs` in this directory. `/health` is a minimal public connection probe; no account, token or provider data is exposed.
