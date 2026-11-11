# Releasing spurvik, spurvik-sdk, and n8n-nodes-spurvik

Run these commands from a clean detached checkout of QA_SHA. `spurvik` and `spurvik-sdk` are the same SDK build under two names. `spurvik-sdk` does not depend on `spurvik`. Do not pass `--provenance`.

When a version is new, publish `spurvik-sdk`, then `spurvik`, then `n8n-nodes-spurvik` (it depends on `spurvik-sdk@^1.0.6`). This release publishes `spurvik-sdk@1.0.7`, then `spurvik@1.0.7`. Skip `n8n-nodes-spurvik@1.0.3`. It is already published, and this release does not change it. Never republish an existing version.

The n8n `outputField` check compares field names, not values.

Smoke-test from the local `.tgz` files. `n8n-nodes-spurvik@1.0.3` is already on the registry. Do not install `spurvik@1.0.7` or `spurvik-sdk@1.0.7` from the registry until after this release is published. That install fails with `ETARGET` while the version is unpublished.

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
  npm install --no-save --no-package-lock --legacy-peer-deps /tmp/spurvik-release/spurvik-sdk-1.0.7.tgz
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

# 4. Smoke-test the three tarballs in a fresh directory. Still no registry install of 1.0.7.
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
    /tmp/spurvik-release/spurvik-1.0.7.tgz \
    /tmp/spurvik-release/spurvik-sdk-1.0.7.tgz \
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
# Then pack each package and compare the tarball sha1 to the sha1 QA recorded for that head.
# Stop if they differ. Do not run npm publish in this block.
# QA_SHA, QA_SHA1_SPURVIK_SDK, QA_SHA1_SPURVIK, QA_NODE_VERSION, and QA_NPM_VERSION are to be
# filled in at the QA gate for this release (1.0.7). Do not reuse values from an earlier release.
# shasum -a 1 <tgz> and `npm pack --json` field .shasum are the same sha1.
# The .tgz sha1 depends on the Node build that runs npm pack, because the gzip bytes come
# from Node's zlib. For n8n-nodes-spurvik@1.0.3, QA packed 4d054d1a on Node 24 and the
# publish packed dccdb9e6 on Node 26.0.0. The uncompressed tar was the same in both.
# So pack on the same Node version and the same npm version QA used
# (QA_NODE_VERSION, for example v24.22.1, and QA_NPM_VERSION, for example 10.9.9).
(
set -euo pipefail
: "${QA_SHA:?Set QA_SHA to the QA-passed commit, to be filled in at the QA gate for this release}"
: "${QA_SHA1_SPURVIK_SDK:?Set QA_SHA1_SPURVIK_SDK to the spurvik-sdk-1.0.7.tgz sha1 QA records at the QA gate for this release}"
: "${QA_SHA1_SPURVIK:?Set QA_SHA1_SPURVIK to the spurvik-1.0.7.tgz sha1 QA records at the QA gate for this release}"
: "${QA_NODE_VERSION:?Set QA_NODE_VERSION to the node -v output QA records at the QA gate for this release}"
: "${QA_NPM_VERSION:?Set QA_NPM_VERSION to the npm -v output QA records at the QA gate for this release}"
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
  actual="$(shasum -a 1 ./spurvik-sdk-1.0.7.tgz | awk '{print $1}')"
  if [[ "$actual" != "$QA_SHA1_SPURVIK_SDK" ]]; then
    echo "Stop: spurvik-sdk-1.0.7.tgz sha1 $actual does not match the sha1 QA recorded for the approved head ($QA_SHA1_SPURVIK_SDK)." >&2
    exit 1
  fi
)
(
  cd "$(git rev-parse --show-toplevel)" || exit 1
  node scripts/stage-spurvik-package.mjs
  cd "$(git rev-parse --show-toplevel)"/packages/spurvik || exit 1
  npm pack
  actual="$(shasum -a 1 ./spurvik-1.0.7.tgz | awk '{print $1}')"
  if [[ "$actual" != "$QA_SHA1_SPURVIK" ]]; then
    echo "Stop: spurvik-1.0.7.tgz sha1 $actual does not match the sha1 QA recorded for the approved head ($QA_SHA1_SPURVIK)." >&2
    exit 1
  fi
)
)
```

Publish stays a separate block, one block per package. It publishes the tarball step 5 already packed. It does not pack again. No --provenance.

This release publishes `spurvik-sdk@1.0.7`, then `spurvik@1.0.7`. Skip `n8n-nodes-spurvik@1.0.3`. It is already published, and this release does not change it. Never republish an existing version.

```bash
# 6. Publish spurvik-sdk@1.0.7, then spurvik@1.0.7, only when the owner decides. No --provenance.
# spurvik-sdk@1.0.7 first. spurvik is the same build under a second name.
# Recheck the sha1 of the exact .tgz immediately before publish. Stop on mismatch.
(
  set -euo pipefail
  cd "$(git rev-parse --show-toplevel)"/packages/sdk || exit 1
  : "${QA_SHA1_SPURVIK_SDK:?Set QA_SHA1_SPURVIK_SDK to the spurvik-sdk-1.0.7.tgz sha1 QA records at the QA gate for this release}"
  actual="$(shasum -a 1 ./spurvik-sdk-1.0.7.tgz | awk '{print $1}')"
  if [[ "$actual" != "$QA_SHA1_SPURVIK_SDK" ]]; then
    echo "Stop: spurvik-sdk-1.0.7.tgz sha1 $actual does not match the sha1 QA recorded for the approved head ($QA_SHA1_SPURVIK_SDK)." >&2
    exit 1
  fi
  npm publish ./spurvik-sdk-1.0.7.tgz
)
(
  set -euo pipefail
  cd "$(git rev-parse --show-toplevel)"/packages/spurvik || exit 1
  : "${QA_SHA1_SPURVIK:?Set QA_SHA1_SPURVIK to the spurvik-1.0.7.tgz sha1 QA records at the QA gate for this release}"
  actual="$(shasum -a 1 ./spurvik-1.0.7.tgz | awk '{print $1}')"
  if [[ "$actual" != "$QA_SHA1_SPURVIK" ]]; then
    echo "Stop: spurvik-1.0.7.tgz sha1 $actual does not match the sha1 QA recorded for the approved head ($QA_SHA1_SPURVIK)." >&2
    exit 1
  fi
  npm publish ./spurvik-1.0.7.tgz
)
# n8n-nodes-spurvik@1.0.3 — SKIP. Already published. Never republish an existing version.
(
  cd "$(git rev-parse --show-toplevel)"/packages/n8n-nodes-spurvik || exit 1
  echo "Skip n8n-nodes-spurvik@1.0.3. Already published. Never republish an existing version."
)
```

After those publishes, `npm view <name>@1.0.7 dist.shasum` must equal the packed sha1 for `spurvik-sdk` and `spurvik`. A tarball publish (`npm publish ./x.tgz`) sends no `gitHead`, so `npm view <name>@1.0.7 gitHead` prints nothing. `n8n-nodes-spurvik@1.0.3` shows this: it was published from a tarball and has no `gitHead`. The commit link is QA_SHA plus the matching sha1 from step 5. Do not run this check for `n8n-nodes-spurvik@1.0.3`. It is not republished. Then a registry install check is valid.

```bash
# 7. Post-publish check for the two packages this release publishes.
(
set -euo pipefail
check() {
  local dir="$1" name="$2"
  cd "$(git rev-parse --show-toplevel)"/packages/"$dir" || exit 1
  packed="$(shasum -a 1 ./"$name"-1.0.7.tgz | awk '{print $1}')"
  remote="$(npm view "$name"@1.0.7 dist.shasum)"
  if [[ "$remote" != "$packed" ]]; then
    echo "Stop: npm view $name@1.0.7 dist.shasum is $remote, packed sha1 is $packed." >&2
    exit 1
  fi
}
(check sdk spurvik-sdk)
(check spurvik spurvik)
)
```

```bash
# 8. Registry install check. Run only after the packages you published are on the registry.
(
  rm -rf /tmp/spurvik-registry-check
  mkdir -p /tmp/spurvik-registry-check
  cd /tmp/spurvik-registry-check || exit 1
  npm init -y
  npm install spurvik@1.0.7 spurvik-sdk@1.0.7 n8n-nodes-spurvik@1.0.3
)
```

Hosted console features are invite-only during early access. These commands do not publish the console.
