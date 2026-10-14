const ROOT =
  "https://firestore.googleapis.com/v1/projects/nimbusdo/databases/(default)/documents";
const COLLECTION = "aiRelayJobs";
const JOB_ID = /^[A-Za-z0-9]{20}$/;
let identity;
function decode(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      value.stringValue ??
        value.timestampValue ??
        (value.integerValue !== undefined
          ? Number(value.integerValue)
          : value.booleanValue),
    ]),
  );
}
function encode(values) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === "number"
        ? { integerValue: String(value) }
        : { stringValue: String(value) },
    ]),
  );
}
async function relayIdentity(env, fetcher) {
  if (!env.FIREBASE_RELAY_REFRESH_TOKEN || !env.FIREBASE_RELAY_UID) return null;
  if (
    identity &&
    identity.uid === env.FIREBASE_RELAY_UID &&
    identity.expires > Date.now() + 60000
  )
    return identity.token;
  const response = await fetcher(
    `https://securetoken.googleapis.com/v1/token?key=${env.FIREBASE_PUBLIC_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: env.FIREBASE_RELAY_REFRESH_TOKEN,
      }),
    },
  );
  if (!response.ok) throw new Error("Relay identity unavailable");
  const result = await response.json();
  if (result.user_id !== env.FIREBASE_RELAY_UID || !result.id_token)
    throw new Error("Relay identity mismatch");
  identity = {
    uid: result.user_id,
    token: result.id_token,
    expires: Date.now() + Number(result.expires_in) * 1000,
  };
  return identity.token;
}
async function rest(fetcher, token, path, options = {}) {
  const response = await fetcher(ROOT + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) throw new Error(`Relay database status ${response.status}`);
  return response.json();
}
async function queryJobs(fetcher, token, status) {
  const result = await rest(fetcher, token, ":runQuery", {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: COLLECTION }],
        where: {
          fieldFilter: {
            field: { fieldPath: "status" },
            op: "EQUAL",
            value: { stringValue: status },
          },
        },
        limit: 3,
      },
    }),
  });
  return result.filter((row) => row.document).map((row) => row.document);
}
async function patch(fetcher, token, document, values) {
  const id = document.name.split("/").pop();
  const params = new URLSearchParams({
    "currentDocument.updateTime": document.updateTime,
  });
  for (const key of Object.keys(values))
    params.append("updateMask.fieldPaths", key);
  return rest(fetcher, token, `/${COLLECTION}/${id}?${params}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: encode(values) }),
  });
}
// Cron only enumerates the queue and delegates each job to a separate Worker
// invocation, keeping CPU work bounded. No user ID token is persisted in jobs.
export async function scheduleRelay(env, fetcher = fetch) {
  const token = await relayIdentity(env, fetcher);
  if (!token || !env.RELAY_PROCESSOR) return;
  const jobs = await queryJobs(fetcher, token, "pending");
  const outcomes = await Promise.allSettled(
    jobs.map((document) =>
      env.RELAY_PROCESSOR.fetch(
        new Request("https://nimbus-ai.internal/relay-process", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id: document.name.split("/").pop() }),
        }),
      ).then(response => {if(!response.ok)throw Error("Relay dispatch failed");}),
    ),
  );
  // Bounded cleanup avoids storing submitted prompts indefinitely. At most ten
  // completed/expired queue documents are removed per scheduled invocation.
  const stale = await rest(fetcher, token, ":runQuery", {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: COLLECTION }],
        where: {
          fieldFilter: {
            field: { fieldPath: "createdAt" },
            op: "LESS_THAN",
            value: {
              timestampValue: new Date(Date.now() - 86400000).toISOString(),
            },
          },
        },
        limit: 10,
      },
    }),
  });
  await Promise.allSettled(
    stale
      .filter((row) => row.document)
      .map((row) =>
        rest(
          fetcher,
          token,
          `/${COLLECTION}/${row.document.name.split("/").pop()}`,
          { method: "DELETE" },
        ),
      ),
  );
  const failed=outcomes.filter(result=>result.status==="rejected").length;
  if(failed)console.error("Firebase relay dispatch unavailable",failed);
  return {dispatched:jobs.length,failed};
}

export async function pollRelay(request,env,{fetcher=fetch,verify}={}){
  const token=request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
  try{
    if(!token || !env.FIREBASE_RELAY_UID || await verify(token,"nimbusdo",fetcher)!==env.FIREBASE_RELAY_UID)
      return Response.json({error:"Not authorized"},{status:401});
  }catch{return Response.json({error:"Not authorized"},{status:401});}
  try{
    const result=await scheduleRelay(env,fetcher);
    return Response.json(result||{error:"Relay inactive"},{status:result?200:503});
  }catch{return Response.json({error:"Relay polling unavailable"},{status:502});}
}

export async function processRelay(
  request,
  env,
  { fetcher = fetch, verify, run } = {},
) {
  const reply = (body, status) => Response.json(body, { status });
  const token = request.headers
    .get("Authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  if (!env.FIREBASE_RELAY_UID || !token)
    return reply({ error: "Not authorized" }, 401);
  let uid;
  try {
    uid = await verify(token, "nimbusdo", fetcher);
  } catch {
    return reply({ error: "Not authorized" }, 401);
  }
  if (uid !== env.FIREBASE_RELAY_UID)
    return reply({ error: "Not authorized" }, 403);
  let id;
  try {
    id = (await request.json()).id;
  } catch {
    return reply({ error: "Invalid job" }, 400);
  }
  if (typeof id !== "string" || !JOB_ID.test(id))
    return reply({ error: "Invalid job" }, 400);
  let claimed;
  try {
    const document = await rest(fetcher, token, `/${COLLECTION}/${id}`);
    const job = decode(document.fields);
    if (job.status !== "pending")
      return reply({ status: "skipped" }, 200);
    if (!Number.isFinite(Date.parse(job.createdAt)) || Date.parse(job.createdAt) < Date.now() - 180000) {
      await patch(fetcher,token,document,{status:"failed",error:"This queued request expired. Please send it again."});
      return reply({status:"expired"},200);
    }
    if (
      !["task", "general"].includes(job.mode) ||
      typeof job.ownerUid !== "string" ||
      !job.ownerUid ||
      typeof job.inputJson !== "string"
    )
      return reply({ error: "Invalid job" }, 400);
    // Firestore rules make ownerUid immutable and require the creator to match it.
    // A compare-and-swap claim prevents concurrent invocations from resubmitting.
    claimed = await patch(fetcher, token, document, { status: "processing" });
    let input;
    try {
      input = JSON.parse(job.inputJson);
    } catch {
      throw Error("Invalid job input");
    }
    const response = await run(job.mode, input, job.ownerUid);
    const body = await response.text();
    if (new TextEncoder().encode(body).length > 180000)
      throw Error("Relay response too large");
    await patch(fetcher, token, claimed, {
      status: "done",
      responseStatus: response.status,
      responseType: response.headers.get("Content-Type") || "application/json",
      responseText: body,
    });
    return reply({ status: "done" }, 200);
  } catch {
    // Never automatically resubmit a claimed job: it may already have consumed
    // allowance. Errors contain neither provider content nor credentials.
    if (claimed)
      await patch(fetcher, token, claimed, {
        status: "failed",
        error: "AI could not finish this queued request. Please retry.",
      }).catch(() => {});
    return reply({ error: "Relay processing unavailable" }, 502);
  }
}
