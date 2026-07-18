import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createGateway } from "../runtime/server.mjs";

test("gateway serves health, safe public config, legal material, WASM, and SPA fallback", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hypersomnia-gateway-"));
  const webRoot = path.join(root, "web");
  const licensePath = path.join(root, "LICENSE.md");
  const noticePath = path.join(root, "SOURCE_AND_ATTRIBUTION.md");
  await mkdir(webRoot);
  await Promise.all([
    writeFile(path.join(webRoot, "Hypersomnia.html"), "<!doctype html><title>Hypersomnia</title>"),
    writeFile(path.join(webRoot, "Hypersomnia.wasm"), Buffer.from([0x00, 0x61, 0x73, 0x6d])),
    writeFile(licensePath, "GNU AFFERO GENERAL PUBLIC LICENSE\n"),
    writeFile(noticePath, "Corresponding source is published for this modified build.\n")
  ]);

  const gateway = createGateway({
    webRoot,
    licensePath,
    noticePath,
    environment: {
      VORTEX_PUBLIC_URL: "https://vortex.example/",
      VORTEX_SDK_URL: "https://vortex.example/sdk/v1/vortex-game-sdk.js"
    }
  });
  await new Promise((resolve, reject) => {
    gateway.once("error", reject);
    gateway.listen(0, "127.0.0.1", resolve);
  });
  context.after(async () => {
    await new Promise((resolve) => gateway.close(resolve));
    await rm(root, { recursive: true, force: true });
  });

  const address = gateway.address();
  const base = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
  assert.equal(health.headers.get("cache-control"), "no-store");
  assert.equal(health.headers.get("cross-origin-opener-policy"), "same-origin");

  const config = await fetch(`${base}/api/vortex/config`);
  const configText = await config.text();
  assert.deepEqual(JSON.parse(configText), {
    enabled: true,
    vortexOrigin: "https://vortex.example",
    sdkUrl: "https://vortex.example/sdk/v1/vortex-game-sdk.js"
  });
  assert.doesNotMatch(configText, /(secret|token|password)/i);

  const license = await fetch(`${base}/legal/license`);
  assert.equal(license.status, 200);
  assert.match(await license.text(), /GNU AFFERO/);

  const source = await fetch(`${base}/legal/source`);
  assert.equal(source.status, 200);
  const sourceHtml = await source.text();
  assert.match(sourceHtml, /Corresponding source for the Vortex fork/);
  assert.match(sourceHtml, /GNU AGPL-3\.0/);

  const wasm = await fetch(`${base}/Hypersomnia.wasm`);
  assert.equal(wasm.headers.get("content-type"), "application/wasm");
  assert.deepEqual(Buffer.from(await wasm.arrayBuffer()), Buffer.from([0x00, 0x61, 0x73, 0x6d]));

  const fallback = await fetch(`${base}/game/example-session`);
  assert.equal(fallback.status, 200);
  assert.match(await fallback.text(), /Hypersomnia/);

  const invalid = await fetch(`${base}/..%5csecret`);
  assert.equal(invalid.status, 400);
  const post = await fetch(`${base}/Hypersomnia.html`, { method: "POST" });
  assert.equal(post.status, 405);
});
