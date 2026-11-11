# Releasing spurvik, spurvik-sdk, n8n-nodes-spurvik, and spurvik-mcp-server

Run these commands from a clean detached checkout of QA_SHA. `spurvik` and `spurvik-sdk` are the same SDK build under two names. `spurvik-sdk` does not depend on `spurvik`. Do not pass `--provenance`.

When a version is new, publish `spurvik-sdk`, then `spurvik`, then `n8n-nodes-spurvik` (it depends on `spurvik-sdk@^1.0.6`). `spurvik` does not depend on `spurvik-sdk`; they are the same build under two names. This document's SDK steps describe the `spurvik-sdk@1.0.8` and `spurvik@1.0.8` release. Skip `n8n-nodes-spurvik@1.0.3`. It is already published, and this release does not change it. Never republish an existing version. For `spurvik-mcp-server@1.0.4`, use the MCP section at the end.

The n8n `outputField` check compares field names, not values.

Smoke-test from the local `.tgz` files. `n8n-nodes-spurvik@1.0.3` is already on the registry. Do not install `spurvik@1.0.8` or `spurvik-sdk@1.0.8` from the registry until after this release is published. That install fails with `ETARGET` while the version is unpublished.

`packages/sdk/package.json` has no `file:` dependency. The SDK build links `packages/core` into `node_modules` for that build only. That link is not part of the published package.

Steps 1–4 run inside one subshell so `set -e` does not stay on in your interactive shell.

```bash
(
set -euo pipefail
REPO=$(git rev-parse --show-toplevel)
cd "$REPO" || exit 1
# Hard stop before any pack. On 4 Nov 2026 spurvik@1.0.6 was packed from a dirty tree,
# so its registry gitHead points at a commit whose package.json still said 1.0.5.
# Tracked changes and untracked files. Ignored build output is not listed.
if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "Stop: git status --porcelain is not empty. Refusing to pack from a dirty tree." >&2
  git status --porcelain --untracked-files=all >&2
  exit 1
fi

# 1. Build from the lockfiles. core is bundled and is not published.
(
  cd "$REPO"/packages/core || exit 1
  npm ci
  npm run build
)
(
  cd "$REPO"/packages/react || exit 1
  npm ci
  npm run build
)
(
  cd "$REPO"/packages/sdk || exit 1
  npm ci
  npm run build
)

# 2. Pack local tarballs. Stage spurvik before any publish dry-run.
#    prepublishOnly checks packages/sdk/dist, packages/spurvik/dist, and the n8n dist.
mkdir -p /tmp/spurvik-release
(
  cd "$REPO"/packages/sdk || exit 1
  npm pack --pack-destination /tmp/spurvik-release
)
(
  cd "$REPO" || exit 1
  node scripts/stage-spurvik-package.mjs
  cd "$REPO"/packages/spurvik || exit 1
  npm pack --pack-destination /tmp/spurvik-release
)

# 3. Build the n8n package against the local spurvik-sdk tarball and pack it for the
#    smoke test, then dry-run spurvik-sdk and spurvik.
#    Do not dry-run n8n-nodes-spurvik@1.0.3. That version is already published, so
#    npm publish --dry-run stops with "cannot publish over the previously published
#    versions". Never republish an existing version.
(
  cd "$REPO"/packages/n8n-nodes-spurvik || exit 1
  npm install --no-save --no-package-lock --legacy-peer-deps /tmp/spurvik-release/spurvik-sdk-1.0.8.tgz
  npm install --no-save --no-package-lock --legacy-peer-deps typescript@5.9.3 n8n-workflow@2.46.4 @types/node@22.20.5
  npm run build
  npm pack --pack-destination /tmp/spurvik-release
)
(
  cd "$REPO"/packages/sdk || exit 1
  npm publish --dry-run
)
(
  cd "$REPO"/packages/spurvik || exit 1
  npm publish --dry-run
)

# 4. Smoke-test the three tarballs in a fresh directory. Still no registry install of 1.0.8.
#    Clear only these two directories, then pack again into the empty release directory.
rm -rf /tmp/spurvik-release /tmp/spurvik-smoke
mkdir -p /tmp/spurvik-release /tmp/spurvik-smoke
(
  cd "$REPO"/packages/sdk || exit 1
  npm pack --pack-destination /tmp/spurvik-release
)
(
  cd "$REPO" || exit 1
  node scripts/stage-spurvik-package.mjs
  cd "$REPO"/packages/spurvik || exit 1
  npm pack --pack-destination /tmp/spurvik-release
)
(
  cd "$REPO"/packages/n8n-nodes-spurvik || exit 1
  npm pack --pack-destination /tmp/spurvik-release
)
(
  cd /tmp/spurvik-smoke || exit 1
  npm init -y
  npm install --legacy-peer-deps \
    /tmp/spurvik-release/spurvik-1.0.8.tgz \
    /tmp/spurvik-release/spurvik-sdk-1.0.8.tgz \
    /tmp/spurvik-release/n8n-nodes-spurvik-1.0.3.tgz
  # spurvik/react imports react. React is an optional peer, so install it for this import check.
  npm install --no-save --no-package-lock --legacy-peer-deps react@19 react-dom@19
  node --input-type=module -e 'import * as spurvik from "spurvik"; import * as sdk from "spurvik-sdk"; import * as channels from "spurvik-sdk/channels"; import * as react from "spurvik/react"; if (typeof spurvik.withSpurvik !== "function" || typeof sdk.withSpurvik !== "function" || typeof channels.verifyChannelApprovalToken !== "function" || typeof react.AIDisclosureLabel !== "function") throw new Error("ESM import smoke failed");'
  node -e 'const spurvik = require("spurvik"); const sdk = require("spurvik-sdk"); const channels = require("spurvik-sdk/channels"); const react = require("spurvik/react"); const node = require("n8n-nodes-spurvik/dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js"); const cred = require("n8n-nodes-spurvik/dist/credentials/SpurvikApi.credentials.js"); if (typeof spurvik.withSpurvik !== "function" || typeof sdk.withSpurvik !== "function" || typeof channels.verifyChannelApprovalToken !== "function" || typeof react.AIDisclosureLabel !== "function") throw new Error("CJS import smoke failed"); if (typeof node.SpurvikEuAiActGuard !== "function" || typeof cred.SpurvikApi !== "function") throw new Error("n8n class require failed");'
)
)
```

