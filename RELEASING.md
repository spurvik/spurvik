# Releasing spurvik, spurvik-sdk, and n8n-nodes-spurvik

Run these commands from a clean checkout of the merge commit. `spurvik` and `spurvik-sdk` are the same SDK build under two names. `spurvik-sdk` does not depend on `spurvik`. Do not pass `--provenance`.

Publish order: `spurvik-sdk`, then `spurvik`, then `n8n-nodes-spurvik` (it depends on `spurvik-sdk@^1.0.5`).

Do not `npm install` `spurvik@1.0.5` or `spurvik-sdk@1.0.5` from the registry until after `npm publish`. That install fails with `ETARGET` while the version is unpublished. Smoke-test from the local `.tgz` files.

```bash
git checkout <merge-commit>
git status   # must be clean

# 1. Build from the lockfiles. core is bundled and is not published.
cd packages/core
npm ci
npm run build
cd ../react
npm ci
npm run build
cd ../sdk
npm ci
npm run build

# 2. Pack local tarballs. Dry-run from the package directories.
mkdir -p /tmp/spurvik-release
cd packages/sdk
npm pack --pack-destination /tmp/spurvik-release
npm publish --dry-run
cd ../..
node scripts/stage-spurvik-package.mjs
cd packages/spurvik
npm pack --pack-destination /tmp/spurvik-release
npm publish --dry-run

# 3. Build the n8n package against the local spurvik-sdk tarball, then pack and dry-run.
cd ../n8n-nodes-spurvik
npm install --no-save --legacy-peer-deps /tmp/spurvik-release/spurvik-sdk-1.0.5.tgz
npm install --no-save --legacy-peer-deps typescript@5.9.3 n8n-workflow@2.46.4 @types/node@22.20.5
npm run build
npm pack --pack-destination /tmp/spurvik-release
npm publish --dry-run

# 4. Smoke-test the three tarballs in a fresh directory. Still no registry install of 1.0.5.
mkdir -p /tmp/spurvik-smoke
cd /tmp/spurvik-smoke
npm init -y
npm install --legacy-peer-deps \
  /tmp/spurvik-release/spurvik-1.0.5.tgz \
  /tmp/spurvik-release/spurvik-sdk-1.0.5.tgz \
  /tmp/spurvik-release/n8n-nodes-spurvik-1.0.2.tgz

# 5. Publish for real, in order, only when the owner decides. No --provenance.
cd packages/sdk && npm publish
cd packages/spurvik && npm publish
cd packages/n8n-nodes-spurvik && npm publish

# 6. After publish, a registry install check is valid.
mkdir -p /tmp/spurvik-registry-check
cd /tmp/spurvik-registry-check
npm init -y
npm install spurvik@1.0.5 spurvik-sdk@1.0.5 n8n-nodes-spurvik@1.0.2
```

Hosted console features are invite-only during early access. These commands do not publish the console.
