# syntax=docker/dockerfile:1.6
#
# WeDeploy 多阶段 Dockerfile
# ----------------------------
# Stage 1 (frontend-build): vite 构建前端静态资源
# Stage 2 (server-build):   编译后端 TypeScript -> dist/，并 prune 出生产依赖
# Stage 3 (api-runtime):    后端运行镜像，最终对外暴露 :8080
# Stage 4 (web-runtime):    nginx 镜像，托管前端静态资源并反代 /api 到 api 容器
#
# 单容器一键启动请使用 docker-compose.yml；它会按 target 同时构建出 api 与 web 两个镜像。

ARG NODE_IMAGE=node:20-bookworm-slim

# =================================================================
# Stage 1: frontend-build —— Vite + React 前端编译
# =================================================================
FROM ${NODE_IMAGE} AS frontend-build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# 利用 layer 缓存：先只装依赖
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# 注意：vite build 默认输出到 ./dist
RUN pnpm run build

# =================================================================
# Stage 2: server-build —— TypeScript 后端编译 + better-sqlite3 原生模块编译
# =================================================================
FROM ${NODE_IMAGE} AS server-build
WORKDIR /app/server

# better-sqlite3 是原生扩展，需要 python3/make/g++ 才能在容器内编译出 binary
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY server/ ./
RUN pnpm run build

# 剔除 dev deps；保留已编译好的 better-sqlite3 native binary，避免运行时再装编译工具
RUN pnpm prune --prod

# =================================================================
# Stage 3: api-runtime —— 仅含后端运行时所需文件，对外暴露 :8080
# =================================================================
FROM ${NODE_IMAGE} AS api-runtime
WORKDIR /app/server

# git / openssh-client 用于在构建任务中 clone 用户业务仓库（必须）
# tini 用于正确转发 SIGTERM，保证容器优雅退出
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates openssh-client tini \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DB_PATH=/data/we-deploy.db \
    SANDBOX_BASE=/data/sandbox \
    QRCODE_BASE=/data/qrcodes

# 从 server-build 阶段拷贝编译产物 + 已 prune 的 node_modules
COPY --from=server-build /app/server/dist          ./dist
COPY --from=server-build /app/server/node_modules  ./node_modules
COPY --from=server-build /app/server/package.json  ./

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]

# =================================================================
# Stage 4: web-runtime —— nginx 托管前端 + 反代 /api 到 api 容器
# =================================================================
FROM nginx:1.27-alpine AS web-runtime

COPY --from=frontend-build /app/dist /usr/share/nginx/html
COPY deploy/nginx.docker.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