Stop and check step 4 output first. The ESM and CJS import checks must print nothing and exit 0 before you publish.

```bash
# 5. Mandatory before any npm publish. No --provenance.
# Hard stop before packing. Paste the QA-passed commit into QA_SHA.
# The tree must be clean, and git rev-parse HEAD must equal QA_SHA.
# Then pack each package and compare hashes to the values QA recorded for that head.
# Stop if the uncompressed tar sha1 differs. Do not run npm publish in this block.
# QA_SHA, QA_SHA1_SPURVIK_SDK, QA_SHA1_SPURVIK, QA_SHA1_SPURVIK_SDK_TAR, QA_SHA1_SPURVIK_TAR,
# QA_NODE_VERSION, and QA_NPM_VERSION are to be filled in at the QA gate for a release.
# Do not reuse values from an earlier release.
# shasum -a 1 <tgz> and `npm pack --json` field .shasum are the same sha1 of the .tgz bytes.
# The .tgz sha1 depends on the Node build that runs npm pack, because the gzip bytes come
# from Node's zlib. The uncompressed tar sha1 (`gzip -dc x.tgz | shasum -a 1`) does not.
# For n8n-nodes-spurvik@1.0.3, QA packed 4d054d1a on Node 24 and the publish packed
# dccdb9e6 on Node 26.0.0. For spurvik-sdk@1.0.7 / spurvik@1.0.7, QA packed
# 696e4813 / b6fbd931 on Node v24.22.1 / npm 11.21.1, and the registry has
# 5af01df2 / 4abc7028 (_nodeVersion 26.0.0, _npmVersion 11.12.1). In both cases
# the uncompressed tar was the same (1.0.7: sdk 2a6893f6033b1fcfe90c4f04ca86fd56ab0ecdf0,
# spurvik 28f2e0eedc16066b7b92d4480061316bbdea7005). So pack on the same Node
# version and the same npm version QA used (QA_NODE_VERSION, for example v24.22.1,
# and QA_NPM_VERSION, for example 11.21.1), and treat the uncompressed tar sha1 as
# the content gate that must match even when the gzip bytes differ.
(
set -euo pipefail
: "${QA_SHA:?Set QA_SHA to the QA-passed commit, to be filled in at the QA gate for this release}"
: "${QA_SHA1_SPURVIK_SDK:?Set QA_SHA1_SPURVIK_SDK to the spurvik-sdk-1.0.8.tgz sha1 QA records at the QA gate for this release}"
: "${QA_SHA1_SPURVIK:?Set QA_SHA1_SPURVIK to the spurvik-1.0.8.tgz sha1 QA records at the QA gate for this release}"
: "${QA_SHA1_SPURVIK_SDK_TAR:?Set QA_SHA1_SPURVIK_SDK_TAR to the uncompressed tar sha1 (gzip -dc spurvik-sdk-1.0.8.tgz | shasum -a 1) QA records at the QA gate for this release}"
: "${QA_SHA1_SPURVIK_TAR:?Set QA_SHA1_SPURVIK_TAR to the uncompressed tar sha1 (gzip -dc spurvik-1.0.8.tgz | shasum -a 1) QA records at the QA gate for this release}"
: "${QA_NODE_VERSION:?Set QA_NODE_VERSION to the node -v output QA records at the QA gate for this release}"
: "${QA_NPM_VERSION:?Set QA_NPM_VERSION to the npm -v output QA records at the QA gate for this release}"
tgz_sha1() { shasum -a 1 "$1" | awk '{print $1}'; }
tar_sha1() { gzip -dc "$1" | shasum -a 1 | awk '{print $1}'; }
if [[ "$(node -v)" != "$QA_NODE_VERSION" ]]; then
  echo "Stop: node -v is $(node -v), QA packed with $QA_NODE_VERSION. The .tgz sha1 will not match." >&2
  exit 1
fi
if [[ "$(npm -v)" != "$QA_NPM_VERSION" ]]; then
  echo "Stop: npm -v is $(npm -v), QA packed with $QA_NPM_VERSION. The .tgz sha1 will not match." >&2
  exit 1
fi
(
  cd "$(git rev-parse --show-toplevel)" || exit 1
  # Tracked changes and untracked files. Ignored build output is not listed.
  if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
    echo "Stop: git status --porcelain is not empty. Refusing to pack from a dirty tree." >&2
    git status --porcelain --untracked-files=all >&2
    exit 1
  fi
  head="$(git rev-parse HEAD)"
  if [[ "$head" != "$QA_SHA" ]]; then
    echo "Stop: HEAD $head does not equal the QA-passed SHA ($QA_SHA)." >&2
    exit 1
  fi
)

(
  cd "$(git rev-parse --show-toplevel)"/packages/sdk || exit 1
  npm pack
  actual_tgz="$(tgz_sha1 ./spurvik-sdk-1.0.8.tgz)"
  actual_tar="$(tar_sha1 ./spurvik-sdk-1.0.8.tgz)"
  if [[ "$actual_tar" != "$QA_SHA1_SPURVIK_SDK_TAR" ]]; then
    echo "Stop: spurvik-sdk-1.0.8.tgz uncompressed tar sha1 $actual_tar does not match the sha1 QA recorded for the approved head ($QA_SHA1_SPURVIK_SDK_TAR)." >&2
    exit 1
  fi
  if [[ "$actual_tgz" != "$QA_SHA1_SPURVIK_SDK" ]]; then
    echo "Note: spurvik-sdk-1.0.8.tgz sha1 $actual_tgz does not match the tgz sha1 QA recorded ($QA_SHA1_SPURVIK_SDK). The uncompressed tar sha1 matches, so the content is the same and the gzip bytes differ." >&2
  fi
)
(
  cd "$(git rev-parse --show-toplevel)" || exit 1
  node scripts/stage-spurvik-package.mjs
  cd "$(git rev-parse --show-toplevel)"/packages/spurvik || exit 1
  npm pack
  actual_tgz="$(tgz_sha1 ./spurvik-1.0.8.tgz)"
  actual_tar="$(tar_sha1 ./spurvik-1.0.8.tgz)"
  if [[ "$actual_tar" != "$QA_SHA1_SPURVIK_TAR" ]]; then
    echo "Stop: spurvik-1.0.8.tgz uncompressed tar sha1 $actual_tar does not match the sha1 QA recorded for the approved head ($QA_SHA1_SPURVIK_TAR)." >&2
    exit 1
  fi
  if [[ "$actual_tgz" != "$QA_SHA1_SPURVIK" ]]; then
    echo "Note: spurvik-1.0.8.tgz sha1 $actual_tgz does not match the tgz sha1 QA recorded ($QA_SHA1_SPURVIK). The uncompressed tar sha1 matches, so the content is the same and the gzip bytes differ." >&2
  fi
)
)
```

