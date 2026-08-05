---
sidebar_position: 15
title: "Subpolar Browser Application"
description: "Workspace-first self-hosted browser application"
---

# Subpolar Browser Application

Subpolar is the browser application served by the self-hosted Docker Compose
stack. It uses the existing Hermes agent loop and JSON-RPC streaming gateway,
while moving filesystem, Git, terminal, workspace, Agent, Integration, and
scheduled-task ownership behind authenticated server APIs.

## Navigation

The shell provides New Chat, Agents, Scheduled, Apps, workspace-scoped
conversations, archived conversations, Settings, and an optional Activity
panel with Activity, Source Control, and Terminal tabs.

## Security Model

Human users authenticate through the dashboard session provider. Agents are
reusable behavior configurations, not human identities. Projects are
owner-scoped workspaces; Git providers and credentials belong in Settings →
Integrations. Project creation only references an existing provider.

Workspace roots are canonicalized and restricted to `SUBPOLAR_ALLOWED_ROOTS`.
Conversation, terminal, activity, audit, integration, Agent, and scheduled-task
metadata is owner-filtered. Browser WebSocket upgrades use authenticated
single-use tickets and same-origin checks.

## Deployment

Use [`Subpolar Docker deployment`](../docker.md). Native desktop packaging,
Electron releases, bare-host production installs, and separate cloud deployment
are not supported production paths.
