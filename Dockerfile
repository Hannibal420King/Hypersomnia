FROM docker.io/emscripten/emsdk:6.0.3@sha256:bb0910e6a18bb9bd7cb31ae4ed40f9073148b78cb2cdb8ea8676454e0d85425c AS web-builder

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
    && ninja -C build/current Hypersomnia

RUN install -d /opt/hypersomnia-web/assets \
    && cp build/current/Hypersomnia.html /opt/hypersomnia-web/ \
    && cp build/current/Hypersomnia.js /opt/hypersomnia-web/ \
    && cp build/current/Hypersomnia.wasm /opt/hypersomnia-web/ \
    && cp build/current/Hypersomnia.data /opt/hypersomnia-web/ \
    && cp -aL build/current/assets/. /opt/hypersomnia-web/assets/

FROM docker.io/library/node:24.4.1-bookworm-slim@sha256:36ae19f59c91f3303c7a648f07493fe14c4bd91320ac8d898416327bacf1bbfa

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
