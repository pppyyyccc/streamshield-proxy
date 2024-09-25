#!/bin/sh

# 设置要抓取的 URL
URL="https://example.com/source_m3u_url"

# 下载 M3U 文件并进行简单处理
curl -s "$URL" | sed 's/example\.com/mytvfree.com/g' > /usr/src/app/mytvfree.m3u

# 记录日志
echo "$(date): M3U file updated" >> /var/log/cron.log