Step 6 is one subshell. It publishes the tarball step 5 already packed. It does not pack again. No --provenance. `spurvik-sdk` runs first, then `spurvik`. Check both packages' uncompressed tar sha1s (and compare the tgz sha1s) at the top, before the first publish, and recheck HEAD, Node, and npm. If the `spurvik-sdk` check fails, the subshell stops and the `spurvik` publish does not run.

This release publishes `spurvik-sdk@1.0.8`, then `spurvik@1.0.8`. Skip `n8n-nodes-spurvik@1.0.3`. It is already published, and this release does not change it. Never republish an existing version.

```bash
# 6. Publish spurvik-sdk@1.0.8, then spurvik@1.0.8, only when the owner decides. No --provenance.
# One subshell. Recheck HEAD, Node, and npm. Check both packages' sha1s before the first publish.
# spurvik-sdk@1.0.8 first, then spurvik@1.0.8. They are the same build under two names.
# The uncompressed tar sha1 is the content gate. A mismatch stops the subshell.
(
set -euo pipefail
: "${QA_SHA:?Set QA_SHA to the QA-passed commit, to be filled in at the QA gate for this release}"
: "${QA_SHA1_SPURVIK_SDK:?Set QA_SHA1_SPURVIK_SDK to the spurvik-sdk-1.0.8.tgz sha1 QA records at the QA gate for this release}"
: "${QA_SHA1_SPURVIK:?Set QA_SHA1_SPURVIK to the spurvik-1.0.8.tgz sha1 QA records at the QA gate for this release}"
: "${QA_SHA1_SPURVIK_SDK_TAR:?Set QA_SHA1_SPURVIK_SDK_TAR to the uncompressed tar sha1 QA records at the QA gate for this release}"
: "${QA_SHA1_SPURVIK_TAR:?Set QA_SHA1_SPURVIK_TAR to the uncompressed tar sha1 QA records at the QA gate for this release}"
: "${QA_NODE_VERSION:?Set QA_NODE_VERSION to the node -v output QA records at the QA gate for this release}"
: "${QA_NPM_VERSION:?Set QA_NPM_VERSION to the npm -v output QA records at the QA gate for this release}"
tgz_sha1() { shasum -a 1 "$1" | awk '{print $1}'; }
tar_sha1() { gzip -dc "$1" | shasum -a 1 | awk '{print $1}'; }
if [[ "$(node -v)" != "$QA_NODE_VERSION" ]]; then
  echo "Stop: node -v is $(node -v), QA packed with $QA_NODE_VERSION." >&2
  exit 1
fi
if [[ "$(npm -v)" != "$QA_NPM_VERSION" ]]; then
  echo "Stop: npm -v is $(npm -v), QA packed with $QA_NPM_VERSION." >&2
  exit 1
fi
(
  cd "$(git rev-parse --show-toplevel)" || exit 1
  if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
    echo "Stop: git status --porcelain is not empty. Refusing to publish from a dirty tree." >&2
    git status --porcelain --untracked-files=all >&2
    exit 1
  fi
  head="$(git rev-parse HEAD)"
  if [[ "$head" != "$QA_SHA" ]]; then
    echo "Stop: HEAD $head does not equal the QA-passed SHA ($QA_SHA)." >&2
    exit 1
  fi
)
sdk_tgz="$(git rev-parse --show-toplevel)/packages/sdk/spurvik-sdk-1.0.8.tgz"
spurvik_tgz="$(git rev-parse --show-toplevel)/packages/spurvik/spurvik-1.0.8.tgz"
if [[ "$(tar_sha1 "$sdk_tgz")" != "$QA_SHA1_SPURVIK_SDK_TAR" ]]; then
  echo "Stop: spurvik-sdk-1.0.8.tgz uncompressed tar sha1 $(tar_sha1 "$sdk_tgz") does not match $QA_SHA1_SPURVIK_SDK_TAR." >&2
  exit 1
fi
if [[ "$(tar_sha1 "$spurvik_tgz")" != "$QA_SHA1_SPURVIK_TAR" ]]; then
  echo "Stop: spurvik-1.0.8.tgz uncompressed tar sha1 $(tar_sha1 "$spurvik_tgz") does not match $QA_SHA1_SPURVIK_TAR." >&2
  exit 1
fi
if [[ "$(tgz_sha1 "$sdk_tgz")" != "$QA_SHA1_SPURVIK_SDK" ]]; then
  echo "Note: spurvik-sdk-1.0.8.tgz sha1 $(tgz_sha1 "$sdk_tgz") does not match the tgz sha1 QA recorded ($QA_SHA1_SPURVIK_SDK). The uncompressed tar sha1 matches." >&2
fi
if [[ "$(tgz_sha1 "$spurvik_tgz")" != "$QA_SHA1_SPURVIK" ]]; then
  echo "Note: spurvik-1.0.8.tgz sha1 $(tgz_sha1 "$spurvik_tgz") does not match the tgz sha1 QA recorded ($QA_SHA1_SPURVIK). The uncompressed tar sha1 matches." >&2
fi
(
  cd "$(git rev-parse --show-toplevel)"/packages/sdk || exit 1
  npm publish ./spurvik-sdk-1.0.8.tgz
)
(
  cd "$(git rev-parse --show-toplevel)"/packages/spurvik || exit 1
  npm publish ./spurvik-1.0.8.tgz
)
# n8n-nodes-spurvik@1.0.3 — SKIP. Already published. Never republish an existing version.
(
  cd "$(git rev-parse --show-toplevel)"/packages/n8n-nodes-spurvik || exit 1
  echo "Skip n8n-nodes-spurvik@1.0.3. Already published. Never republish an existing version."
)
)
```

