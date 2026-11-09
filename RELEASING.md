# Releasing spurvik, spurvik-sdk, and n8n-nodes-spurvik

Run these commands from a clean checkout of the merge commit. `spurvik` and `spurvik-sdk` are the same SDK build under two names. `spurvik-sdk` does not depend on `spurvik`. Do not pass `--provenance`.

Publish order: `spurvik-sdk`, then `spurvik`, then `n8n-nodes-spurvik` (it depends on `spurvik-sdk@^1.0.6`).

Do not `npm install` `spurvik@1.0.6` or `spurvik-sdk@1.0.6` from the registry until after `npm publish`. That install fails with `ETARGET` while the version is unpublished. Smoke-test from the local `.tgz` files.

`packages/sdk/package.json` has no `file:` dependency. The SDK build links `packages/core` into `node_modules` for that build only. That link is not part of the published package.

Steps 1–4 run inside one subshell so `set -e` does not stay on in your interactive shell.

```bash
(
set -euo pipefail
REPO=$(git rev-parse --show-toplevel)
cd "$REPO" || exit 1
# Hard stop before any pack. On 4 Nov 2026 spurvik@1.0.6 was packed from a dirty tree,
# so its registry gitHead points at a commit whose package.json still said 1.0.5.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Stop: git status --porcelain is not empty. Refusing to pack from a dirty tree." >&2
  git status --porcelain >&2
  exit 1
fi

# 1. Build from the lockfiles. core is bundled and is not published.
(
  cd "$REPO"/packages/core
  npm ci
  npm run build
)
(
  cd "$REPO"/packages/react
  npm ci
  npm run build
)
(
  cd "$REPO"/packages/sdk
  npm ci
  npm run build
)

# 2. Pack local tarballs. Dry-run from the package directories.
mkdir -p /tmp/spurvik-release
(
  cd "$REPO"/packages/sdk
  npm pack --pack-destination /tmp/spurvik-release
  npm publish --dry-run
)
(
  cd "$REPO"
  node scripts/stage-spurvik-package.mjs
  cd "$REPO"/packages/spurvik
  npm pack --pack-destination /tmp/spurvik-release
  npm publish --dry-run
)

# 3. Build the n8n package against the local spurvik-sdk tarball, then pack and dry-run.
(
  cd "$REPO"/packages/n8n-nodes-spurvik
  npm install --no-save --no-package-lock --legacy-peer-deps /tmp/spurvik-release/spurvik-sdk-1.0.6.tgz
  npm install --no-save --no-package-lock --legacy-peer-deps typescript@5.9.3 n8n-workflow@2.46.4 @types/node@22.20.5
  npm run build
  npm pack --pack-destination /tmp/spurvik-release
  npm publish --dry-run
)

# 4. Smoke-test the three tarballs in a fresh directory. Still no registry install of 1.0.6.
#    Clear only these two directories, then pack again into the empty release directory.
rm -rf /tmp/spurvik-release /tmp/spurvik-smoke
mkdir -p /tmp/spurvik-release /tmp/spurvik-smoke
(
  cd "$REPO"/packages/sdk
  npm pack --pack-destination /tmp/spurvik-release
)
(
  cd "$REPO"
  node scripts/stage-spurvik-package.mjs
  cd "$REPO"/packages/spurvik
  npm pack --pack-destination /tmp/spurvik-release
)
(
  cd "$REPO"/packages/n8n-nodes-spurvik
  npm pack --pack-destination /tmp/spurvik-release
)
(
  cd /tmp/spurvik-smoke
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
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Stop: git status --porcelain is not empty. Refusing to pack from a dirty tree." >&2
    git status --porcelain >&2
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

Publish stays a separate block. It publishes the tarballs step 5 already packed. It does not pack again. No --provenance.

`spurvik@1.0.6` and `spurvik-sdk@1.0.6` have no code change in the 1.0.3 n8n release. Skip a name whose version is already on the registry. This release's new publish is `n8n-nodes-spurvik@1.0.3`.

```bash
# 6. Publish the exact packed tarball, in order, only when the owner decides. No --provenance.
(
  cd "$(git rev-parse --show-toplevel)"/packages/sdk || exit 1
  npm publish ./spurvik-sdk-1.0.6.tgz
)
(
  cd "$(git rev-parse --show-toplevel)"/packages/spurvik || exit 1
  npm publish ./spurvik-1.0.6.tgz
)
(
  cd "$(git rev-parse --show-toplevel)"/packages/n8n-nodes-spurvik || exit 1
  npm publish ./n8n-nodes-spurvik-1.0.3.tgz
)
```

After that publish, the registry `dist.shasum` must equal the packed sha1, and `npm view <pkg>@<ver> gitHead` must equal `QA_SHA`. Then a registry install check is valid.

Run the gitHead check for each version you published from `QA_SHA`. `spurvik@1.0.6` and `spurvik-sdk@1.0.6` were packed on 4 Nov 2026 from a dirty tree, so their registry `gitHead` points at a commit whose `package.json` still said `1.0.5`. That old `gitHead` will not equal this release's `QA_SHA`. Skip those two gitHead lines unless you published that version from `QA_SHA`. This release's new publish is `n8n-nodes-spurvik@1.0.3`, and its `gitHead` must equal `QA_SHA`.

```bash
# 7. Post-publish check. dist.shasum must equal the packed sha1.
#    gitHead must equal QA_SHA for each version published from that commit.
(
set -euo pipefail
: "${QA_SHA:?Set QA_SHA to the QA-passed commit}"
(
  cd "$(git rev-parse --show-toplevel)"/packages/sdk || exit 1
  packed="$(shasum -a 1 ./spurvik-sdk-1.0.6.tgz | awk '{print $1}')"
  remote="$(npm view spurvik-sdk@1.0.6 dist.shasum)"
  if [[ "$remote" != "$packed" ]]; then
    echo "Stop: npm view spurvik-sdk@1.0.6 dist.shasum is $remote, packed sha1 is $packed." >&2
    exit 1
  fi
  # Set PUBLISHED_FROM_QA_SHA_SPURVIK_SDK=1 only when this version was published from QA_SHA.
  if [[ "${PUBLISHED_FROM_QA_SHA_SPURVIK_SDK:-}" == "1" ]]; then
    git_head="$(npm view spurvik-sdk@1.0.6 gitHead)"
    if [[ "$git_head" != "$QA_SHA" ]]; then
      echo "Stop: npm view spurvik-sdk@1.0.6 gitHead is $git_head, QA_SHA is $QA_SHA." >&2
      exit 1
    fi
  fi
)
(
  cd "$(git rev-parse --show-toplevel)"/packages/spurvik || exit 1
  packed="$(shasum -a 1 ./spurvik-1.0.6.tgz | awk '{print $1}')"
  remote="$(npm view spurvik@1.0.6 dist.shasum)"
  if [[ "$remote" != "$packed" ]]; then
    echo "Stop: npm view spurvik@1.0.6 dist.shasum is $remote, packed sha1 is $packed." >&2
    exit 1
  fi
  # Set PUBLISHED_FROM_QA_SHA_SPURVIK=1 only when this version was published from QA_SHA.
  if [[ "${PUBLISHED_FROM_QA_SHA_SPURVIK:-}" == "1" ]]; then
    git_head="$(npm view spurvik@1.0.6 gitHead)"
    if [[ "$git_head" != "$QA_SHA" ]]; then
      echo "Stop: npm view spurvik@1.0.6 gitHead is $git_head, QA_SHA is $QA_SHA." >&2
      exit 1
    fi
  fi
)
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
  cd /tmp/spurvik-registry-check
  npm init -y
  npm install spurvik@1.0.6 spurvik-sdk@1.0.6 n8n-nodes-spurvik@1.0.3
)
```

Hosted console features are invite-only during early access. These commands do not publish the console.
