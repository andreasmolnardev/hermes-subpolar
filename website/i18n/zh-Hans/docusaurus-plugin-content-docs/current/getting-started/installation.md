---
sidebar_position: 2
title: "安装"
description: "使用 Docker Compose 部署 Subpolar"
---

# 安装

Subpolar 生产环境仅支持 Docker Compose。

## 快速开始

安装 Docker Engine 和 Docker Compose 插件，配置首个用户认证，然后启动：

```bash
docker compose up -d --build
```

打开 `http://127.0.0.1:9119`。认证、持久化卷、反向代理、WebSocket、升级和回滚说明见部署指南。

## 更新

```bash
docker compose pull
docker compose up -d
```

升级前备份持久化卷。回滚时恢复旧镜像标签并重新创建容器；不要让两个
Subpolar 容器同时使用同一个数据卷。
