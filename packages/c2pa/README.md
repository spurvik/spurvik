# @spurvik/c2pa

Sign and read C2PA manifests on PNG and JPEG images with `@contentauth/c2pa-node` 0.9.10, which pins the Rust crate `c2pa` to 0.91.3. A matching signature is a check of that manifest. It is not a conformity assessment.

`createC2paImageHook` embeds a manifest. `readImageManifest` reports whether a signature matches and whether the certificate is on a trust list. A match is a check of that manifest. It is not a conformity assessment.

The signing certificate must be an X.509 v3 end-entity certificate with critical `CA:FALSE`, critical `digitalSignature`, critical `emailProtection` extended key usage, a subject key identifier, and an authority key identifier. The private key is PKCS#8 PEM. Self-signed certificates are rejected by the library.

Private until the repository owner records a licence. See the root `LICENSE`.
