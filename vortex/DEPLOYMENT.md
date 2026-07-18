# Vortex deployment notes

The canonical deployment lives in [`vortex.manifest.json`](../vortex.manifest.json). It has two services and one persistent volume.

## Web gateway

- The repository `Dockerfile` builds the upstream Emscripten browser client and serves it through a small Node.js gateway on TCP 8080.
- `/healthz` is the deployment health check. `/api/vortex/config` exposes only validated public Vortex origin and hosted-SDK URLs.
- The final image runs as the unprivileged `node` user and supports a read-only root filesystem.
- The hosted SDK supplies identity, automatic playtime heartbeat and reconnect behavior. An explicit **Return to Vortex** action flushes events, records `play.end("quit")`, and returns to the platform. Reload, navigation, and network interruption do not falsely end play.
- The Vortex display name is copied into Hypersomnia's local nickname settings after IDBFS loads. The pairwise Vortex player id is shown only in the local integration overlay. Vortex credentials and tokens are never sent to the Hypersomnia server or embedded in a query string.

## Headless server

- The same APP image supplies both services. Its Docker build uses the upstream headless OCI image, pinned by SHA-256 digest, only as a build stage; it extracts the headless AppImage and copies the extracted AppDir into `/opt/hypersomnia-headless`.
- The server overrides the web gateway entrypoint with `/usr/local/bin/hypersomnia-headless`. That launcher sets the AppImage runtime environment, deliberately ignores the APP image's Node.js command, and starts the extracted `AppRun` without runtime self-extraction. The build changes only `AppRun`'s final invocation to `exec`, making the real server process receive stop signals directly.
- The server runs as UID/GID 999, matching the `hypersomniac` identity and persistent-volume ownership. It uses the APP image, has an empty literal manifest environment, and does not receive Vortex environment values.
- Public network egress is enabled only for the `server` service. The `web` gateway does not request public egress. The server needs outbound UDP access to `masterserver.hypersomnia.io:8430` for the upstream master-server heartbeat and access to the ICE STUN/TURN services selected by Hypersomnia for WebRTC negotiation. Docker's service-level `PUBLIC` egress policy does not provide destination or protocol allowlisting, so operators must treat it as broad outbound access and apply host/network controls if narrower policy is required.
- WebRTC traffic uses the explicitly host-bound UDP port 9000 on the same server container and network namespace that sends the master-server heartbeat and participates in ICE. This is deliberately a direct `127.0.0.1:9000/udp` HOST binding, not a socat sidecar or forwarding proxy: preserving one server socket/network identity is necessary for the advertised heartbeat endpoint and ICE source identity to agree with the traffic that reaches the game server.
- `server-data` persists the complete `/home/hypersomniac/.config/Hypersomnia` application-data directory. It is the server's only durable writable path.
- Both services use a read-only root filesystem. Vortex supplies a bounded temporary `/tmp` filesystem, but the headless server no longer depends on it for AppImage extraction.
- The runtime build refreshes `libgnutls30` and fails unless Debian reports a version greater than or equal to `3.7.9-2+deb12u7`.

## Operator checklist

1. Publish the `vortex-v2` source branch before making the application reachable over a network.
2. Configure only `VORTEX_PUBLIC_URL` and `VORTEX_SDK_URL` through Vortex's public environment injection. The gateway rejects non-HTTPS remote origins, cross-origin SDK URLs, credentials, query strings, fragments, and unexpected SDK paths. Local HTTP is allowed only for loopback and `*.localhost` development.
3. Permit the server's required public egress, including UDP to `masterserver.hypersomnia.io:8430` and the ICE STUN/TURN destinations used at runtime. If destination or protocol restrictions are required, enforce them outside Docker because the manifest's `PUBLIC` policy does not provide destination or protocol allowlisting.
4. Make the direct `127.0.0.1:9000/udp` HOST binding reachable through the intended host firewall/NAT path. Do not replace it with socat or another proxy. Only one deployed stack can claim that host port at a time.
5. Confirm the server container runs as `999:999`, has a read-only root filesystem, mounts only the complete Hypersomnia config directory as persistent storage, has no Vortex environment injection, and reports a fixed `libgnutls30` package version.
6. Confirm the server is visible through the upstream server browser and exercise connect, input, a second client, interruption, reconnect, and explicit quit before promotion.
7. Import all six catalog assets from `vortex/assets/catalog/`, then verify the returned checksums and the ordered screenshot gallery. The three promotional assets are generated originals; the three screenshots are truthful captures from the live game.
