export type WorkspaceMode = 'local' | 'clone' | 'ephemeral'

export interface SubpolarWorkspace {
  id: string
  owner: string
  name: string
  mode: WorkspaceMode
  root: string
  repo_url: string | null
  git_provider: string | null
  archived: boolean
}

export interface SubpolarProjectGroup {
  id: string
  owner: string
  name: string
  workspace_ids: string[]
}

export interface SubpolarWorktree {
  id: string
  owner: string
  workspace_id: string
  root: string
  branch: string
}

export interface SubpolarBootstrap {
  workspaces: SubpolarWorkspace[]
  groups: SubpolarProjectGroup[]
  worktrees: SubpolarWorktree[]
}
