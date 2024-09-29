FROM golang:1.19-alpine

# 安装必要的系统依赖
RUN apk add --no-cache python3 py3-pip dcron

# 设置工作目录
WORKDIR /app

# 复制 Go 源代码和 Python 脚本
COPY *.go .
COPY convert_mytvfree.py .
COPY crontab /etc/cron.d/mytvfree-cron

# 设置 crontab
RUN chmod 0644 /etc/cron.d/mytvfree-cron
RUN crontab /etc/cron.d/mytvfree-cron

# 初始化 Go 模块并下载依赖
RUN go mod init myapp
RUN go get github.com/gin-gonic/gin
RUN go get github.com/patrickmn/go-cache
RUN go mod tidy

# 构建 Go 应用
RUN go build -o /app/app

# 安装 Python 依赖
RUN pip3 install --no-cache-dir requests

# 设置环境变量
ENV CUSTOM_DOMAIN=default-domain.com
ENV SECURITY_TOKEN=test123
ENV VPS_HOST=
ENV INCLUDE_MYTVSUPER=true
ENV DEBUG=true
ENV chinam3u=true
ENV CUSTOM_M3U=
ENV CUSTOM_M3U_PROXY=true
ENV CUSTOM_M3U_PROXY_HOST=
ENV PORT=4994

# 创建日志文件
RUN touch /var/log/cron.log

# 运行应用
CMD sh -c "python3 /app/convert_mytvfree.py && crond && /app/app"
