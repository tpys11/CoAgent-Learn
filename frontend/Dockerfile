# ---------- Stage 1: 构建静态产物（tsc -b 类型检查 + vite build）----------
FROM node:22-alpine AS builder
WORKDIR /app
# .dockerignore 已排除 node_modules/dist/.vite：宿主 Windows 原生二进制不会混入 alpine
COPY package.json package-lock.json ./
# npm ci：按 lockfile 精确安装（比 npm install 更可复现），同时安装 devDependencies（tsc 在 devDeps）
RUN npm ci
COPY . .
RUN npm run build

# ---------- Stage 2: nginx 运行时（只携带静态产物与反代配置）----------
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
