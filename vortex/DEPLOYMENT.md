# Vortex deployment notes

The canonical deployment lives in [`vortex.manifest.json`](../vortex.manifest.json). It has two services and one persistent volume.

## Web gateway

- The repository `Dockerfile` builds the upstream Emscripten browser client and serves it through a small Node.js gateway on TCP 8080.
- `/healthz` is the deployment health check. `/api/vortex/config` exposes only validated public Vortex origin and hosted-SDK URLs.
- The final image runs as the unprivileged `node` user and supports a read-only root filesystem.
- The hosted SDK supplies identity, automatic playtime heartbeat and reconnect behavior. An explicit **Return to Vortex** action flushes events, records `play.end("quit")`, and returns to the platform. Reload, navigation, and network interruption do not falsely end play.
- The Vortex display name is copied into Hypersomnia's local nickname settings after IDBFS loads. The pairwise Vortex player id is shown only in the local integration overlay. Vortex credentials and tokens are never sent to the Hypersomnia server or embedded in a query string.

## Headless server

- The upstream headless OCI image is pinned by SHA-256 digest and runs as its built-in unprivileged `hypersomniac` user.
- WebRTC traffic uses the explicitly host-bound UDP port 9000. The game also depends on the upstream Hypersomnia public master-server/signaling service for browser discovery and WebRTC negotiation.
- `server-data` persists `/home/hypersomniac/.config/Hypersomnia/user`.
- `readOnlyRootfs` is deliberately `false` for this service. The upstream AppImage extracts itself below `/tmp` at process startup, so a read-only root filesystem prevents the server from launching. This is a technical constraint of the immutable upstream image rather than a request for Vortex credentials.

## Operator checklist

1. Publish the `vortex-v2` source branch before making the application reachable over a network.
2. Configure only `VORTEX_PUBLIC_URL` and `VORTEX_SDK_URL` through Vortex's public environment injection. The gateway rejects non-HTTPS remote origins, cross-origin SDK URLs, credentials, query strings, fragments, and unexpected SDK paths. Local HTTP is allowed only for loopback and `*.localhost` development.
3. Make host UDP 9000 reachable through the host firewall/NAT. Only one deployed stack can claim that host port at a time.
4. Confirm the server is visible through the upstream server browser and exercise connect, input, a second client, interruption, reconnect, and explicit quit before promotion.
5. Import all six catalog assets from `vortex/assets/catalog/`, then verify the returned checksums and the ordered screenshot gallery. The three promotional assets are generated originals; the three screenshots are truthful captures from the live game.
