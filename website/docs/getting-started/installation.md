---
sidebar_position: 2
title: "Installation"
description: "Deploy Subpolar with Docker Compose"
---

# Installation

Subpolar production deployment uses Docker Compose only.

## Quick Start

Install Docker Engine and the Docker Compose plugin, configure first-user
credentials, then start the stack:

```bash
docker compose up -d --build
```

Open `http://127.0.0.1:9119`. See
[`docs/DEPLOYMENT.md`](../../../docs/DEPLOYMENT.md) for authentication,
persistent volumes, reverse-proxy/TLS, WebSocket forwarding, upgrades, and
rollback.

## Configuration

Behavioral settings belong in `config.yaml`. Put credentials in Docker secrets
or environment injection. Do not store secrets in browser storage or project
data.

## Updates

Pull a new image and recreate containers:

```bash
docker compose pull
docker compose up -d
```

Back up the persistent volume before upgrades. To roll back, restore the
previous image tag and recreate the stack. Never run two Subpolar containers
against one data volume.
