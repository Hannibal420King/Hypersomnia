import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(
  await readFile(new URL("../../vortex.manifest.json", import.meta.url), "utf8")
);

const baselineScopes = [
  "identity.basic",
  "play.write",
  "events.write",
  "gamification.read",
  "rewards.read"
];

test("manifest requests only the baseline scopes", () => {
  assert.equal(manifest.schemaVersion, "1.0");
  assert.equal(manifest.revision, 4);
  assert.deepEqual(manifest.requiredScopes, baselineScopes);
  assert.deepEqual(manifest.optionalScopes, []);
  assert.deepEqual(manifest.notificationTemplates, []);
  assert.deepEqual(manifest.presenceStates, []);
  assert.deepEqual(manifest.invitePaths, ["/"]);
});

test("manifest declares only truthful, attribute-free gameplay observations", () => {
  assert.deepEqual(
    manifest.events.map((event) => event.key),
    ["hypersomnia.gameplay.entered", "hypersomnia.session.joined"]
  );
  for (const event of manifest.events) {
    assert.equal(event.version, 1);
    assert.equal(event.valueType, "COUNTER");
    assert.equal(event.aggregation, "SUM");
    assert.equal(event.source, "GAME_SESSION");
    assert.deepEqual(event.attributes, {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false
    });
  }
});

test("deployment has a hardened web gateway and extracted headless server", () => {
  const deployment = manifest.deployment;
  assert.deepEqual(deployment.gateway, { service: "web", port: "http" });
  assert.equal(deployment.services.length, 2);

  const web = deployment.services.find((service) => service.name === "web");
  const server = deployment.services.find((service) => service.name === "server");
  assert.deepEqual(web.image, { source: "APP" });
  assert.equal(web.vortexEnvironment, true);
  assert.equal(web.readOnlyRootfs, true);
  assert.deepEqual(web.ports, [
    { name: "http", containerPort: 8080, protocol: "TCP", exposure: "INTERNAL" }
  ]);
  assert.equal(web.healthCheck.path, "/healthz");

  assert.deepEqual(server.image, { source: "APP" });
  assert.deepEqual(server.entrypoint, ["/usr/local/bin/hypersomnia-headless"]);
  assert.equal("command" in server, false);
  assert.equal("vortexEnvironment" in server, false);
  assert.deepEqual(server.environment, {});
  assert.equal(server.networkEgress, "PUBLIC");
  assert.equal("networkEgress" in web, false);
  assert.equal(server.readOnlyRootfs, true);
  assert.deepEqual(server.ports, [
    { name: "web-rtc", containerPort: 9000, protocol: "UDP", exposure: "HOST", hostPort: 9000 }
  ]);
  assert.equal(server.healthCheck.protocol, "PROCESS");
  assert.deepEqual(server.mounts, [
    {
      volume: "server-data",
      target: "/home/hypersomniac/.config/Hypersomnia",
      readOnly: false
    }
  ]);
  assert.deepEqual(deployment.volumes, [
    {
      name: "server-data",
      kind: "PERSISTENT",
      quotaBytes: "1073741824",
      ownerUid: 999,
      ownerGid: 999,
    },
  ]);
});

test("the manifest does not contain embedded credentials", () => {
  const serialized = JSON.stringify(manifest);
  assert.doesNotMatch(serialized, /(password|secret|private[_-]?key|access[_-]?token|bearer)/i);
});
