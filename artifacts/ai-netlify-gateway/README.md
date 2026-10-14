# Optional Netlify AI gateway

Prepared alternative hosting for Nimbus's existing authenticated backend. It is not deployed or active. It requires an eligible Netlify Free account and a network that permits the deployed application. It does not disable managed-browser protections or establish school approval.

Deploy this directory as the site's base with the Netlify CLI, using its `netlify.toml`. Free-plan usage is capped at 300 credits/month. Keep the account on Free; do not enable billing, buy credits, or enable auto recharge. This gateway invokes no Netlify AI model and stores no Groq key. Netlify will process the request's Firebase identity token and prompt while forwarding them to the existing Worker; do not activate it without authorization for that hosting destination.

Only `/health`, `/task`, and `/general` are routed. Upstream is fixed to the existing Worker, which verifies Firebase identity, bounds inputs, separates modes, and enforces user/provider limits. Unapproved origins and destinations are rejected. Responses stream; provider HTTP errors retain their status and retry timing. Health probes actually check backend reachability rather than just reporting a static success.

Activation is a separate step: verify the deployed gateway's CORS, authentication failures, streaming, and the school-approved network before changing `VITE_NIMBUS_AI_URL` to its confirmed URL and deploying Firebase. Never put provider keys in frontend configuration. Do not activate a guessed or unverified hostname.

Run `node --test test/*.test.mjs` from this directory. Account authorization and deployment are still required; local test success is not proof of school reachability.
