FROM node:16

# 设置工作目录
WORKDIR /app

# 复制 AKTV_NODE-linux 可执行文件到镜像中
COPY AKTV_NODE-linux /app/AKTV_NODE-linux
RUN chmod +x /app/AKTV_NODE-linux

# 创建 AKTV 配置文件模板
RUN echo '{"ip":"${AKTV_HOST}","port":${AKTV_PORT}}' > /app/aktv_config_template.json

# 复制 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 安装 Node.js 依赖
RUN npm install

# 复制所有源代码到容器中
COPY . .

# 创建启动脚本
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'set -e' >> /app/start.sh && \
    echo 'echo "Starting script..."' >> /app/start.sh && \
    echo 'if [ "$(uname -m)" = "x86_64" ] && [ -f "/app/AKTV_NODE-linux" ] && [ "$AKTV_HOST" ] && [ "$AKTV_PORT" ]; then' >> /app/start.sh && \
    echo '    echo "Running on x86_64 with AKTV config. Configuring AKTV..."' >> /app/start.sh && \
    echo '    sed "s/\${AKTV_HOST}/$AKTV_HOST/g; s/\${AKTV_PORT}/$AKTV_PORT/g" /app/aktv_config_template.json > /app/config.json' >> /app/start.sh && \
    echo '    echo "AKTV config:"' >> /app/start.sh && \
    echo '    cat /app/config.json' >> /app/start.sh && \
    echo '    echo "Starting AKTV_NODE-linux..."' >> /app/start.sh && \
    echo '    /app/AKTV_NODE-linux > /app/aktv.log 2>&1 &' >> /app/start.sh && \
    echo '    AKTV_PID=$!' >> /app/start.sh && \
    echo '    echo "AKTV_NODE-linux started with PID $AKTV_PID"' >> /app/start.sh && \
    echo '    sleep 5' >> /app/start.sh && \
    echo '    if ! kill -0 $AKTV_PID 2>/dev/null; then' >> /app/start.sh && \
    echo '        echo "AKTV_NODE-linux failed to start. Log:"' >> /app/start.sh && \
    echo '        cat /app/aktv.log' >> /app/start.sh && \
    echo '        exit 1' >> /app/start.sh && \
    echo '    fi' >> /app/start.sh && \
    echo 'else' >> /app/start.sh && \
    echo '    echo "Not running on x86_64 or AKTV config not set. Using default AKTV source."' >> /app/start.sh && \
    echo '    export AKTV_DEFAULT_SOURCE="http://aktv.top/live.m3u"' >> /app/start.sh && \
    echo 'fi' >> /app/start.sh && \
    echo 'echo "Starting Node.js application..."' >> /app/start.sh && \
    echo 'exec node index.js' >> /app/start.sh

# 确保 start.sh 有执行权限
RUN chmod +x /app/start.sh

# 暴露端口（使用环境变量）
EXPOSE 4994 ${AKTV_PORT}

# 启动命令
CMD ["/bin/sh", "-c", "/app/start.sh"]
