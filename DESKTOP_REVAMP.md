# Subpolar UI Screen Specification (Hermes Fork)
Web ui as only remaining ui. Remove tui and desktop app.

## Shared Layout

All primary application screens share the same hermes desktopshell.

### Left Sidebar

The sidebar is persistent and provides navigation.

#### Top navigation

-   **+ New Chat** (plus icon)
-   **Agents** (robot head icon)
-   **Scheduled** (clock icon)
-   **Apps** (grid/apps icon)

--- Separator ---

#### Workspace selector

A dropdown showing the currently selected workspace. It lists
**workspaces** and project groups (which are selections of multiple workspaces).

To its right: - **New Project / Project Group** (folder with plus icon)

#### Conversation list

Shows conversations belonging to the selected workspace.

Each conversation displays: - status indicator - title - optional
metadata (agent, unread state, etc.)

#### Archived Conversations

Shows conversations that have been archived.
They only show the session title as well as their workspace as a badge component.

#### Bottom

-   **Settings** (gear icon)

------------------------------------------------------------------------

## Conversation Screen

### Purpose

Primary working interface with an AI agent.

### Layout

Left: - Shared Sidebar

Center: - Conversation history - User and assistant messages - Explain
Changes action - Composer - Workspace selector - Agent selector - Model
selector - Permission selector - Attachment button

Conversation history with realtime diff streaming. shows thinking as 'working...' until final message is generated. also shows diffviews:
### Inline Change Reviews

Whenever an agent modifies one or more files, the conversation displays inline diff views directly within the message stream.

Each change block includes:

- File name
- Change summary
- Unified or split diff view
- Syntax highlighting
- Added and removed lines
- Collapsible unchanged sections
- Expand to full file
- Explain Changes action

Multiple files are grouped together when they belong to the same task.

This allows users to review modifications in context without leaving the conversation.

Right: - Activity Panel

### Activity Panel

A tabbed sidebar.

Tabs:

#### Activity

Chronological execution log.

Shows: - Thinking - Planning - Tool calls - Browser automation - Git
operations - Searches - Sub-agent activity - Completion

Each entry displays duration.

Each activity entry may reference generated artifacts, including:

- File edits
- Terminal output
- Browser actions
- Search results
- Generated images
- Diff reviews

Selecting a file edit opens the corresponding inline diff within the conversation.

#### Source Control

Equivalent to VS Code's Source Control view.

Shows: - changed files - staged files - commit UI (enter commit message or option (icon button) to generate a commit message, using the 'internal' model which can be selected in settings) - branch information

#### Terminal

Supports multiple terminals. Different terminals are shown as separate tabs. They can be renamed and dragged around.

Each terminal: - persists - may continue running after prompts - belongs
to the active workspace

The Activity Panel exists to expose what the model is actually doing
instead of hiding execution.

------------------------------------------------------------------------

## New Chat Screen

### Purpose

Create a new conversation.

### Layout

Shared Sidebar

Center: - "What do you want to work on?" with folder plus icon to its right, which opens a popover to select a workspace - Suggested prompt cards (empty section for now) - Chat input bar

Bottom context bar: - Workspace - Agent - Model - Permissions -
Attachment

Temporary mode may also be enabled.

### Chat input bar
Purpose

the primary interaction surface between the user and the selected agent. Rather than simply sending text, it allows the user to configure the entire execution context of a request before submitting it.

It combines message input, execution settings, and attachments into a single, compact component that remains consistent across new and existing conversations.

Layout

The Prompt Bar is located at the bottom of the conversation view (as well as in new chat screen) and consists of two logical sections.

Primary Input Area

The upper portion contains the expandable multiline text field where the user enters their request.

Features include:

Multiline text input
Paste support (for large pastes shows paste as a clickable card showing a truncated preview, when clicking on it open a dialog to fully show - render a monaco editor)
Drag & drop support
File attachments
Image attachments
Keyboard shortcuts
Send button

The input automatically grows vertically as additional lines are entered before becoming scrollable.

Context Bar

Located directly below the text input.

Contains a row of configurable execution context selectors.

Workspace

Displays the currently selected workspace (only shows when workspace isnt selected yet so only in new convesation screen not in existing conversations).
Also should feature Worktree support inspired by T3 Code.

Determines:

available files
repositories
persistent terminals
browser sessions
workspace-specific tools
Agent

Displays the active agent profile.

Selecting another agent changes:

instructions
available tools
permissions
skills
behaviour

without affecting the conversation itself.

Model

Displays the currently selected LLM.

Allows switching between available providers and models.

The selected model only affects inference and does not modify the agent definition.

Permissions

Controls how much autonomy the agent receives.

Examples include:

Ask before actions
Read only
Full workspace access

Permissions are evaluated alongside the selected agent.

Attachments

Attachment button used for adding:

files
images
other supported assets

Attachments become part of the prompt context.

Additional Options

An overflow ("…") menu provides less frequently used options, such as:

Temporary conversation
Advanced settings
Experimental features
Future extensions
Mental Model

The Prompt Bar is not merely a message input.

Instead, it acts as a task configuration panel.

Every prompt consists of several dimensions:

