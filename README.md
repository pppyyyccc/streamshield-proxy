# StreamShield Proxy: 无缝流媒体播放解决方案

## 项目简介

StreamShield Proxy 目的解决因 IP 限制而无法直接播放 pixman.io 的 4gtv.m3u 等流媒体文件的问题。Cloudflare 免费版的流媒体代理功能缺失以及封号危险，因此此项目利用个人 VPS（例如甲骨文的 ARM 服务器）作为代理，流畅转发所需流量，显著简化了流媒体播放的配置流程，尤其适用于家中无便捷路由或难以安装复杂配置环境的用户。

## 核心功能

- **智能代理：4gtv.m3u、Beesport.m3u、mytvsuper.m3u**
  在 IP 受到限制的情况下，依然能够流畅播放四季与 MytvSuper。欲流畅观看 MytvSuper，需自行在 pixman Docker 环境下配置对应的凭证。
- **内容聚合：央视屏、中国移动 iTV、蜀小果、江苏移动魔百盒、TPTV**（直连）
  集聚各类热门内容，如央视节目、中国移动 iTV、蜀小果、江苏移动魔百盒等，拓宽内容访问范围。
- **加固安全：新增安全 token**
- 有效防止服务被未授权扫描利用。
- **简化安装：轻松配置流媒体系统**
  提供直观便捷的流媒体配置流程，极大降低了部署难度。
- **兼容性优化**
  支持 arm64 和 amd64 架构。

## 发展现状

最新版 StreamShield Proxy 已集成绝大部分 Pixman 渠道，除了 YouTube。

由于 Mytvsuper 使用 mpd 加密技术进行连接，导致每次 IPTV 换台所耗费的时间约为 4gtv 的四倍，加重了换台等待感。

在 Android 环境下，需依赖 [https://github.com/FongMi/Release/tree/fongmi/apk/release](https://github.com/FongMi/Release/tree/fongmi/apk/release) 支持 mpd 加密解码播放。

## Docker 部署指引

1. **预置** Pixman Docker 镜像：

   [https://pixman.io/topics/17](https://pixman.io/topics/17)

2. **加载** StreamShield Docker 镜像：

   ```bash
   docker pull ppyycc/streamshield-proxy:latest

设置定时更新 mytvsuper_tivimate.m3u 文件：
为自动化运行，每日早晚执行更新。或遵循 https://pixman.io/topics/17 手动调整。
(crontab -l 2&gt;/dev/null | grep -v "docker exec pixman sh -c 'flask mytvsuper_tivimate'"; echo "0 5,17 * * * docker exec pixman sh -c 'flask mytvsuper_tivimate'") | crontab -



## 启动 Docker 容器

bash
Copy Code
docker run -d -p 4994:4994 --name streamshield-proxy \
-e CUSTOM_DOMAIN="http://aa.aa:port" \
-e VPS_HOST="http://your-custom-vps-host.com:port" \
-e SECURITY_TOKEN="testtoken" \
-e INCLUDE_MYTVSUPER="true" \
--restart always \
ppyycc/streamshield-proxy:latest

## 定制环境变量

变量	描述
CUSTOM_DOMAIN	已运行pixman docker的URL，不需附带 m3u 后缀，已包含 YSP 和 4GTV 等聚合。示例：http://1.1.1.1:5000 或 https://bb.bb.bb。

VPS_HOST	个人的 VPS HOST，支持 HTTP/HTTPS，可以是 IP 地址或定制域名。示例：http://2.2.2.2:4994 或 https://cc.cc.cc

INCLUDE_MYTVSUPER="true"	是否启用 mytvsuper_tivimate.m3u 渠道加载，缺省不加载。

DEBUG="true"  是否要开启DEBUG， 不写这个值默认不开启




## 部署案例

仅使用 IP 地址部署：


docker pull ppyycc/streamshield-proxy:latest
docker run -d -p 8888:4994 --name streamshield-proxy \
-e CUSTOM_DOMAIN="http://100.100.100.100:5000" \
-e VPS_HOST="http://200.200.200.200:8888" \
-e SECURITY_TOKEN="test11" \
-e INCLUDE_MYTVSUPER="true" \
--restart always \
ppyycc/streamshield-proxy:latest
访问地址：http://200.200.200.200:8888/test11，并已自动导入 mytvsuper_tivimate.m3u。


搭配域名和 HTTPS 部署：

bash
Copy Code
docker pull ppyycc/streamshield-proxy:latest
docker run -d -p 444:4994 --name streamshield-proxy \
-e CUSTOM_DOMAIN="https://pixman.aaaa.com" \
-e VPS_HOST="https://iptv.bbbb.com" \
-e SECURITY_TOKEN="test222" \
--restart always \
ppyycc/streamshield-proxy:latest
访问地址：https://iptv.bbbb.com/test222，默认不包含 mytvsuper 频道清单。


## 媒体终端配置

在直播配置中，如 影视，只需填入 https://iptv.bbbb.com/testtoken 或 http://200.200.200.200:8888/testtoken 即可实现流媒体播放。


## 社区互动与支持

更多详情、问题解决或加群探讨，敬请加入 Pixman 的 Telegram 群组：https://t.me/livednowgroup。


## 项目贡献

欢迎代码提交、提出功能需求与错误汇报！有意向贡献者，请访问 问题页面，参与共建。


## 使用协议

本项目遵循 MIT 开源协议。
```
