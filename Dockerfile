# Dockerfile
FROM node:14

# 创建应用工作目录
WORKDIR /usr/src/app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制应用代码
COPY . .

# 暴露端口
EXPOSE 4994

# 启动应用
CMD ["node", "index.js"]
