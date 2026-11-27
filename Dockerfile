# Official Containerized Stdio MCP Server for Spurvik (spurvik-mcp-server@1.0.15, MIT)
# Compatible with Glama.ai container inspection, Smithery.ai, Docker MCP Catalog, and air-gapped EU CI.
#
# Run against a local repository (read-only mount):
#   docker run -i --rm -v "$PWD:/workspace:ro" spurvik-mcp --root /workspace

FROM node:22-alpine

LABEL org.opencontainers.image.title="spurvik-mcp-server" \
      org.opencontainers.image.description="EU AI Act Art. 50/12/14 & 2 Dec 2026 C2PA 10-tool zero-key MCP server (MIT)" \
      org.opencontainers.image.version="1.0.15" \
      org.opencontainers.image.vendor="EyeTea Solutions ApS (Spurvik)" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.url="https://spurvik.com/docs" \
      org.opencontainers.image.source="https://github.com/spurvik/spurvik"

RUN npm install -g spurvik-mcp-server@1.0.15 --no-fund --no-audit && \
    npm cache clean --force && \
    mkdir -p /workspace && \
    printf '{"name":"spurvik-mcp-workspace","private":true}\n' > /workspace/package.json && \
    chown -R node:node /workspace

WORKDIR /workspace
USER node
ENV NODE_ENV=production \
    SPURVIK_MCP_ROOT=/workspace

ENTRYPOINT ["spurvik-mcp-server"]
CMD ["--root", "/workspace"]
