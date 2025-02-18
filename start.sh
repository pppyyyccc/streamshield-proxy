#!/bin/bash

# 检查是否已经有 .env 文件
if [ ! -f .env ]; then
    echo "未找到 .env 文件，请先复制 .env.example 并修改配置"
    exit 1
fi

# 加载环境变量
source .env

# 创建 OFIII 配置
mkdir -p ${OFIII_CONFIG_PATH}
cat > ${OFIII_CONFIG_PATH}/users.json << EOL
{
    "${OFIII_USER}": "${OFIII_EXPIRE}"
}
EOL

# 设置 OFIII 配置权限
chmod -R 755 ${OFIII_CONFIG_PATH}



# 启动服务
docker-compose up -d

# 等待服务启动
sleep 5

# 添加 Global.m3u 源到 proxy_needed/sources.txt
echo "https://raw.githubusercontent.com/YueChan/Live/refs/heads/main/Global.m3u" >> ${PROXY_CONFIG_PATH}/remote_m3u/proxy_needed/sources.txt

# 添加 OFIII 源到 no_proxy sources
echo "http://${HOST_IP}:${OFIII_PORT}/Sub?type=txt&token=${OFIII_USER}" >> ${PROXY_CONFIG_PATH}/remote_m3u/no_proxy/sources.txt

echo "服务已启动！"
echo "StreamShield 代理访问地址: ${PROXY_HOST}/${PROXY_TOKEN}""
echo "已添加以下源："
echo "1. Global.m3u 到代理源列表"
echo "2. OFIII 源到非代理源列表"
echo "3. AKTV 源到代理源列表"
