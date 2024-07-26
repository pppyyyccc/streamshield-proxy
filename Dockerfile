# 使用官方 Node.js 镜像作为基础镜像
FROM node:14

# 安装 Python 和 pip
RUN apt-get update && apt-get install -y python3 python3-pip

# 安装所需的 Python 库
RUN pip3 install requests beautifulsoup4 schedule

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 安装 Node.js 依赖
RUN npm install

# 复制所有源代码到容器中
COPY . .

# 暴露端口（根据您的 Node.js 应用需要修改）
EXPOSE 4994

# 启动命令
CMD ["sh", "-c", "node index.js & python3 convert_thetv.py"]
