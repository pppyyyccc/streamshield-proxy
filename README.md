# StreamShield Proxy

## 概述

StreamShield Proxy 是一个旨在解决中国大陆无法直接播放来自 pixman.io 的 4gtv.m3u 文件的项目。由于存在限制，即使利用 Cloudflare 的免费层来代理 TS 文件也不够。因此，该项目使用个人 VPS（比如义父甲骨文的ARM机） 来代理和转发所需的流量，从而简化了流媒体配置过程，相比其他解决方案更加简单。

## 功能

- **代理 4gtv.m3u**：使得在中国大陆可以访问原本无法访问的 4gtv.m3u 文件。
- **集成 YSP**：最初集成了 YSP，以扩大内容访问范围。
- **简化配置**：提供了一个简单的设置过程，使得配置流媒体解决方案更加容易。
- **支持arm64和amd64


## 当前状态

该项目的第一版目前集成了 YSP 和 4gtv 的内容。进一步的集成暂时搁置，因为目前维护者不需要这些功能。

## 部署

### Docker 部署

要使用 Docker 部署 StreamShield Proxy，请按照以下步骤操作：

1. **拉取 Docker 镜像**：

   docker pull ppyycc/streamshield-proxy:latest

## 运行 Docker 容器

docker run -d -p 4994:4994 --name streamshield-proxy \
-e CUSTOM_DOMAIN="http://aa.aa:port" \
-e VPS_HOST="http://your-custom-vps-host.com:port" \
--restart always streamshield-proxy

## 环境变量


CUSTOM_DOMAIN：pixman 安装的 URL（不包括 m3u 扩展名，因为它已经聚合了 YSP 和 4GTV）。可以是 HTTP 或 HTTPS，可以是 IP 地址或域名。

示例：http://1.1.1.1:5000 或 https://bb.bb.bb



VPS_HOST：你的 VPS 的 URL。也可以是 HTTP 或 HTTPS，可以是 IP 地址或域名。

示例：http://2.2.2.2:4994 或 https://cc.cc.cc




## 部署示例


### 使用 IP 地址：
docker run -d -p 8888:4994 --name streamshield-proxy \
-e CUSTOM_DOMAIN="http://100.100.100.100:5000" \
-e VPS_HOST="http://200.200.200.200:8888" \
--restart always streamshield-proxy


### 使用域名和 HTTPS：
docker run -d -p 444:4994 --name streamshield-proxy \
-e CUSTOM_DOMAIN="https://pixman.aaaa.com" \
-e VPS_HOST="https://iptv.bbbb.com" \
--restart always streamshield-proxy

## 终端配置

比如在TVBOX之类的直播配置中填入https://iptv.bbbb.com或者http://200.200.200.200:8888便能聚合播放YSP和4GTV的流媒体

## 社区和支持

如有关于进一步讨论、故障排除或社区参与的需求，请加入Pixman的 Telegram 群组：https://t.me/livednowgroup。


## 贡献

欢迎贡献、提出问题和功能请求！如果您想贡献，请查看 问题页面。


## 许可证

本项目采用 MIT 许可证。
```
