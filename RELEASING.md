# Releasing spurvik, spurvik-sdk, and n8n-nodes-spurvik

Run these commands from a clean checkout of the merge commit. `spurvik` and `spurvik-sdk` are the same SDK build under two names. `spurvik-sdk` does not depend on `spurvik`. Do not pass `--provenance`.

When a version is new, publish `spurvik-sdk`, then `spurvik`, then `n8n-nodes-spurvik` (it depends on `spurvik-sdk@^1.0.6`). This release publishes only `n8n-nodes-spurvik@1.0.3`. Skip `spurvik@1.0.6` and `spurvik-sdk@1.0.6`. They are already published. A clean pack of those two differs from the registry in metadata only. Never republish an existing version.

The n8n `outputField` check compares field names, not values.

Smoke-test from the local `.tgz` files. `spurvik@1.0.6` and `spurvik-sdk@1.0.6` are already on the registry. Do not install `n8n-nodes-spurvik@1.0.3` from the registry until after this release is published. That install fails with `ETARGET` while the version is unpublished.

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

# 3. Build the n8n package against the local spurvik-sdk tarball, then pack.
#    Dry-run only after all three dists exist.
(
  cd "$REPO"/packages/n8n-nodes-spurvik || exit 1
  npm install --no-save --no-package-lock --legacy-peer-deps /tmp/spurvik-release/spurvik-sdk-1.0.6.tgz
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
(
  cd "$REPO"/packages/n8n-nodes-spurvik || exit 1
  npm publish --dry-run
)

# 4. Smoke-test the three tarballs in a fresh directory. Still no registry install of 1.0.6.
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
    /tmp/spurvik-release/spurvik-1.0.6.tgz \
    /tmp/spurvik-release/spurvik-sdk-1.0.6.tgz \
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
# Set QA_SHA1_SPURVIK_SDK, QA_SHA1_SPURVIK, and QA_SHA1_N8N_NODES_SPURVIK from that record first.
# shasum -a 1 <tgz> and `npm pack --json` field .shasum are the same sha1.
(
set -euo pipefail
: "${QA_SHA:?Set QA_SHA to the QA-passed commit}"
: "${QA_SHA1_SPURVIK_SDK:?Set QA_SHA1_SPURVIK_SDK to the sha1 QA recorded for the approved head}"
: "${QA_SHA1_SPURVIK:?Set QA_SHA1_SPURVIK to the sha1 QA recorded for the approved head}"
: "${QA_SHA1_N8N_NODES_SPURVIK:?Set QA_SHA1_N8N_NODES_SPURVIK to the sha1 QA recorded for the approved head}"
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
  actual="$(shasum -a 1 ./spurvik-sdk-1.0.6.tgz | awk '{print $1}')"
  if [[ "$actual" != "$QA_SHA1_SPURVIK_SDK" ]]; then
    echo "Stop: spurvik-sdk-1.0.6.tgz sha1 $actual does not match the sha1 QA recorded for the approved head ($QA_SHA1_SPURVIK_SDK)." >&2
    exit 1
  fi
)
(
  cd "$(git rev-parse --show-toplevel)" || exit 1
  node scripts/stage-spurvik-package.mjs
  cd "$(git rev-parse --show-toplevel)"/packages/spurvik || exit 1
  npm pack
  actual="$(shasum -a 1 ./spurvik-1.0.6.tgz | awk '{print $1}')"
  if [[ "$actual" != "$QA_SHA1_SPURVIK" ]]; then
    echo "Stop: spurvik-1.0.6.tgz sha1 $actual does not match the sha1 QA recorded for the approved head ($QA_SHA1_SPURVIK)." >&2
    exit 1
  fi
)
(
  cd "$(git rev-parse --show-toplevel)"/packages/n8n-nodes-spurvik || exit 1
  npm pack
  actual="$(shasum -a 1 ./n8n-nodes-spurvik-1.0.3.tgz | awk '{print $1}')"
  if [[ "$actual" != "$QA_SHA1_N8N_NODES_SPURVIK" ]]; then
    echo "Stop: n8n-nodes-spurvik-1.0.3.tgz sha1 $actual does not match the sha1 QA recorded for the approved head ($QA_SHA1_N8N_NODES_SPURVIK)." >&2
    exit 1
  fi
)
)
```

Publish stays a separate block, one block per package. It publishes the tarball step 5 already packed. It does not pack again. No --provenance.

This release publishes only `n8n-nodes-spurvik@1.0.3`. Skip `spurvik@1.0.6` and `spurvik-sdk@1.0.6`. They are already published. A clean pack of those two differs from the registry in metadata only. Never republish an existing version.

```bash
# 6. Publish only n8n-nodes-spurvik@1.0.3, only when the owner decides. No --provenance.
# spurvik-sdk@1.0.6 — SKIP. Already published. Never republish an existing version.
(
  cd "$(git rev-parse --show-toplevel)"/packages/sdk || exit 1
  echo "Skip spurvik-sdk@1.0.6. Already published. A clean pack differs from the registry in metadata only. Never republish an existing version."
)
# spurvik@1.0.6 — SKIP. Already published. Never republish an existing version.
(
  cd "$(git rev-parse --show-toplevel)"/packages/spurvik || exit 1
  echo "Skip spurvik@1.0.6. Already published. A clean pack differs from the registry in metadata only. Never republish an existing version."
)
# n8n-nodes-spurvik@1.0.3 — the only publish for this release.
(
  cd "$(git rev-parse --show-toplevel)"/packages/n8n-nodes-spurvik || exit 1
  npm publish ./n8n-nodes-spurvik-1.0.3.tgz
)
```

After that publish, `npm view n8n-nodes-spurvik@1.0.3 dist.shasum` must equal the packed sha1, and `npm view n8n-nodes-spurvik@1.0.3 gitHead` must equal `QA_SHA`. Do not run that check for `spurvik@1.0.6` or `spurvik-sdk@1.0.6`. Those versions are not republished. Their registry `gitHead` is from the 4 Nov 2026 dirty-tree pack, whose `package.json` still said `1.0.5`. Then a registry install check is valid.

```bash
# 7. Post-publish check for the only package this release publishes.
(
set -euo pipefail
: "${QA_SHA:?Set QA_SHA to the QA-passed commit}"
(
  cd "$(git rev-parse --show-toplevel)"/packages/n8n-nodes-spurvik || exit 1
  packed="$(shasum -a 1 ./n8n-nodes-spurvik-1.0.3.tgz | awk '{print $1}')"
  remote="$(npm view n8n-nodes-spurvik@1.0.3 dist.shasum)"
  if [[ "$remote" != "$packed" ]]; then
    echo "Stop: npm view n8n-nodes-spurvik@1.0.3 dist.shasum is $remote, packed sha1 is $packed." >&2
    exit 1
  fi
  git_head="$(npm view n8n-nodes-spurvik@1.0.3 gitHead)"
  if [[ "$git_head" != "$QA_SHA" ]]; then
    echo "Stop: npm view n8n-nodes-spurvik@1.0.3 gitHead is $git_head, QA_SHA is $QA_SHA." >&2
    exit 1
  fi
)
)
```

```bash
# 8. Registry install check. Run only after the packages you published are on the registry.
(
  rm -rf /tmp/spurvik-registry-check
  mkdir -p /tmp/spurvik-registry-check
  cd /tmp/spurvik-registry-check || exit 1
  npm init -y
  npm install spurvik@1.0.6 spurvik-sdk@1.0.6 n8n-nodes-spurvik@1.0.3
)
```

Hosted console features are invite-only during early access. These commands do not publish the console.
