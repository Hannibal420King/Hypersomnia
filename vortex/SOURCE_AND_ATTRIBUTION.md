# Hypersomnia source, license, and attribution

This Vortex adaptation is a modified network build of Hypersomnia. Hypersomnia is free software distributed under the [GNU Affero General Public License, version 3](../LICENSE.md). The software is provided without warranty, to the extent permitted by that license.

## Corresponding source

- Vortex fork and deployment source: <https://github.com/Hannibal420King/Hypersomnia/tree/vortex-v2>
- Original upstream project: <https://github.com/TeamHypersomnia/Hypersomnia>
- Source revision used for this adaptation: `8f5dbc6c951b22b48d4e332dd499960a8fa2fcee`

The `vortex-v2` branch, including its pinned recursive Git submodules, Dockerfile, browser adapter, headless launcher, manifest, and build instructions, is the corresponding source for the modified browser gateway and deployment packaging. The branch must be published at the URL above before this build is made available over a network. The running gateway exposes this notice at `/legal/source` and the complete AGPL text at `/legal/license`.

The browser build also includes third-party components. Their notices are preserved from `docs/licenses/` and shipped in the runtime image under `/app/notices/third-party/`.

## Headless server image

The Docker build uses the upstream Hypersomnia headless server image as a build-stage input, pinned by immutable digest:

`ghcr.io/teamhypersomnia/hypersomnia-server@sha256:2b6fef2c3dded7b1d206ad17b050dfa490267a4dbe6581813a7d023694f611b5`

The build extracts `Hypersomnia-Headless.AppImage` from that stage and copies its extracted AppDir into the Vortex APP image. It makes two packaging-only compatibility changes. First, the extracted `AppRun` shell wrapper's final game invocation uses `exec` so the server receives container termination signals directly. Second, it creates `content/sfx/shield_hit.ogg` as a symbolic link to the AppImage's existing `content/sfx/explosion.ogg`; the pinned server requests the legacy path even though this source revision maps shield-impact audio to the explosion sound. The original OCI image is not used as a separately running service. This removes runtime self-extraction while retaining an auditable, immutable source for the packaged headless payload.

The upstream image reports Hypersomnia `2.3.0-pre1`. Its OCI metadata does not identify an exact source revision, so the image digest cannot be proven to correspond byte-for-byte to source revision `8f5dbc6c951b22b48d4e332dd499960a8fa2fcee`. This is an explicit upstream provenance limitation; the digest is pinned to prevent mutable-image drift.

The final APP image is based on the pinned Node.js Debian Bookworm image declared in the Dockerfile. Its runtime `libgnutls30` package is refreshed from Debian's signed repositories during the build, and the build fails unless the installed version is at least `3.7.9-2+deb12u7`.

## Vortex catalog artwork

The catalog pack in `vortex/assets/catalog/` contains three newly generated promotional assets and three real gameplay screenshots captured from the live WebAssembly multiplayer client. The promotional art does not copy upstream game art or logos. Provenance, hashes, dimensions, generation prompts or capture status, and license details for all six assets are recorded in `asset-manifest.json`.
