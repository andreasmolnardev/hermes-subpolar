# Hermes Subpolar

> **Workspace-first AI development environment built on Hermes Agent.**

Hermes Subpolar transforms Hermes Agent into a graphical, self-hostable AI development environment. Rather than centering everything around conversations, Subpolar introduces persistent workspaces, reusable agents, integrated developer tooling, transparent execution, and project organization while continuing to leverage the proven Hermes runtime.

Whether running locally or as a Docker deployment in your homelab, Subpolar aims to provide an environment where humans and AI collaborate inside the same workspace rather than through an isolated chat window.

---

# Philosophy

Everything in Subpolar is built around four guiding principles.

## Isolation

Every task should execute inside a well-defined environment.

Users shouldn't have to wonder which files, terminals or repositories an agent can access. Context should be explicit instead of inferred.

### Implementation

* Persistent Workspaces
* Agent Profiles
* Project Organization
* Explicit Permissions
* Workspace-specific resources
* Independent conversations

---

## Transparency

AI should never behave like a black box.

Users should always be able to understand what happened, why it happened and how long it took.

### Implementation

* Activity Panel
* Thinking timeline
* Tool execution log
* Sub-agent visualization
* Execution durations
* Integrated Source Control
* Explain Changes
* Persistent terminals

---

## Extensibility

Nothing should depend on one model, one protocol or one provider.

Every component should be replaceable.

### Implementation

* Multiple LLM providers
* MCP support
* OpenAPI integrations
* Native integrations
* Skills
* First-party Apps
* Modular providers
* Workspace integrations

---

## Human-first

AI should augment developers—not replace them.

The interface should remain useful even when no AI is running.

### Implementation

* Browsable repositories
* Manual Source Control
* Integrated terminals
* Workspace management
* Project management
* Tool management
* Human-accessible applications

---

# What makes Hermes Subpolar different?

Unlike traditional coding agents, Subpolar combines conversations with persistent developer environments.

Instead of opening a chat and giving an AI temporary access to a directory, users work inside persistent workspaces that contain repositories, terminals, browser sessions, agents and tools.

Conversations become one way of interacting with the workspace rather than the workspace itself.

---

# Features

## Workspace-first Architecture

Every conversation belongs to a workspace.

A workspace contains:

* Files
* Git repositories
* Persistent terminals
* Browser sessions
* Installed tools
* Workspace configuration
* Conversations
* Scheduled tasks

Changing workspaces changes the execution environment.

---

## Reusable Agent Profiles

Agents define **who** performs work.

Each agent contains:

* Instructions
* Skills
* Tool permissions
* Default model
* Behaviour
* System prompt
* Permission defaults

Agents can be reused across conversations and workspaces.

---

## Transparent Activity Panel

Every execution is visible.

The Activity Panel displays:

* Thinking
* Planning
* Tool calls
* Browser automation
* Searches
* Git operations
* File modifications
* Sub-agent execution
* Execution durations

Nothing happens invisibly.

---

## Integrated Source Control

Every workspace includes Git integration.

Features include:

* Changed files
* Staging
* Commits
* Branch management
* Repository status

Without leaving the application.

---

## Persistent Terminals

Workspaces own terminals.

Unlike temporary shells created during prompts, terminals remain available across conversations.

Users and agents can both reuse them.

---

## Scheduled Tasks

Agents can execute automatically.

Examples include:

* Daily summaries
* Repository maintenance
* Documentation updates
* Scheduled research
* Monitoring tasks

Each task selects:

* Workspace
* Agent
* Permissions
* Schedule
* Instructions

---

## Apps

Subpolar supports first-party applications built on the same platform.

Applications reuse:

* Authentication
* Workspaces
* Agents
* Tools
* Themes

Future applications can extend the platform without becoming separate systems.

---

## Open Tool Ecosystem

Tools are provider-independent.

Supported integrations include:

* MCP Servers
* OpenAPI services
* Native integrations
* Future provider types

Regardless of implementation, every tool is presented through a common interface.

---

## Model Agnostic

Choose whichever LLM best fits the task.

Supported providers include:

* OpenAI
* Anthropic
* Google
* OpenRouter
* Ollama
* Local models
* Hermes-supported providers

Changing models never requires changing agents or workspaces.

---

## Docker-first Deployment

Subpolar is designed to run equally well:

* Locally
* On workstations
* Inside Docker
* On home servers
* On VPS deployments

Persistent workspaces make remote deployments practical while preserving a desktop-like experience.

---

# Architecture

Subpolar extends Hermes rather than replacing it.

```
                 ┌─────────────────────┐
                 │     User Interface  │
                 │ Desktop / Web / App │
                 └──────────┬──────────┘
                            │
                   Workspace Layer
                            │
        ┌──────────────┬──────────────┐
        │              │              │
     Projects       Agents        Conversations
        │              │              │
        └──────────────┴──────────────┘
                            │
                   Hermes Agent Runtime
                            │
      ┌───────────┬──────────┬───────────┐
      │           │          │           │
   Models      Tools      Skills     Memory
```

Hermes continues to provide the execution engine while Subpolar provides the workspace-centric experience surrounding it.

---

# Getting Started

```bash
git clone https://github.com/<your-org>/hermes-subpolar
cd hermes-subpolar

# Install dependencies
...

# Start desktop
...

# Or run with Docker
docker compose up
```

> Installation instructions will evolve alongside the project.

---

# Screens

The desktop application currently consists of:

* Conversation
* New Chat
* Agents
* Scheduled Tasks
* Apps
* Project Creation
* Project Group Creation

Every screen shares a common application shell consisting of:

* Navigation Sidebar
* Workspace Selector
* Main Content Area
* Optional Activity Panel

---

# Roadmap

Current focus:

* Hermes Desktop foundation
* Workspace management
* Agent management
* Activity Panel
* Persistent terminals
* Source Control integration
* Project organization

Future plans include:

* Rich first-party Apps
* Collaborative workspaces
* Workspace templates
* Additional tool providers
* Advanced automation
* Multi-user deployments

---

# Contributing

Contributions are welcome.

Areas of particular interest include:

* Desktop development
* React
* TypeScript
* Agent UX
* Docker
* MCP integrations
* OpenAPI tooling
* Workspace management

Please open an issue before beginning larger architectural changes.

---

# License

Hermes Subpolar inherits the licensing of the underlying Hermes Agent project unless otherwise specified.

See the project's `LICENSE` file for details.

---

# Acknowledgements

Hermes Subpolar is built upon the excellent work of the **Hermes Agent** project by **Nous Research**.

The goal of this project is not to replace Hermes, but to extend it with a workspace-first graphical interface, developer tooling, and a transparent user experience while remaining compatible with the Hermes ecosystem.
