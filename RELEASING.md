# Releasing spurvik, spurvik-sdk, and n8n-nodes-spurvik

Run these commands from a clean checkout of the merge commit. Do the dry-run for every package before any real publish. `spurvik` and `spurvik-sdk` are the same SDK build under two names. `spurvik-sdk` does not depend on `spurvik`.

Publish order: `spurvik-sdk`, then `spurvik`, then `n8n-nodes-spurvik` (it depends on `spurvik-sdk@^1.0.5`).

```bash
git checkout <merge-commit>
git status   # must be clean

# 1. Build core, the React entry, then the SDK (core is bundled; it is not published).
cd packages/core
npm install
npm run build
cd ../react
npm install
npm run build
cd ../sdk
npm install
npm run build

# 2. Dry-run spurvik-sdk from packages/sdk.
npm publish --dry-run

# 3. Stage the same dist as the spurvik package and dry-run it.
cd ../..
node scripts/stage-spurvik-package.mjs
cd packages/spurvik
npm publish --dry-run

# 4. Build and dry-run the n8n package. Install the local spurvik-sdk tarball
#    first when 1.0.5 is not on the registry yet.
cd ../sdk
npm pack
cd ../n8n-nodes-spurvik
npm install
npm install --no-save ../sdk/spurvik-sdk-1.0.5.tgz
npm run build
npm publish --dry-run

# 5. Publish for real, in the same order, only when the owner decides.
#    Omit --dry-run. Do not run npm login from an agent.
cd ../sdk && npm publish
cd ../spurvik && npm publish
cd ../n8n-nodes-spurvik && npm publish
```

Hosted console features are invite-only during early access. These commands do not publish the console.
