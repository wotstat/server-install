FROM oven/bun:alpine as base
WORKDIR /app


FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile


RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production


FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .


FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /app/src src
COPY --from=prerelease /app/package.json .
COPY --from=prerelease /app/tsconfig.json tsconfig.json


USER bun
ENTRYPOINT [ "bun", "run", "src/index.ts" ]