After those publishes, download each published tarball and compare its uncompressed tar sha1 to the QA value (`QA_SHA1_*_TAR`). `npm view <name>@1.0.8 dist.shasum` is the sha1 of the gzip bytes; it may differ from the packed or QA tgz sha1 when the publisher's zlib output differs, even when the tar content is the same. Do not treat a dist.shasum mismatch alone as a content mismatch. A tarball publish (`npm publish ./x.tgz`) sends no `gitHead`, so `npm view <name>@1.0.8 gitHead` prints nothing. `n8n-nodes-spurvik@1.0.3` shows this: it was published from a tarball and has no `gitHead`. The commit link is QA_SHA plus the matching uncompressed tar sha1 from step 5. Do not run this check for `n8n-nodes-spurvik@1.0.3`. It is not republished. Then a registry install check is valid.

```bash
# 7. Post-publish check for the two packages this release publishes.
# Recheck HEAD, Node, and npm. The content gate is the uncompressed tar sha1.
(
set -euo pipefail
: "${QA_SHA:?Set QA_SHA to the QA-passed commit, to be filled in at the QA gate for this release}"
: "${QA_SHA1_SPURVIK_SDK:?Set QA_SHA1_SPURVIK_SDK to the spurvik-sdk-1.0.8.tgz sha1 QA records at the QA gate for this release}"
: "${QA_SHA1_SPURVIK:?Set QA_SHA1_SPURVIK to the spurvik-1.0.8.tgz sha1 QA records at the QA gate for this release}"
: "${QA_SHA1_SPURVIK_SDK_TAR:?Set QA_SHA1_SPURVIK_SDK_TAR to the uncompressed tar sha1 QA records at the QA gate for this release}"
: "${QA_SHA1_SPURVIK_TAR:?Set QA_SHA1_SPURVIK_TAR to the uncompressed tar sha1 QA records at the QA gate for this release}"
: "${QA_NODE_VERSION:?Set QA_NODE_VERSION to the node -v output QA records at the QA gate for this release}"
: "${QA_NPM_VERSION:?Set QA_NPM_VERSION to the npm -v output QA records at the QA gate for this release}"
tgz_sha1() { shasum -a 1 "$1" | awk '{print $1}'; }
tar_sha1() { gzip -dc "$1" | shasum -a 1 | awk '{print $1}'; }
if [[ "$(node -v)" != "$QA_NODE_VERSION" ]]; then
  echo "Stop: node -v is $(node -v), QA packed with $QA_NODE_VERSION." >&2
  exit 1
fi
if [[ "$(npm -v)" != "$QA_NPM_VERSION" ]]; then
  echo "Stop: npm -v is $(npm -v), QA packed with $QA_NPM_VERSION." >&2
  exit 1
fi
(
  cd "$(git rev-parse --show-toplevel)" || exit 1
  head="$(git rev-parse HEAD)"
  if [[ "$head" != "$QA_SHA" ]]; then
    echo "Stop: HEAD $head does not equal the QA-passed SHA ($QA_SHA)." >&2
    exit 1
  fi
)
check() {
  local dir="$1" name="$2" qa_tgz="$3" qa_tar="$4"
  local repo packed remote_shasum work downloaded remote_tar packed_tar
  repo="$(git rev-parse --show-toplevel)"
  packed="$repo/packages/$dir/$name-1.0.8.tgz"
  packed_tar="$(tar_sha1 "$packed")"
  if [[ "$packed_tar" != "$qa_tar" ]]; then
    echo "Stop: local $name-1.0.8.tgz uncompressed tar sha1 $packed_tar does not match $qa_tar." >&2
    exit 1
  fi
  remote_shasum="$(npm view "$name"@1.0.8 dist.shasum)"
  work="$(mktemp -d)"
  (cd "$work" && npm pack "$name@1.0.8" >/dev/null)
  downloaded="$work/$name-1.0.8.tgz"
  remote_tar="$(tar_sha1 "$downloaded")"
  if [[ "$remote_tar" != "$qa_tar" ]]; then
    echo "Stop: published $name@1.0.8 uncompressed tar sha1 $remote_tar does not match the sha1 QA recorded ($qa_tar)." >&2
    rm -rf "$work"
    exit 1
  fi
  if [[ "$remote_shasum" != "$qa_tgz" && "$remote_shasum" != "$(tgz_sha1 "$packed")" ]]; then
    echo "Note: npm view $name@1.0.8 dist.shasum is $remote_shasum; QA tgz sha1 is $qa_tgz; packed tgz sha1 is $(tgz_sha1 "$packed"). The uncompressed tar sha1 matches $qa_tar, so the content is the same and the gzip bytes differ." >&2
  fi
  rm -rf "$work"
}
(check sdk spurvik-sdk "$QA_SHA1_SPURVIK_SDK" "$QA_SHA1_SPURVIK_SDK_TAR")
(check spurvik spurvik "$QA_SHA1_SPURVIK" "$QA_SHA1_SPURVIK_TAR")
)
```

