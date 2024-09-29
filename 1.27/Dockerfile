# 使用官方 Node.js 镜像作为基础镜像
FROM node:16

# 安装 Python、pip 和 cron
RUN apt-get update && apt-get install -y python3 python3-pip cron

# 安装所需的 Python 库
RUN pip3 install requests beautifulsoup4 schedule

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 安装 Node.js 依赖
RUN npm install
RUN npm list node-fetch

# 复制所有源代码到容器中
COPY . .

# 设置 cron 任务
RUN echo "0 5,17 * * * python3 /app/convert_mytvfree.py" > /etc/cron.d/mytvfree-cron
RUN chmod 0644 /etc/cron.d/mytvfree-cron
RUN crontab /etc/cron.d/mytvfree-cron

# 创建启动脚本
RUN echo "#!/bin/sh" > /app/start.sh
RUN echo "cron" >> /app/start.sh
RUN echo "python3 /app/convert_mytvfree.py &" >> /app/start.sh
RUN echo "node index.js" >> /app/start.sh
RUN chmod +x /app/start.sh

# 暴露端口
EXPOSE 4994

# 启动命令
CMD ["/app/start.sh"]
