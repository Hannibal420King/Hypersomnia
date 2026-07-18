import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readRepoFile = (relativePath) =>
  readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");

test("the Web release embeds the version of the pinned headless release", async () => {
  const [dockerfile, dockerignore, cmake, versionSource] = await Promise.all([
    readRepoFile("Dockerfile"),
    readRepoFile(".dockerignore"),
    readRepoFile("CMakeLists.txt"),
    readRepoFile("src/hypersomnia_version.cpp.in")
  ]);

  assert.match(dockerfile, /ARG HYPERSOMNIA_COMPAT_VERSION=2\.3\.0-pre1/);
  assert.match(
    dockerfile,
    /-DHYPERSOMNIA_VERSION_OVERRIDE=\$\{HYPERSOMNIA_COMPAT_VERSION\}/
  );
  assert.match(dockerignore, /^\.git$/m);
  assert.match(cmake, /HYPERSOMNIA_VERSION_OVERRIDE must be a semantic release version/);
  assert.match(
    cmake,
    /target_compile_definitions\([\s\S]*Hypersomnia[\s\S]*PRIVATE HYPERSOMNIA_VERSION_OVERRIDE="\$\{HYPERSOMNIA_VERSION_OVERRIDE\}"[\s\S]*\)/
  );
  assert.match(versionSource, /#elif defined\(HYPERSOMNIA_VERSION_OVERRIDE\)/);
  assert.match(versionSource, /commit_tag\(HYPERSOMNIA_VERSION_OVERRIDE\)/);
});