```bash
# 8. Registry install check. Run only after the packages you published are on the registry.
(
  rm -rf /tmp/spurvik-registry-check
  mkdir -p /tmp/spurvik-registry-check
  cd /tmp/spurvik-registry-check || exit 1
  npm init -y
  npm install spurvik@1.0.8 spurvik-sdk@1.0.8 n8n-nodes-spurvik@1.0.4
)
```

The hosted console at https://console.spurvik.com is deployed separately. These commands do not publish the console.

## Releasing spurvik-mcp-server@1.0.4

`packages/mcp/CHANGELOG.md` is headed `1.0.4 — unreleased` until this version is published. At publish, replace that heading with `1.0.4 — YYYY-MM-DD` (the publish date). That is the same convention as `packages/sdk/CHANGELOG.md` for 1.0.8. The 1.0.3 and 1.0.7 headings stayed "unreleased" until those packages were published and were then dated 2026-11-11.


`packages/mcp` stays `"private": true` under the workspace name `@spurvik/mcp`. The published npm package is `spurvik-mcp-server`. Do not run `npm publish` from `packages/mcp`. Stage a public package with `node scripts/stage-mcp-package.mjs`, then pack and publish that staged tarball. The staged `package.json` sets `name` to `spurvik-mcp-server` and `mcpName` to `io.github.spurvik/spurvik-mcp-server`, which must match `name` in `server.json`. The MCP Registry uses `mcpName` to check npm package ownership.

