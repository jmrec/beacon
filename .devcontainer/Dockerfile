FROM node:24-trixie-slim

RUN corepack enable

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack prepare pnpm@12.1.0 --activate
