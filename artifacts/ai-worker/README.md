# Nimbus private AI endpoint

Firebase Hosting stays on Spark. This native Cloudflare Worker runs on Workers Free; no Firebase Functions or billing changes are needed. The browser sends a Firebase ID token, and the Worker verifies the signature and Nimbus audience before calling the selected assistant.

The corner Nimbus bubble opens Task AI. Switching to General AI opens a fullscreen glass view over the current page; minimizing preserves the draft and conversation, and reopening restores that mode. Legacy `/general` links open this same overlay.

General AI uses Cloudflare's native `@cf/google/gemma-4-26b-a4b-it` through the `AI` binding, with thinking enabled, a 4,096-token completion cap, streamed answers, and the essay review harness in `src/prompts.mjs`. No additional provider key is needed. This is the verified free capacity choice; it is not a claim of superiority over Gemini Flash. Task AI still uses Groq `openai/gpt-oss-20b`, low reasoning, and strict structured previews. General requests contain no workspace data. Task previews still require user confirmation in Nimbus. The model supports vision; the current chat composer remains text-only.

The Worker also supports GLM 5.3 through Mistral. Only after verifying model access with a real request, set the server-only `GENERAL_AI_PROVIDER` to `mistral` and configure its private `MISTRAL_API_KEY`. This selects `zai-glm-5-3` with maximum reasoning and an 8,192-token total completion cap. Only final text chunks are displayed and saved; provider thinking chunks never become chat answers. The client allows up to two minutes for a reasoning response. A missing key or provider error fails explicitly; it never silently substitutes another model. Keep Mistral API pay-as-you-go disabled. The account dashboard showed $10/month included API usage and listed GLM rate limits, but the real GLM request returned HTTP 403, "This model is not available in your subscription tier." Its authenticated model catalog also contained no GLM models. Rate-limit listings do not prove model access. GLM remains inactive until an eligible, zero-cost hosting arrangement is verified.

The deployed public URL is `https://nimbus-ai.nimbusdo-sidhvik-ai.workers.dev`. This URL is safe to put in browser configuration. **Never put a Groq key in a `VITE_*` variable.**

## Setup and deployment

Use the official Wrangler CLI, authorize Worker deployment, and deploy with this directory's `wrangler.jsonc`. Configure the key with `wrangler secret put GROQ_API_KEY`; enter it privately when prompted. Never paste a key into chat, commit it, or add it to frontend configuration. Alternatively, use an ignored `.dev.vars` locally and Wrangler's secret tooling to upload it without printing it.

The Worker accepts the production origin only. For local development, use Wrangler's local server and set `ALLOWED_ORIGIN` to the exact local Nimbus origin. Set the frontend's `VITE_NIMBUS_AI_URL` to that local endpoint. Production defaults to the deployed endpoint and can be overridden by that public environment variable.

A per-user limiter allows six requests per minute. On Workers Free, General AI stops when the shared 10,000-neuron daily allowance is exhausted. Keep the account on Workers Free: upgrading the account would change that platform-enforced spending boundary. Task AI has Groq's separate shared free quota. Nimbus reports limits and never activates billing or automatically switches General requests to another provider. Free service is quota-limited and is not an unlimited availability guarantee. Use only accounts and application uses permitted by the providers' current terms.

## Chats and sign-in

General chats, the assignment prompt, and rubric are stored under `users/{uid}/aiChats/{chatId}` in Firestore. Existing rules restrict this path to the signed-in owner. Users can delete conversations, start new ones, and reopen saved ones. Only the last eight messages are sent to the model; incomplete assistant answers are excluded. Long conversations and requests are bounded to protect free allowances. A deleted Nimbus chat is removed from Firestore; deletion does not promise removal from provider logs.

Firebase uses local auth persistence. When a session is restored, visiting Nimbus's root redirects to My Day. Signing out, clearing browser storage, using a different browser, or private browsing can require a new login.

## Verification

From the repository root, run `pnpm --filter @workspace/api-server exec node --import tsx --test ../ai-worker/test/worker.test.mjs`. Worker tests cover actual Firebase JWT signatures, auth rejection, mode isolation, rate limiting, safe upstream failures, and structured responses. Frontend stream tests live in `artifacts/api-server/test/generalStream.test.mjs` alongside existing task tests. Browser verification exercises copying, saved chats, context, fullscreen, mobile layouts, and navigation. A real provider smoke test requires a configured Groq secret.

Simple task dates and project containers use the shared deterministic capture parser before a model request. Unnamed tasks retain an empty title, displayed as “Untitled task” in the preview. Next week means seven days after the supplied local date, and next Monday is the next future Monday. Project confirmation saves each task with its project ID and subject.

Date parsing accepts common scheduling typos and short forms, including `tmrw`, `tmr`, `tomorow`, `tommorrow`, `yday`, `tdy`, `next mon`, `next wk`, and `Octomber 21`. Correction applies only to the parser's view of dates. Original task titles and checklist text stay intact; quoted names, project/subject tags, and ordinary words such as `SAT` and `sun` are protected. Both My Day quick capture and Task AI share this parser.
