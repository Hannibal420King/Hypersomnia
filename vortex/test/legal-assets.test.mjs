import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repoUrl = new URL("../../", import.meta.url);
const readRepoFile = (relative, encoding) => readFile(new URL(relative, repoUrl), encoding);

test("AGPL and source obligations are visible and specific", async () => {
  const [license, notice, deployment] = await Promise.all([
    readRepoFile("LICENSE.md", "utf8"),
    readRepoFile("vortex/SOURCE_AND_ATTRIBUTION.md", "utf8"),
    readRepoFile("vortex/DEPLOYMENT.md", "utf8")
  ]);
  assert.match(license, /GNU AFFERO GENERAL PUBLIC LICENSE/i);
  assert.match(notice, /without warranty/i);
  assert.match(notice, /Hannibal420King\/Hypersomnia\/tree\/vortex-v2/);
  assert.match(notice, /TeamHypersomnia\/Hypersomnia/);
  assert.match(notice, /8f5dbc6c951b22b48d4e332dd499960a8fa2fcee/);
  assert.match(notice, /2b6fef2c3dded7b1d206ad17b050dfa490267a4dbe6581813a7d023694f611b5/);
  assert.match(notice, /extracts `Hypersomnia-Headless\.AppImage`/i);
  assert.match(notice, /final game invocation uses `exec`/i);
  assert.match(notice, /3\.7\.9-2\+deb12u7/);
  assert.match(deployment, /UDP port 9000/i);
  assert.match(deployment, /Both services use a read-only root filesystem/i);
  assert.match(deployment, /complete `\/home\/hypersomniac\/\.config\/Hypersomnia`/i);
  assert.match(deployment, /Import all six catalog assets/i);
  assert.doesNotMatch(notice, /screenshots remain .*pending/i);
});

test("catalog contains the three approved generated assets and three real gameplay captures", async () => {
  const manifest = JSON.parse(await readRepoFile("vortex/assets/catalog/asset-manifest.json", "utf8"));
  const expected = new Map([
    ["icon.png", { kind: "ICON", width: 1024, height: 1024, byteSize: 2245765, sha256: "63d0a269222e46e9d0f8d88b4d2dba6f1c7b89816c228f028b84e8680972b290" }],
    ["card.webp", { kind: "CARD", width: 1536, height: 864, byteSize: 374790, sha256: "248468f85b90ba07952268decd5efafd7227392257daef9765dbea79ecf38884" }],
    ["hero.webp", { kind: "HERO", width: 2048, height: 896, byteSize: 188980, sha256: "63f57731c628167e4ee2b65c714b02108e4b3620df36ad3ba1faa3515ab57bf4" }],
    ["screenshots/01.webp", { kind: "SCREENSHOT", width: 1920, height: 1080, byteSize: 243924, sha256: "207534d43858e464fd3c9142fe599647acf37203fd556b9befbcd243a74ab0d9" }],
    ["screenshots/02.webp", { kind: "SCREENSHOT", width: 1920, height: 1080, byteSize: 326320, sha256: "3cd076ce9f927467bb7e1c861d614dd72f8206029310e4fd4aa9223b4d3ab7fe" }],
    ["screenshots/03.webp", { kind: "SCREENSHOT", width: 1920, height: 1080, byteSize: 379876, sha256: "8bf54c735c9bc7d9b8bb0e52cac6b45e1ae7b7d0ea274e44130ec8eabfe86a1c" }]
  ]);

  assert.equal(manifest.schemaVersion, "1.0");
  assert.deepEqual(manifest.game, { slug: "hypersomnia", name: "Hypersomnia" });
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.assets.length, 6);
  assert.equal(manifest.assets.filter((asset) => asset.kind === "ICON").length, 1);
  assert.equal(manifest.assets.filter((asset) => asset.kind === "CARD").length, 1);
  assert.equal(manifest.assets.filter((asset) => asset.kind === "HERO").length, 1);
  assert.deepEqual(
    manifest.assets.filter((asset) => asset.kind === "SCREENSHOT").map((asset) => asset.filename),
    ["screenshots/01.webp", "screenshots/02.webp", "screenshots/03.webp"]
  );

  for (const asset of manifest.assets) {
    const expectedAsset = expected.get(asset.filename);
    assert.ok(expectedAsset, `unexpected asset filename ${asset.filename}`);
    assert.deepEqual(
      {
        kind: asset.kind,
        width: asset.width,
        height: asset.height,
        byteSize: asset.byteSize,
        sha256: asset.sha256
      },
      expectedAsset
    );
    assert.ok(asset.altText.length > 20);
    if (asset.kind === "SCREENSHOT") {
      assert.equal(asset.provenance.type, "REAL_GAMEPLAY_CAPTURE");
      assert.equal(asset.generationPrompt, null);
      assert.equal(asset.license.identifier, "AGPL-3.0");
    }
    else {
      assert.equal(asset.provenance.type, "GENERATED_ORIGINAL");
      assert.equal(asset.license.identifier, "LicenseRef-Vortex-Generated-Original");
      assert.ok(asset.generationPrompt.length > 100);
    }

    const bytes = await readRepoFile(`vortex/assets/catalog/${asset.filename}`);
    assert.equal(bytes.byteLength, expectedAsset.byteSize);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedAsset.sha256);
  }
});

test("browser adapter emits only declared events and ends play only on explicit return", async () => {
  const [adapter, common, cmake] = await Promise.all([
    readRepoFile("cmake/web/assets/vortex.js", "utf8"),
    readRepoFile("cmake/web/assets/common.js", "utf8"),
    readRepoFile("CMakeLists.txt", "utf8")
  ]);
  const trackedKeys = [...`${adapter}\n${common}`.matchAll(/["'](hypersomnia\.[a-z.]+)["']/g)].map((match) => match[1]);
  assert.deepEqual(new Set(trackedKeys), new Set([
    "hypersomnia.gameplay.entered",
    "hypersomnia.session.joined"
  ]));
  assert.match(adapter, /client\.play\.end\("quit"\)/);
  assert.doesNotMatch(adapter, /(beforeunload|pagehide|visibilitychange)/);
  assert.match(common, /sdk_gameplay_start\(\)[\s\S]*hypersomnia\.gameplay\.entered/);
  assert.match(common, /locStr\.startsWith\('\/game\/'\)[\s\S]*hypersomnia\.session\.joined/);
  assert.match(cmake, /EXPORTED_RUNTIME_METHODS=ccall,HEAPU8,HEAPU32/);
});
