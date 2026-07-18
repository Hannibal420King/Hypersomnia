FROM ghcr.io/teamhypersomnia/hypersomnia-server@sha256:2b6fef2c3dded7b1d206ad17b050dfa490267a4dbe6581813a7d023694f611b5 AS headless-extractor

USER root
WORKDIR /opt/headless-source

RUN set -eux; \
    /home/hypersomniac/Hypersomnia-Headless.AppImage --appimage-extract >/dev/null; \
    test -x squashfs-root/AppRun; \
    test -x squashfs-root/usr/bin/Hypersomnia; \
    sed -i 's|^"${APPDIR}/usr/bin/Hypersomnia"|exec "${APPDIR}/usr/bin/Hypersomnia"|' squashfs-root/AppRun; \
    grep -F 'exec "${APPDIR}/usr/bin/Hypersomnia"' squashfs-root/AppRun; \
    mv squashfs-root /opt/hypersomnia-headless

FROM docker.io/emscripten/emsdk:6.0.3@sha256:bb0910e6a18bb9bd7cb31ae4ed40f9073148b78cb2cdb8ea8676454e0d85425c AS web-builder

ARG HYPERSOMNIA_COMPAT_VERSION=2.3.0-pre1

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        clang \
        git \
        libc++-dev \
        libc++abi-dev \
        lld \
        ninja-build \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY . .

RUN find cmake -type f -name '*.sh' -exec sed -i 's/\r$//' {} + \
    && node --test "vortex/test/*.test.mjs" \
    && bash cmake/build.sh Release Web -DGENERATE_DEBUG_INFORMATION=0 \
        "-DHYPERSOMNIA_VERSION_OVERRIDE=${HYPERSOMNIA_COMPAT_VERSION}" \
    && ninja -C build/current Hypersomnia

RUN install -d /opt/hypersomnia-web/assets \
    && cp build/current/Hypersomnia.html /opt/hypersomnia-web/ \
    && cp build/current/Hypersomnia.js /opt/hypersomnia-web/ \
    && cp build/current/Hypersomnia.wasm /opt/hypersomnia-web/ \
    && cp build/current/Hypersomnia.data /opt/hypersomnia-web/ \
    && cp -aL build/current/assets/. /opt/hypersomnia-web/assets/

FROM docker.io/library/node:24.4.1-bookworm-slim@sha256:36ae19f59c91f3303c7a648f07493fe14c4bd91320ac8d898416327bacf1bbfa AS runtime-base

USER root

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends libgnutls30; \
    installed_version="$(dpkg-query -W -f='${Version}' libgnutls30)"; \
    dpkg --compare-versions "${installed_version}" ge "3.7.9-2+deb12u7"; \
    rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    groupadd --system --gid 999 hypersomniac; \
    useradd --system --uid 999 --gid 999 --home-dir /home/hypersomniac \
        --no-create-home --shell /usr/sbin/nologin hypersomniac; \
    install -d -o 999 -g 999 -m 0755 \
        /home/hypersomniac \
        /home/hypersomniac/.config \
        /home/hypersomniac/.config/Hypersomnia

COPY --from=headless-extractor /opt/hypersomnia-headless /opt/hypersomnia-headless
COPY --chmod=0555 vortex/runtime/headless-entrypoint.sh /usr/local/bin/hypersomnia-headless

FROM runtime-base AS app

ENV NODE_ENV=production \
    PORT=8080 \
    WEB_ROOT=/app/web

WORKDIR /app

COPY --chown=node:node --from=web-builder /opt/hypersomnia-web /app/web
COPY --chown=node:node vortex/runtime /app/vortex/runtime
COPY --chown=node:node LICENSE.md README.md /app/notices/
COPY --chown=node:node docs/licenses /app/notices/third-party
COPY --chown=node:node vortex/SOURCE_AND_ATTRIBUTION.md vortex/DEPLOYMENT.md /app/notices/vortex/
COPY --chown=node:node vortex/assets /app/vortex/assets

USER node
EXPOSE 8080/tcp

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=6 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "/app/vortex/runtime/server.mjs"]
