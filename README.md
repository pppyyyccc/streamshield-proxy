# StreamShield Proxy

## 概述

StreamShield Proxy 是一个旨在解决由于IP问题无法直接播放来自 pixman.io 的 4gtv.m3u 等文件的项目。Cloudflare 的免费版也不能代理 TS流文件。因此，该项目使用个人 VPS（比如甲骨文的ARM机） 来代理和转发所需的流量，从而简化了流媒体配置过程，相比其他解决方案尤其家里没有卵路由环境或者不方便安装环境配置更简单。

## 功能

- **代理 4gtv.m3u Beesport.m3u mytvsuper.m3u**：使得在中国大陆可以访问原本无法访问的 四季和MytvSuper文件。如希望正常收看MytvSuper，请自行在pixman docker内配置添加token。
- **集成 央视屏 中国移动 iTV 蜀小果 江苏移动魔百盒 TPTV**：集成了央视屏 中国移动 iTV 蜀小果 江苏移动魔百盒，以扩大内容访问范围。
- **安全设置**：新增安全token，防止被扫描到白嫖。
- **简化配置**：提供了一个简单的设置过程，使得配置流媒体解决方案更加容易。
- 支持arm64和amd64。


## 当前状态

该项目的最新版基本集成了Pixman大部分的频道除了youtube。

由于Mytvsuper使用mpd加密连接，连接过程比较繁琐，每一次iptv换台需要四倍于4gtv的时间，所以换台比较慢。

Android环境下需使用https://github.com/FongMi/Release/raw/fongmi/apk/dev/mobile-python-armeabi_v7a.apk 支持mpd加密播放。

## 部署

### Docker 部署

要使用 Docker 部署 StreamShield Proxy，请按照以下步骤操作：

0. **拉取 Pixman Docker 镜像**：

https://pixman.io/topics/17

1. **拉取 代理Docker 镜像**：

   docker pull ppyycc/streamshield-proxy:latest

2. **更新mytvsuper_tivimate.m3u 文件**：

   **每天更新mytvsuper m3u**：由于使用的是mytvsuper_tivimate.m3u作为源，所以需要在运行pixman docker的机器上自动更新此文件，下面命令每天早晚五点自动更新 mytvsuper_tivimate.m3u 文件
 
  (crontab -l 2>/dev/null | grep -v "docker exec pixman sh -c 'flask mytvsuper_tivimate'"; echo "0 5,17 * * * docker exec pixman sh -c 'flask mytvsuper_tivimate'") | crontab -

或者自己手动加入crontab,详见https://pixman.io/topics/17

  新增是否要导入mytvsuper_tivimate.m3u开关

## 运行 Docker 容器

docker run -d -p 4994:4994 --name streamshield-proxy \
-e CUSTOM_DOMAIN="http://aa.aa:port" \
-e VPS_HOST="http://your-custom-vps-host.com:port" \
-e SECURITY_TOKEN="testtoken" \
-e INCLUDE_MYTVSUPER="true" \
--restart always \
ppyycc/streamshield-proxy:latest

## 环境变量


CUSTOM_DOMAIN：pixman 安装的 URL（不包括 m3u 扩展名，因为它已经聚合了 YSP 和 4GTV）。可以是 HTTP 或 HTTPS，可以是 IP 地址或域名。

示例：http://1.1.1.1:5000 或 https://bb.bb.bb



VPS_HOST：你的 VPS 的 URL。也可以是 HTTP 或 HTTPS，可以是 IP 地址或域名。

示例：http://2.2.2.2:4994 或 https://cc.cc.cc

INCLUDE_MYTVSUPER="true" 是否要增加导入mytvsuper_tivimate.m3u， 不写这个值默认不导入


DEBUG="true"  是否要开启DEBUG， 不写这个值默认不开启

## 部署示例


### 使用 IP 地址：
docker pull ppyycc/streamshield-proxy:latest

docker run -d -p 8888:4994 --name streamshield-proxy \
-e CUSTOM_DOMAIN="http://100.100.100.100:5000" \
-e VPS_HOST="http://200.200.200.200:8888" \
-e SECURITY_TOKEN="test11" \
-e INCLUDE_MYTVSUPER="true" \ 
--restart always \
ppyycc/streamshield-proxy:latest

你的访问地址是http://200.200.200.200:8888/test11 并且导入mytvsuper_tivimate.m3u

### 使用域名和 HTTPS：
docker pull ppyycc/streamshield-proxy:latest

docker run -d -p 444:4994 --name streamshield-proxy \
-e CUSTOM_DOMAIN="https://pixman.aaaa.com" \
-e VPS_HOST="https://iptv.bbbb.com" \
-e SECURITY_TOKEN="test222" \
--restart always \
ppyycc/streamshield-proxy:latest

你的访问地址是https://iptv.bbbb.com/test222 默认没有mytvsuper频道列表

## 终端配置

比如在TVBOX之类的直播配置中填入https://iptv.bbbb.com/testtoken 或者 http://200.200.200.200:8888/testtoken 便能播放聚合流媒体

## 社区和支持

如有关于进一步讨论、故障排除或社区参与的需求，请加入Pixman的 Telegram 群组：https://t.me/livednowgroup


## 贡献

欢迎贡献、提出问题和功能请求！如果您想贡献，请查看 问题页面。


## 许可证

本项目采用 MIT 许可证。
```
