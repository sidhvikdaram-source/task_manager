import test from "node:test";
import assert from "node:assert/strict";
import {createGateway} from "../netlify/edge-functions/nimbus-ai.js";
const origin = "https://nimbusdo.firebaseapp.com";
const req = (path, method="POST", requestOrigin=origin) => new Request(`https://fixture.netlify.app${path}`, {
  method, headers:{Origin:requestOrigin,"Content-Type":"text/plain;charset=UTF-8"},
  ...(method==="POST"?{body:JSON.stringify({message:"Hello",firebaseIdToken:"fixture-identity"})}:{}),
});
test("both AI modes preserve signed transport, streaming, and quota errors",async()=>{
  for(const path of ["/task","/general"]){
    const gateway=createGateway(async request=>{
      assert.equal(request.url,`https://nimbus-ai.nimbusdo-sidhvik-ai.workers.dev${path}`);
      assert.equal(request.headers.get("Origin"),origin);
      assert.equal((await request.json()).firebaseIdToken,"fixture-identity");
      return new Response("data: fixture\n\n",{headers:{"Content-Type":"text/event-stream","Set-Cookie":"private-fixture"}});
    });
    const response=await gateway(req(path+"?url=https://evil.invalid"));
    assert.equal(response.headers.get("Access-Control-Allow-Origin"),origin);
    assert.equal(response.headers.get("Content-Type"),"text/event-stream");
    assert.equal(response.headers.get("Set-Cookie"),null);
    assert.equal(await response.text(),"data: fixture\n\n");
  }
  const response=await createGateway(async()=>Response.json({error:"Wait"},{status:429,headers:{"Retry-After":"60"}}))(req("/general"));
  assert.equal(response.status,429);
  assert.equal(response.headers.get("Retry-After"),"60");
});
test("unsupported origins, paths, methods, and oversized requests fail closed",async()=>{
  const gateway=createGateway(async()=>{throw Error("Must not forward");});
  assert.equal((await gateway(req("/general","POST","https://evil.invalid"))).status,403);
  assert.equal((await gateway(req("/elsewhere"))).status,404);
  assert.equal((await gateway(req("/general","GET"))).status,405);
  const oversized=req("/task");oversized.headers.set("Content-Length","100001");
  assert.equal((await gateway(oversized)).status,413);
});
test("health verifies upstream without identity and failures expose no credentials",async()=>{
  const response=await createGateway(async(url,options)=>{
    assert.equal(url,"https://nimbus-ai.nimbusdo-sidhvik-ai.workers.dev/health");
    assert.equal(options.body,undefined);
    assert.equal(options.headers.Authorization,undefined);
    return Response.json({status:"ok"});
  })(req("/health","GET"));
  assert.deepEqual(await response.json(),{service:"nimbus-ai",status:"ok"});
  const error=await createGateway(async()=>{throw Error("private-fixture");})(req("/general"));
  assert.equal(error.status,502);
  assert.doesNotMatch(await error.text(),/private-fixture/);
});
