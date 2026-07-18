import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repoUrl = new URL("../../", import.meta.url);
const readRepoFile = (relative) => readFile(new URL(relative, repoUrl), "utf8");

test("Dockerfile extracts the pinned headless AppImage into the hardened APP image", async () => {
  const dockerfile = await readRepoFile("Dockerfile");

  assert.match(
    dockerfile,
    /FROM ghcr\.io\/teamhypersomnia\/hypersomnia-server@sha256:2b6fef2c3dded7b1d206ad17b050dfa490267a4dbe6581813a7d023694f611b5 AS headless-extractor/
  );
  assert.match(dockerfile, /Hypersomnia-Headless\.AppImage --appimage-extract/);
  assert.match(
    dockerfile,
    /sed -i '[^']*exec "\$\{APPDIR\}\/usr\/bin\/Hypersomnia"[^']*' squashfs-root\/AppRun/
  );
  assert.match(
    dockerfile,
    /COPY --from=headless-extractor \/opt\/hypersomnia-headless \/opt\/hypersomnia-headless/
  );
  assert.match(dockerfile, /apt-get install -y --no-install-recommends libgnutls30/);
  assert.match(
    dockerfile,
    /dpkg --compare-versions "\$\{installed_version\}" ge "3\.7\.9-2\+deb12u7"/
  );
  assert.match(dockerfile, /groupadd --system --gid 999 hypersomniac/);
  assert.match(dockerfile, /useradd --system --uid 999 --gid 999/);
  assert.match(
    dockerfile,
    /COPY --chmod=0555 vortex\/runtime\/headless-entrypoint\.sh \/usr\/local\/bin\/hypersomnia-headless/
  );
  assert.doesNotMatch(dockerfile, /CMD \[[^\n]*--appimage-extract-and-run/);
});

test("headless entrypoint supplies extracted-AppImage identity and ignores the web CMD", async () => {
  const entrypoint = await readRepoFile("vortex/runtime/headless-entrypoint.sh");

  assert.match(entrypoint, /APPDIR=\/opt\/hypersomnia-headless/);
  assert.match(entrypoint, /APPIMAGE="\$\{APPDIR\}\/AppRun"/);
  assert.match(entrypoint, /HOME=\/home\/hypersomniac/);
  assert.match(entrypoint, /XDG_CONFIG_HOME="\$\{HOME\}\/\.config"/);
  assert.match(entrypoint, /export APPDIR APPIMAGE HOME XDG_CONFIG_HOME/);
  assert.match(entrypoint, /exec "\$\{APPDIR\}\/AppRun"/);
  assert.doesNotMatch(entrypoint, /["']?\$[@*]["']?/);
});