What should be done (prompt)
Where it should be done (workspace)
Who should perform it (agent)
How it should think (model)
What it is allowed to do (permissions)
Which additional context is available (attachments)

Pressing Send packages all of this into a single execution request for the selected agent. This makes the Prompt Bar the central control surface for every interaction with Subpolar, rather than simply a text field.

------------------------------------------------------------------------

## Agents Screen
Agents = Profiles

### Purpose

Manage reusable AI profiles.

### Layout

Left: if no agent is selected show the gloabal sidebar otherwise a two-arrow to right icon next to the 'Agents' screen title.

Center: Agent list grouped by scope.

If one is opened it renders as list, grouoped into sections by workspace.
If none is opened renders as grid with same grouping.

Right: Selected agent editor.

Sections: - Instructions (AGENTS.md) - Tools - Skills
Instructions shows text area for user to enter manual instructions, a switch (checkbox but shadcn) whether to include full hermes system prompt (which explains what hermes is and what it does) or just the minimal one which just explains tool use and skills.

Tools and skills are both searchable multi-select inputs with ability to create new if input not found. those should open a 'New Tool' or 'Add Skill' Modal.

The default hermes agent should be called master from now on.

Tools should also be editable with their permissions either as allow, ask, auto or deny. auto does internal risk assesment using internal agent and using either of those other three or two depending when run from scheduled task or normal conversation.

Agents define *who* performs work, which context and tools they have access to rather than *where* work happens.

------------------------------------------------------------------------

## Scheduled Tasks Screen

### Purpose

Configure recurring or event-driven AI jobs.

### Layout

Left: Global sidebar if no task is selected.

Center: Task list.
Rendered either as grid grouped by project (when no task is selected) or as list with same grouping (when a task is selected).

Right: Task editor.

Sections: - Trigger (could be schedule, manual trigger, webhook, git hook) - Chat Input Bar - Save/Discard changes buttons

Bottom-right (center section): Floating Add button (plus icon).

------------------------------------------------------------------------

## Apps Screen

### Purpose

Reserved for first-party Subpolar applications.

### Layout

Shared Sidebar

Center: Grid or landing area listing available applications.

No major functionality is currently defined beyond acting as an entry
point for future applications.

------------------------------------------------------------------------

## Create Project Modal

Opened via the **folder-plus** icon beside the workspace selector.

By default, projects (=workspaces) inherit global/general agents. this works by 'forking' them into the project if any changes are made to them.

AGENTS.md is respected and by default added to each of the project's agent configurations, but can be configured in edit agent -> instrcutions, above the additional prompt.

### Fields

-   Name
-   Files
-   Repository URL
-   Local Path

Repository mode: - Clone Repository - Local Folder - No Persistence

Primary action: - Go / Create

A progress dialog may appear while cloning.

------------------------------------------------------------------------

## Create Project Group Modal

Opened from the same folder-plus workflow.

### Fields

-   Group Name
-   Projects

Actions: - Create - Cancel

Project groups exist purely for organization.

They are **not** selectable in the workspace selector.

-------------------------------------------------------------------------

## Settings Sections
- Model: Context length and fallback providers.
  * move to Models *
- Chat: Personality, timezone, reasoning display, image-input behavior.
- Appearance: Theme, color mode, and visual preferences.
- Workspace: Working directory, repository scanning, shell behavior, environment passthrough, and file limits.
  * moved to agents configuration *
- Safety: Approval rules, command allowlists, secret redaction, private URL access, and checkpoints.
  * moved to agents configuration *
- Memory & Context: Memory providers, user profile memory, context engine, and compression.
  memory tools should be listed in tools available to agents, but have to be configured by the user. only available by default in master agent.
- Voice: Speech-to-text, text-to-speech, voices, models, and recording settings.
- Advanced: Toolsets, terminal backends, timeouts, tool-output limits, snapshots, and agent limits.
- Notifications: Desktop notification preferences.
- Billing *explicitly removed*
- Models: with pill shaped tab bar with Providers (Configure provider accounts, API keys, and custom endpoints) and Defaults.
- New: Chat Providers (moved from 'messaging' tab in sidebar)
- Gateway: Configure local, remote.
 * todo * remove cloud hermes support. its purpose is to be a self hosted web app. so one instance only.
- Keybinds: Customize keyboard shortcuts.
- API Keys: Manage stored credentials and tool-related keys.
  * delete this. some of these now in tools section *
- Intergrations: List of available tools. Tools should have a provider and a tool name. so when for example searxngs openapi tool server has a search tool, it should be identified through  searxng.web_search. Also add the abliity to add mcps, openapi servers, and other integrations such as git logins.
- Skills: Markdown files explaining behaviour to agents.
- Plugins: Enable and configure installed plugins.
- Archived Chats: Browse and manage archived sessions.
  * moved into main sidebar *
- About: Version, system information, and application details.

-------------------------------------------------------------------------

## Readd later
Features that are for now removed:

- Pets
- Artifacts
- Kanban

#  Subpolar architecture
- Tool backend
- Harness - Agent loop
- Frontend - web app

## Roadmap:
- Agent templates
