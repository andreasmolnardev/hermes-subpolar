---
sidebar_position: 7
title: "Subpolar Docker 部署"
description: "使用 Docker Compose 运行自托管 Subpolar"
---

# Subpolar Docker 部署

Docker 和 Docker Compose 是唯一支持的生产部署方式。规范栈使用一个由
s6 管理的容器，同时提供 Subpolar 浏览器界面和 Hermes gateway。

## 首次启动

设置密码哈希和稳定的会话签名密钥，然后启动 Compose：

```sh
export HERMES_DASHBOARD_BASIC_AUTH_USERNAME=admin
export HERMES_DASHBOARD_BASIC_AUTH_PASSWORD_HASH='scrypt$...'
export HERMES_DASHBOARD_BASIC_AUTH_SECRET="$(openssl rand -hex 32)"
docker compose up -d --build
```

打开 `http://127.0.0.1:9119`。Compose 创建持久化卷 `subpolar_data`，用于
配置、凭据、工作区、会话、计划任务、终端和审计记录。

不要使用 `--insecure`、分离的 gateway/dashboard 容器、host networking，或
让两个容器同时使用同一个卷。

## 反向代理

在反向代理终止 TLS，并转发 `Host`、`X-Forwarded-Host`、
`X-Forwarded-Proto`、`X-Forwarded-Prefix`。为 `/api/ws`、`/api/pty`、
`/api/events`、`/api/pub` 和 `/api/subpolar/terminals/ws` 转发 WebSocket
升级请求。无法信任转发头时设置 `HERMES_DASHBOARD_PUBLIC_URL`。

## 健康检查和升级

```sh
docker compose config
docker compose build
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:9119/api/health
```

升级前备份 `subpolar_data`。回滚时恢复旧镜像并再次运行
`docker compose up -d`，保留持久化卷。
