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
cd "$REPO"
git status   # must be clean

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
    /tmp/spurvik-release/n8n-nodes-spurvik-1.0.2.tgz
  # spurvik/react imports react. React is an optional peer, so install it for this import check.
  npm install --no-save --no-package-lock --legacy-peer-deps react@19 react-dom@19
  node --input-type=module -e 'import * as spurvik from "spurvik"; import * as sdk from "spurvik-sdk"; import * as channels from "spurvik-sdk/channels"; import * as react from "spurvik/react"; if (typeof spurvik.withSpurvik !== "function" || typeof sdk.withSpurvik !== "function" || typeof channels.verifyChannelApprovalToken !== "function" || typeof react.AIDisclosureLabel !== "function") throw new Error("ESM import smoke failed");'
  node -e 'const spurvik = require("spurvik"); const sdk = require("spurvik-sdk"); const channels = require("spurvik-sdk/channels"); const react = require("spurvik/react"); const node = require("n8n-nodes-spurvik/dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js"); const cred = require("n8n-nodes-spurvik/dist/credentials/SpurvikApi.credentials.js"); if (typeof spurvik.withSpurvik !== "function" || typeof sdk.withSpurvik !== "function" || typeof channels.verifyChannelApprovalToken !== "function" || typeof react.AIDisclosureLabel !== "function") throw new Error("CJS import smoke failed"); if (typeof node.SpurvikEuAiActGuard !== "function" || typeof cred.SpurvikApi !== "function") throw new Error("n8n class require failed");'
)
)
```

Stop and check step 4 output first. The ESM and CJS import checks must print nothing and exit 0 before you publish.

```bash
# 5. Publish for real, in order, only when the owner decides. No --provenance.
(
  cd "$(git rev-parse --show-toplevel)"/packages/sdk
  npm publish
)
(
  cd "$(git rev-parse --show-toplevel)"/packages/spurvik
  npm publish
)
(
  cd "$(git rev-parse --show-toplevel)"/packages/n8n-nodes-spurvik
  npm publish
)
```

After that publish, a registry install check is valid.

```bash
# 6. Registry install check. Run only after step 5 has published all three packages.
(
  rm -rf /tmp/spurvik-registry-check
  mkdir -p /tmp/spurvik-registry-check
  cd /tmp/spurvik-registry-check
  npm init -y
  npm install spurvik@1.0.6 spurvik-sdk@1.0.6 n8n-nodes-spurvik@1.0.2
)
```

Hosted console features are invite-only during early access. These commands do not publish the console.