The workspace package depends on `spurvik-sdk@^1.0.7` from the npm registry (and on `packages/core` in this repository), so the lockfile still resolves before `spurvik-sdk@1.0.8` is published. The staged public bundle is built from this repository's 1.0.8 SDK sources. From spurvik-mcp-server@1.0.4, the bundled SDK matches `spurvik@1.0.8`: an `overridden` decision is not approved. `spurvik-mcp-server@1.0.2` on npm still treats an overridden decision as approved. The plugin bundle `plugins/spurvik/bin/spurvik-mcp.mjs` is rebuilt from this tree and is not inside the `spurvik` or `spurvik-sdk` tarball.

Run these commands from a clean detached checkout of QA_SHA. Do not pass `--provenance`. Never republish an existing version. `spurvik` does not depend on `spurvik-sdk`.

The same gates as the SDK steps apply: clean tree, `HEAD` equals `QA_SHA`, Node and npm match the QA-recorded versions, and the uncompressed tar sha1 must match the value QA recorded. The .tgz sha1 is also recorded; a gzip-only difference is a note, not a content mismatch.

```bash
# MCP 1–4. Build, rebuild the plugin bundle, stage the public package, pack, and smoke-test.
# Do not publish in this block.
(
set -euo pipefail
REPO=$(git rev-parse --show-toplevel)
cd "$REPO" || exit 1
if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "Stop: git status --porcelain is not empty. Refusing to pack from a dirty tree." >&2
  git status --porcelain --untracked-files=all >&2
  exit 1
fi
(
  cd "$REPO"/packages/core || exit 1
  npm ci
  npm run build
)
(
  cd "$REPO"/packages/mcp || exit 1
  pnpm install --frozen-lockfile
  pnpm build
  node scripts/bundle-plugin.mjs --check
)
(
  cd "$REPO" || exit 1
  node scripts/stage-mcp-package.mjs
)
mkdir -p /tmp/spurvik-mcp-release /tmp/spurvik-mcp-smoke
rm -rf /tmp/spurvik-mcp-release /tmp/spurvik-mcp-smoke
mkdir -p /tmp/spurvik-mcp-release /tmp/spurvik-mcp-smoke
(
  cd "$REPO"/packages/mcp/.release || exit 1
  npm pack --pack-destination /tmp/spurvik-mcp-release
)
(
  cd /tmp/spurvik-mcp-smoke || exit 1
  npm init -y
  npm install /tmp/spurvik-mcp-release/spurvik-mcp-server-1.0.4.tgz
  test -x node_modules/.bin/spurvik-mcp-server
  test -x node_modules/.bin/spurvik-mcp
)
)
```

Stop and check that block first. The smoke install must exit 0 before you publish.

