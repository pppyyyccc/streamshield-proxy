# StreamShield Proxy: 多源流媒体聚合代理工具

## 简介
StreamShield Proxy 2.0.0 是一个强大的多源流媒体聚合代理工具，旨在解决因 IP 限制而无法直接播放各种流媒体内容的问题。它支持多个VPS部署，形成CDN网络，为用户提供流畅的流媒体播放体验。

## 核心功能
- **多源聚合**：支持本地和远端url等多个流媒体源聚合
- **智能代理**：自动处理需要代理的内容
- **内容定制**：支持移除tv-logo、修改group-title等自定义操作
- **安全加固**：集成安全token机制
- **灵活配置**：通过环境变量实现灵活配置
- **高效缓存**：使用LRU缓存优化性能
- **跨平台支持**：支持arm64和amd64架构

## 新版本特性 (2.0.0)
- 全新的多源聚合机制
- 优化的缓存系统，提高响应速度
- 增强的错误处理和日志记录
- 支持对特定源的内容进行自定义修改

## 快速开始

### 使用Docker Compose部署
1. 克隆仓库：
    ```bash
    git clone https://github.com/pppyyyccc/streamshield-proxy.git
    cd streamshield-proxy
    ```
2. 编辑 `.env` 文件，设置您的个人配置。
    ```bash
       nano .env
    ```
3. 启动服务：
    ```bash
       chmod +x start.sh
       ./start.sh
    ```
    
### 使用Docker部署
```bash
docker run -d -p 4994:4994 --name streamshield-proxy \
    -e VPS_HOST="http://your-vps-ip/host:4994" \
    -e SECURITY_TOKEN="your_security_token" \
    -e DEBUG="true" \
    --restart always \
    ppyycc/streamshield-proxy:latest
```
## 环境变量配置

| 变量                  | 描述                                |
|-----------------------|-------------------------------------|
| `VPS_HOST`            | 您的VPS主机地址                    |
| `SECURITY_TOKEN`      | 安全访问令牌                       |
| `DEBUG`               | 是否开启调试模式                   |
| `USE_DEFAULT_SOURCES=false`|是否启用内部的默认AKTV源       |

## 本地持久化文件夹结构


```bash
config/
├── proxy_hosts/
│ ├── default.txt # 默认代理 hosts 列表 (默认创建，每次升级会覆盖)
│ └── user_defined.txt # 用户自定义代理 hosts 列表 (预创建，用户编辑，升级不会覆盖)
├── remote_m3u/
│ ├── no_proxy/
│ │ ├── default_sources.txt # 默认非代理 M3U 源列表 (默认创建，每次升级会覆盖)
│ │ └── sources.txt # 用户自定义非代理 M3U 源列表 (预创建，用户编辑，升级不会覆盖)
│ └── proxy_needed/
│ └── sources.txt # 用户自定义代理 M3U 源列表 (预创建，用户编辑，升级不会覆盖)
├── local_m3u/
│ ├── no_proxy/
│ │ └── user_m3u.m3u # 用户本地非代理 M3U 文件 (用户手动添加，文件名随便取，后缀支持m3u和txt)
│ └── proxy_needed/
│ └── user_m3u.m3u # 用户本地代理 M3U 文件 (用户手动添加，文件名随便取，后缀支持m3u和txt)
└── generated/
└── all.m3u # 聚合的 M3U 文件 (程序自动生成)
```

##  使用说明

1. 用户可以在 \`user_defined.txt\` 中添加自定义的需要代理的hosts，一行一条。
2. 在 \`remote_m3u/no_proxy/sources.txt\` 和 \`remote_m3u/proxy_needed/sources.txt\` 中添加远程 M3U 源。
3. 用户可以在 \`local_m3u\` 文件夹中添加本地 M3U 文件。
4. \`generated/all.m3u\` 是程序自动生成的聚合 M3U 文件，请勿手动编辑。

注意：除了 \`default.txt\` 和 \`default_sources.txt\`，其他文件在升级时不会被覆盖。" >

## 访问
在您的流媒体播放器中使用以下格式的URL：
http://[您的服务器IP或域名]:[端口]/[SECURITY_TOKEN],例如http://100.100.100.100:4994/your_security_token

## 注意事项
- 强烈建议使用HTTPS反向代理以增强安全性
- 请定期更新您的安全令牌
- 确保所有需要的端口都已开放

## 反馈与支持
如果您在使用过程中遇到任何问题或有任何建议，请在GitHub上提交issue。

## 贡献
欢迎提交Pull Request或提出功能建议。

## 许可证
本项目遵循MIT开源协议。
