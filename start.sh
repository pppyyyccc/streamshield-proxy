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

GLOBAL_M3U_URL="https://raw.githubusercontent.com/YueChan/Live/refs/heads/main/Global.m3u"
OFIII_SOURCE_URL="http://${HOST_IP}:${OFIII_PORT}/Sub?type=txt&token=${OFIII_USER}"

# 添加 Global.m3u 源到 proxy_needed/sources.txt
if ! grep -q "${GLOBAL_M3U_URL}" "${PROXY_CONFIG_PATH}/remote_m3u/proxy_needed/sources.txt"; then
    echo "${GLOBAL_M3U_URL}" >> "${PROXY_CONFIG_PATH}/remote_m3u/proxy_needed/sources.txt"
    echo -e "\033[36m已添加 Global.m3u 到代理源列表\033[0m"
else
    echo -e "\033[33mGlobal.m3u 已存在于代理源列表，跳过添加\033[0m"
fi

# 添加 OFIII 源到 no_proxy sources
if ! grep -q "${OFIII_SOURCE_URL}" "${PROXY_CONFIG_PATH}/remote_m3u/no_proxy/sources.txt"; then
    echo "${OFIII_SOURCE_URL}" >> "${PROXY_CONFIG_PATH}/remote_m3u/no_proxy/sources.txt"
    echo -e "\033[36m已添加 OFIII 源到非代理源列表\033[0m"
else
    echo -e "\033[33mOFIII 源已存在于非代理源列表，跳过添加\033[0m"
fi


# 以优雅的颜色显示信息
echo -e "\033[36m服务已启动！\033[0m"
echo -e "\033[36mStreamShield 代理访问地址: ${PROXY_HOST}/${PROXY_TOKEN}\033[0m"