```bash
# MCP 5. Mandatory before any npm publish. No --provenance.
# Hard stop before packing. Paste the QA-passed commit into QA_SHA.
# The tree must be clean, and git rev-parse HEAD must equal QA_SHA.
# Pack the staged public package and compare hashes to the values QA recorded.
# The uncompressed tar sha1 is the content gate. Do not run npm publish in this block.
# QA_SHA, QA_SHA1_MCP, QA_SHA1_MCP_TAR, QA_NODE_VERSION, and QA_NPM_VERSION are to be
# filled in at the QA gate for the 1.0.4 MCP release. Do not reuse values from an earlier release.
(
set -euo pipefail
: "${QA_SHA:?Set QA_SHA to the QA-passed commit, to be filled in at the QA gate for this release}"
: "${QA_SHA1_MCP:?Set QA_SHA1_MCP to the spurvik-mcp-server-1.0.4.tgz sha1 QA records at the QA gate for this release}"
: "${QA_SHA1_MCP_TAR:?Set QA_SHA1_MCP_TAR to the uncompressed tar sha1 (gzip -dc spurvik-mcp-server-1.0.4.tgz | shasum -a 1) QA records at the QA gate for this release}"
: "${QA_NODE_VERSION:?Set QA_NODE_VERSION to the node -v output QA records at the QA gate for this release}"
: "${QA_NPM_VERSION:?Set QA_NPM_VERSION to the npm -v output QA records at the QA gate for this release}"
tgz_sha1() { shasum -a 1 "$1" | awk '{print $1}'; }
tar_sha1() { gzip -dc "$1" | shasum -a 1 | awk '{print $1}'; }
if [[ "$(node -v)" != "$QA_NODE_VERSION" ]]; then
  echo "Stop: node -v is $(node -v), QA packed with $QA_NODE_VERSION. The .tgz sha1 will not match." >&2
  exit 1
fi
if [[ "$(npm -v)" != "$QA_NPM_VERSION" ]]; then
  echo "Stop: npm -v is $(npm -v), QA packed with $QA_NPM_VERSION. The .tgz sha1 will not match." >&2
  exit 1
fi
REPO=$(git rev-parse --show-toplevel)
(
  cd "$REPO" || exit 1
  if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
    echo "Stop: git status --porcelain is not empty. Refusing to pack from a dirty tree." >&2
    git status --porcelain --untracked-files=all >&2
    exit 1
  fi
  head="$(git rev-parse HEAD)"
  if [[ "$head" != "$QA_SHA" ]]; then
    echo "Stop: HEAD $head does not equal the QA-passed SHA ($QA_SHA)." >&2
    exit 1
  fi
)
(
  cd "$REPO"/packages/mcp || exit 1
  pnpm build
)
(
  cd "$REPO" || exit 1
  node scripts/stage-mcp-package.mjs
  cd "$REPO"/packages/mcp/.release || exit 1
  npm pack
  actual_tgz="$(tgz_sha1 ./spurvik-mcp-server-1.0.4.tgz)"
  actual_tar="$(tar_sha1 ./spurvik-mcp-server-1.0.4.tgz)"
  if [[ "$actual_tar" != "$QA_SHA1_MCP_TAR" ]]; then
    echo "Stop: spurvik-mcp-server-1.0.4.tgz uncompressed tar sha1 $actual_tar does not match the sha1 QA recorded for the approved head ($QA_SHA1_MCP_TAR)." >&2
    exit 1
  fi
  if [[ "$actual_tgz" != "$QA_SHA1_MCP" ]]; then
    echo "Note: spurvik-mcp-server-1.0.4.tgz sha1 $actual_tgz does not match the tgz sha1 QA recorded ($QA_SHA1_MCP). The uncompressed tar sha1 matches, so the content is the same and the gzip bytes differ." >&2
  fi
)
)
```

```bash
# MCP 6. Publish spurvik-mcp-server@1.0.4, only when the owner decides. No --provenance.
# One subshell. Recheck HEAD, Node, and npm. Recheck the sha1s before the publish.
# It does not pack again. A content mismatch stops the subshell.
(
set -euo pipefail
: "${QA_SHA:?Set QA_SHA to the QA-passed commit, to be filled in at the QA gate for this release}"
: "${QA_SHA1_MCP:?Set QA_SHA1_MCP to the spurvik-mcp-server-1.0.4.tgz sha1 QA records at the QA gate for this release}"
: "${QA_SHA1_MCP_TAR:?Set QA_SHA1_MCP_TAR to the uncompressed tar sha1 QA records at the QA gate for this release}"
: "${QA_NODE_VERSION:?Set QA_NODE_VERSION to the node -v output QA records at the QA gate for this release}"
: "${QA_NPM_VERSION:?Set QA_NPM_VERSION to the npm -v output QA records at the QA gate for this release}"
tgz_sha1() { shasum -a 1 "$1" | awk '{print $1}'; }
tar_sha1() { gzip -dc "$1" | shasum -a 1 | awk '{print $1}'; }
if [[ "$(node -v)" != "$QA_NODE_VERSION" ]]; then
  echo "Stop: node -v is $(node -v), QA packed with $QA_NODE_VERSION." >&2
  exit 1
fi
if [[ "$(npm -v)" != "$QA_NPM_VERSION" ]]; then
  echo "Stop: npm -v is $(npm -v), QA packed with $QA_NPM_VERSION." >&2
  exit 1
fi
REPO=$(git rev-parse --show-toplevel)
(
  cd "$REPO" || exit 1
  if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
    echo "Stop: git status --porcelain is not empty. Refusing to publish from a dirty tree." >&2
    git status --porcelain --untracked-files=all >&2
    exit 1
  fi
  head="$(git rev-parse HEAD)"
  if [[ "$head" != "$QA_SHA" ]]; then
    echo "Stop: HEAD $head does not equal the QA-passed SHA ($QA_SHA)." >&2
    exit 1
  fi
)
tgz="$REPO/packages/mcp/.release/spurvik-mcp-server-1.0.4.tgz"
if [[ "$(tar_sha1 "$tgz")" != "$QA_SHA1_MCP_TAR" ]]; then
  echo "Stop: spurvik-mcp-server-1.0.4.tgz uncompressed tar sha1 $(tar_sha1 "$tgz") does not match $QA_SHA1_MCP_TAR." >&2
  exit 1
fi
if [[ "$(tgz_sha1 "$tgz")" != "$QA_SHA1_MCP" ]]; then
  echo "Note: spurvik-mcp-server-1.0.4.tgz sha1 $(tgz_sha1 "$tgz") does not match the tgz sha1 QA recorded ($QA_SHA1_MCP). The uncompressed tar sha1 matches." >&2
fi
(
  cd "$REPO"/packages/mcp/.release || exit 1
  npm publish ./spurvik-mcp-server-1.0.4.tgz
)
)
```

