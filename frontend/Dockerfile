FROM node:22-alpine

WORKDIR /app

# 前端脚手架占位 — 后续替换为完整Vue 3项目
RUN npm init -y && npm install vue@3

EXPOSE 5173

CMD ["npx", "serve", ".", "-l", "5173"]
