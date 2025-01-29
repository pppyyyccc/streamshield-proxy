# StreamShield Proxy: 多源流媒体聚合代理工具

## 简介
StreamShield Proxy 2.0.0 是一个强大的多源流媒体聚合代理工具，旨在解决因 IP 限制而无法直接播放各种流媒体内容的问题。它支持多个VPS部署，形成CDN网络，为用户提供流畅的流媒体播放体验。

## 核心功能
- **多源聚合**：支持4gtv、Beesport、MyTVSuper、TheTV、AKTV等多个流媒体源
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
- 新增Adult内容支持（可选）
- 改进的SSL证书错误处理

## 快速开始

### 使用Docker Compose部署
1. 克隆仓库：
    ```bash
    git clone https://github.com/pppyyyccc/streamshield-proxy.git
    cd streamshield-proxy
    ```
2. 编辑 `.env` 文件，设置您的个人配置。
3. 启动服务：
    ```bash
    docker-compose up -d
    ```
    
### 使用Docker部署
```bash
docker run -d -p 4994:4994 --name streamshield-proxy \
    -e VPS_HOST="http://your-vps-ip:4994" \
    -e SECURITY_TOKEN="your_security_token" \
    -e DEBUG="true" \
    -e CACHE_UPDATE_INTERVAL="600000" \
    -e INCLUDE_ADULT_CONTENT="false" \
    -e CUSTOM_M3U="custom.m3u" \
    -e EXTRA_M3U_URLS="http://extra1.com/playlist,http://extra2.com/playlist" \
    --restart always \
    ppyycc/streamshield-proxy:latest

## **环境变量配置**

| **变量**                | **描述**                        |
|--------------------------|----------------------------------|
| `VPS_HOST`              | 您的VPS主机地址                 |
| `SECURITY_TOKEN`        | 安全访问令牌                    |
| `DEBUG`                 | 是否开启调试模式                |
| `CACHE_UPDATE_INTERVAL` | 缓存更新间隔（毫秒）            |
| `INCLUDE_ADULT_CONTENT` | 是否包含成人内容                |
| `CUSTOM_M3U`            | 自定义M3U文件名                 |
| `EXTRA_M3U_URLS`        | 额外的M3U URL（逗号分隔）       |

## **访问**
在您的流媒体播放器中使用以下格式的URL：
http://[您的服务器IP或域名]:[端口]/[SECURITY_TOKEN],例如http://100.100.100.100:4994/your_security_token

## **注意事项**
- 强烈建议使用HTTPS反向代理以增强安全性
- 请定期更新您的安全令牌
- 确保所有需要的端口都已开放

## **反馈与支持**
如果您在使用过程中遇到任何问题或有任何建议，请在GitHub上提交issue。

## **贡献**
欢迎提交Pull Request或提出功能建议。

## **许可证**
本项目遵循MIT开源协议。