```bash
# MCP 7. Post-publish check. Recheck HEAD, Node, and npm. The content gate is the uncompressed tar sha1.
(
set -euo pipefail
: "${QA_SHA:?Set QA_SHA to the QA-passed commit, to be filled in at the QA gate for this release}"
: "${QA_SHA1_MCP:?Set QA_SHA1_MCP to the spurvik-mcp-server-1.0.4.tgz sha1 QA records at the QA gate for this release}"
: "${QA_SHA1_MCP_TAR:?Set QA_SHA1_MCP_TAR to the uncompressed tar sha1 QA records at the QA gate for this release}"
: "${QA_NODE_VERSION:?Set QA_NODE_VERSION to the node -v output QA records at the QA gate for this release}"
: "${QA_NPM_VERSION:?Set QA_NPM_VERSION to the npm -v output QA records at the QA gate for this release}"
tgz_sha1() { shasum -a 1 "$1" | awk '{print $1}'; }
tar_sha1() { gzip -dc "$1" | shasum -a 1 | awk '{print $1}'; }
if [[ "$(node -v)" != "$QA_NODE_VERSION" ]]; then
  echo "Stop: node -v is $(node -v), QA packed with $QA_NODE_VERSION." >&2
  exit 1
fi
if [[ "$(npm -v)" != "$QA_NPM_VERSION" ]]; then
  echo "Stop: npm -v is $(npm -v), QA packed with $QA_NPM_VERSION." >&2
  exit 1
fi
REPO=$(git rev-parse --show-toplevel)
head="$(cd "$REPO" && git rev-parse HEAD)"
if [[ "$head" != "$QA_SHA" ]]; then
  echo "Stop: HEAD $head does not equal the QA-passed SHA ($QA_SHA)." >&2
  exit 1
fi
packed="$REPO/packages/mcp/.release/spurvik-mcp-server-1.0.4.tgz"
packed_tar="$(tar_sha1 "$packed")"
if [[ "$packed_tar" != "$QA_SHA1_MCP_TAR" ]]; then
  echo "Stop: local spurvik-mcp-server-1.0.4.tgz uncompressed tar sha1 $packed_tar does not match $QA_SHA1_MCP_TAR." >&2
  exit 1
fi
remote_shasum="$(npm view spurvik-mcp-server@1.0.4 dist.shasum)"
work="$(mktemp -d)"
(cd "$work" && npm pack spurvik-mcp-server@1.0.4 >/dev/null)
remote_tar="$(tar_sha1 "$work/spurvik-mcp-server-1.0.4.tgz")"
if [[ "$remote_tar" != "$QA_SHA1_MCP_TAR" ]]; then
  echo "Stop: published spurvik-mcp-server@1.0.4 uncompressed tar sha1 $remote_tar does not match the sha1 QA recorded ($QA_SHA1_MCP_TAR)." >&2
  rm -rf "$work"
  exit 1
fi
if [[ "$remote_shasum" != "$QA_SHA1_MCP" && "$remote_shasum" != "$(tgz_sha1 "$packed")" ]]; then
  echo "Note: npm view spurvik-mcp-server@1.0.4 dist.shasum is $remote_shasum; QA tgz sha1 is $QA_SHA1_MCP; packed tgz sha1 is $(tgz_sha1 "$packed"). The uncompressed tar sha1 matches $QA_SHA1_MCP_TAR, so the content is the same and the gzip bytes differ." >&2
fi
rm -rf "$work"
)
```

```bash
# MCP 8. Registry install check. Run only after spurvik-mcp-server@1.0.4 is on the registry.
(
  rm -rf /tmp/spurvik-mcp-registry-check
  mkdir -p /tmp/spurvik-mcp-registry-check
  cd /tmp/spurvik-mcp-registry-check || exit 1
  npm init -y
  npm install spurvik-mcp-server@1.0.4
)
```
