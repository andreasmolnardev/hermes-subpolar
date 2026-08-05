export type AgentPermission = 'allow' | 'ask' | 'auto' | 'deny'
export type AgentScope = 'global' | 'workspace'

export interface SubpolarAgent {
  id: string
  owner: string
  scope: AgentScope
  workspace_id: string | null
  role: string | null
  parent_id: string | null
  name: string
  instructions: string
  include_system_prompt: boolean
  model: string | null
  tools: string[]
  skills: string[]
  permissions: { tools?: Record<string, AgentPermission>; scheduled?: Record<string, 'ask' | 'deny'> }
  overrides: Record<string, unknown>
  archived: boolean
  source_id?: string
  requested_id?: string
}

export type IntegrationKind = 'mcp' | 'openapi' | 'git' | 'model' | 'chat' | 'memory' | 'plugin'

export interface SubpolarIntegration {
  id: string
  owner: string
  kind: IntegrationKind
  name: string
  provider: string
  endpoint: string | null
  credential_ref: string | null
  config: Record<string, unknown>
  enabled: boolean
  health: string
  schema_version: number
}

export interface SubpolarScheduledTask {
  owner: string
  id: string
  name: string
  prompt: string
  schedule: string
  workspace_id: string
  worktree_id: string | null
  agent_id: string
  model: string | null
  permission_mode: 'scheduled'
  timezone: string | null
  enabled: boolean
  cron_job_id: string | null
  last_error: string | null
  draft_json: Record<string, unknown> | null
}

export interface SubpolarTerminal {
  owner: string
  id: string
  workspace_id: string
  worktree_id: string | null
  name: string
  position: number
  created_at: string
  closed: boolean
}

export type SubpolarActivityKind =
  | 'thinking'
  | 'planning'
  | 'tool'
  | 'search'
  | 'browser'
  | 'subagent'
  | 'git'
  | 'file'
  | 'approval'
  | 'error'
  | 'completion'

export interface SubpolarActivity {
  id: string
  owner: string
  workspace_id: string | null
  session_id: string | null
  task_id: string | null
  kind: SubpolarActivityKind
  label: string
  status: string | null
  started_at: string
  ended_at: string | null
  duration_ms: number | null
  details: Record<string, unknown>
  artifact_id: string | null
}
