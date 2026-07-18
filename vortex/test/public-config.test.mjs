import assert from "node:assert/strict";
import test from "node:test";
import { validateVortexPublicConfig, vortexPublicConfig } from "../runtime/public-config.mjs";

test("public Vortex config is disabled when either value is absent", () => {
  assert.deepEqual(vortexPublicConfig({}), { enabled: false });
  assert.deepEqual(validateVortexPublicConfig("https://vortex.example", ""), { enabled: false });
});

test("public Vortex config accepts one exact same-origin hosted SDK path", () => {
  assert.deepEqual(
    validateVortexPublicConfig(
      "https://vortex.example/",
      "https://vortex.example/sdk/v1/vortex-game-sdk.js"
    ),
    {
      enabled: true,
      vortexOrigin: "https://vortex.example",
      sdkUrl: "https://vortex.example/sdk/v1/vortex-game-sdk.js"
    }
  );
});

test("loopback development may use HTTP", () => {
  assert.equal(
    validateVortexPublicConfig(
      "http://game.localhost/",
      "http://game.localhost/sdk/v1/vortex-game-sdk.js"
    ).enabled,
    true
  );
  assert.equal(
    validateVortexPublicConfig(
      "http://127.0.0.1:3000/",
      "http://127.0.0.1:3000/sdk/v1/vortex-game-sdk.js"
    ).enabled,
    true
  );
});

test("unsafe origins and SDK URLs fail closed", () => {
  const unsafe = [
    ["http://vortex.example/", "http://vortex.example/sdk/v1/vortex-game-sdk.js"],
    ["https://user:secret@vortex.example/", "https://vortex.example/sdk/v1/vortex-game-sdk.js"],
    ["https://vortex.example/apps", "https://vortex.example/sdk/v1/vortex-game-sdk.js"],
    ["https://vortex.example/?token=secret", "https://vortex.example/sdk/v1/vortex-game-sdk.js"],
    ["https://vortex.example/", "https://evil.example/sdk/v1/vortex-game-sdk.js"],
    ["https://vortex.example/", "https://vortex.example/sdk/vortex-game-sdk.js"],
    ["https://vortex.example/", "https://vortex.example/sdk/v1/vortex-game-sdk.js?token=secret"],
    ["https://vortex.example/", "https://vortex.example/sdk/v1/vortex-game-sdk.js#fragment"]
  ];

  for (const [origin, sdk] of unsafe) {
    assert.deepEqual(validateVortexPublicConfig(origin, sdk), { enabled: false });
  }
});
