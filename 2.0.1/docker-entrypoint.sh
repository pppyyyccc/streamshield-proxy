#!/bin/sh
set -e

# 创建必要的目录结构
mkdir -p /app/config/proxy_hosts \
         /app/config/remote_m3u/no_proxy \
         /app/config/remote_m3u/proxy_needed \
         /app/config/local_m3u/no_proxy \
         /app/config/local_m3u/proxy_needed \
         /app/config/generated

# Nginx 配置
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
ln -sf /dev/stdout /var/log/nginx/access.log
ln -sf /dev/stderr /var/log/nginx/error.log

# 添加默认的代理 host 列表（每次都会覆盖）
echo "hinet.net
googlevideo.com
tvb.com
livednow.com
orz-7.com
4gtv.tv
ofiii.com
youtube.com
mytvsuper.com
beesport.livednow.com
thetvapp.to
pki.goog
thetv-ts.wx.sb
digicert.com
aktv.top
v2h-cdn.com
88.212.7.11
5f22d76e220e1.streamlock.net
38.64.72.148
ntdfreevcpc-tgc.cdn.hinet.net
bk.msbot.us.kg
live-gbnews.simplestreamcdn.com
moveonjoy.com
freetv.fun
cloudfront.net
live-hls-web-aje.getaj.net
fox-foxnewsnow-samsungus.amagi.tv
nmxlive.akamaized.net
mediatailor.us-east-1.amazonaws.com
tsv2.amagi.tv
appletree-mytimeau-samsung.amagi.tv
bcovlive-a.akamaihd.net
rt-rtd.rttv.com
amagi.tv
143.244.60.30:80
143.244.60.30" > /app/config/proxy_hosts/default.txt

# 添加默认的远程 M3U 源（每次都会覆盖）
echo "https://raw.githubusercontent.com/btjson/TVB/refs/heads/main/Aktv.m3u" > /app/config/remote_m3u/proxy_needed/default_sources.txt

# 创建用户自定义文件（如果不存在）
touch_if_not_exists() {
    if [ ! -f "$1" ]; then
        touch "$1"
        echo "Created empty file: $1"
    fi
}

touch_if_not_exists /app/config/proxy_hosts/user_defined.txt
touch_if_not_exists /app/config/remote_m3u/no_proxy/sources.txt
touch_if_not_exists /app/config/remote_m3u/proxy_needed/sources.txt

# 检查本地 M3U 目录是否为空，如果为空则创建示例文件
check_and_create_example() {
    if [ -z "$(ls -A $1)" ]; then
        echo "#EXTM3U
#EXTINF:-1,Example Channel
http://example.com/stream.m3u8" > "$1/example.m3u"
        echo "Created example M3U file in: $1"
    fi
}

check_and_create_example /app/config/local_m3u/no_proxy
check_and_create_example /app/config/local_m3u/proxy_needed

# 确保 generated 目录存在但为空
rm -rf /app/config/generated/*
mkdir -p /app/config/generated

# 设置正确的权限
chown -R node:node /app/config

# 执行传递给脚本的命令（通常是启动 Node.js 应用）
exec "$@"
