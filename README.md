# streamshield-proxy
StreamShield Proxy 是一个用于解决大陆无法直接播放来自 pixman.io 的 4gtv.m3u 文件的项目，通过个人 VPS 代理转发流量，简化了流媒体配置，目前集成了 YSP 和 4gtv。

YSP不走VPS直连。速率上下行总和为5Mbps 一天40GB左右流量。


Docker 部署
docker pull ppyycc/streamshield-proxy:latest

docker run -d -p 4994:4994 --name streamshield-proxy \
  -e CUSTOM_DOMAIN="http://aa.aa:port" \
  -e VPS_HOST="http://your-custom-vps-host.com:port" \
  --restart always streamshield-proxy
  
  解释
CUSTOM_DOMAIN="http://aa.aa:port" #pixman安装完的URL 可以是http 也可以是https 可以是ip地址也可以是域名，例如http://1.1.1.1:5000或者自己反代完的https://bb.bb.bb

VPS_HOST="https://your-custom-vps-host.com"#你自己VPS想用的URL 可以是http 也可以是https 可以是ip地址也可以是域名，例如http://2.2.2.2:4994或者自己反代完的https://cc.cc.cc

StreamShield Proxy

Overview

StreamShield Proxy is designed to address the issue of inaccessibility to 4gtv.m3u files obtained from pixman.io within mainland China. Due to restrictions, direct playback is not possible, and even leveraging Cloudflare's free tier for proxying TS files is insufficient. As a result, this project utilizes a personal VPS to proxy and forward the necessary traffic, offering a simpler alternative to O11 for streaming configurations.


Features


Proxy for 4gtv.m3u: Facilitates access to 4gtv.m3u files that are otherwise inaccessible in mainland China.

Integration with YSP: Initially integrates with YSP for broader content access.

Simplified Configuration: Offers a straightforward setup compared to alternative streaming solutions.


Current Status

The first version of this project currently aggregates content from YSP and 4gtv. Additional integrations are on hold as they are not currently needed by the maintainer.


Community and Support

For further discussions, troubleshooting, or community engagement, please join our Telegram group at https://t.me/livednowgroup.


Contribution

Contributions, issues, and feature requests are welcome! Feel free to check issues page if you want to contribute.


License

This project is MIT licensed.
