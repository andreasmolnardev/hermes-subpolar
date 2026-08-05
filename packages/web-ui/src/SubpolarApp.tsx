import type {
  SubpolarAgent,
  SubpolarBootstrap,
  SubpolarScheduledTask,
  SubpolarTerminal,
  SubpolarWorkspace
} from '@hermes/shared'
import {
  Activity,
  AlertCircle,
  Archive,
  Bot,
  CalendarClock,
  Check,
  ChevronDown,
  CircleHelp,
  FolderPlus,
  GitBranch,
  Grid2X2,
  Menu,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  X,
  Zap
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

import {
  api,
  fetchJSON,
  type ModelOptionsResponse,
  type SessionInfo,
  type SessionMessage,
  subpolarApi
} from '@/lib/api'
import { GatewayClient, type ConnectionState } from '@/lib/gatewayClient'

type WorkspaceSession = SessionInfo & {
  archived?: boolean
  cwd?: string | null
  workspace_id?: string | null
  workspaceId?: string | null
}

type ActivityItem = {
  id: string
  label: string
  detail?: string
}

type SourceFile = {
  path: string
  status?: string
  staged?: boolean
}

type ProjectForm = {
  name: string
  root: string
  repoUrl: string
  mode: 'local' | 'clone' | 'ephemeral'
}

const NAV_ITEMS: Array<{ label: string; path: string; icon: LucideIcon }> = [
  { label: 'New Chat', path: '/new', icon: Plus },
  { label: 'Agents', path: '/agents', icon: Bot },
  { label: 'Scheduled', path: '/scheduled', icon: CalendarClock },
  { label: 'Apps', path: '/apps', icon: Grid2X2 }
]

const panelStyle = {
  background: '#102b2d',
  borderColor: 'rgba(255, 230, 203, 0.14)'
}

function routePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/'
}

function displayTime(value: number | string | null | undefined): string {
  if (!value) return ''
  const date = new Date(typeof value === 'number' && value < 10_000_000_000 ? value * 1000 : value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function messageText(message: SessionMessage): string {
  if (typeof message.content === 'string') return message.content
  return message.content ? JSON.stringify(message.content) : ''
}

function eventText(payload: unknown): string {
  if (typeof payload === 'string') return payload
  if (!payload || typeof payload !== 'object') return ''
  const value = payload as Record<string, unknown>
  for (const key of ['text', 'delta', 'content', 'message']) {
    if (typeof value[key] === 'string') return value[key]
  }
  return ''
}

function sessionBelongsToWorkspace(session: WorkspaceSession, workspace: SubpolarWorkspace | null): boolean {
  if (!workspace) return true
  const explicitId = session.workspace_id ?? session.workspaceId
  if (explicitId) return explicitId === workspace.id
  if (session.cwd) return session.cwd === workspace.root || session.cwd.startsWith(`${workspace.root}/`)
  return true
}

function useAutoGrowingTextarea(value: string): React.RefObject<HTMLTextAreaElement | null> {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`
  }, [value])
  return ref
}

function Button({
  children,
  className = '',
  kind = 'secondary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'secondary' | 'quiet' | 'danger' }) {
  const kinds = {
    primary: 'bg-[#f0c9a5] text-[#102b2d] hover:bg-[#ffe6cb]',
    secondary: 'border border-[#ffe6cb]/20 bg-[#18383a] text-[#ffe6cb] hover:bg-[#214548]',
    quiet: 'text-[#b9c7bd] hover:bg-[#18383a] hover:text-[#ffe6cb]',
    danger: 'border border-red-300/30 bg-red-950/30 text-red-200 hover:bg-red-950/50'
  }
  return (
    <button
      {...props}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe6cb] disabled:cursor-not-allowed disabled:opacity-50 ${kinds[kind]} ${className}`}
    >
      {children}
    </button>
  )
}

function StatusMessage({ error, retry, label = 'Reconnect' }: { error: string; retry: () => void; label?: string }) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-red-300/25 bg-red-950/30 p-4 text-sm text-red-100"
      role="alert"
    >
      <AlertCircle className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p>{error}</p>
        <Button kind="quiet" className="mt-2 -ml-3" onClick={retry}>
          <RefreshCw size={15} aria-hidden="true" /> {label}
        </Button>
      </div>
    </div>
  )
}

function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-[#ffe6cb]/10 bg-[#0d2527] p-5 text-sm text-[#b9c7bd]"
      role="status"
    >
      <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> {label}
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  children
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-[#91aaa0]">
      {label}
      <span className="relative">
        <select
          aria-label={label}
          value={value}
          onChange={event => onChange(event.target.value)}
          className="min-h-10 w-full appearance-none rounded-lg border border-[#ffe6cb]/15 bg-[#102b2d] px-3 pr-8 text-sm font-normal normal-case tracking-normal text-[#ffe6cb] outline-none focus:border-[#f0c9a5] focus:ring-2 focus:ring-[#f0c9a5]/20"
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-3 text-[#91aaa0]"
          size={15}
          aria-hidden="true"
        />
      </span>
    </label>
  )
}

function WorkspaceSelector({
  workspaces,
  selectedId,
  onSelect,
  onNewProject
}: {
  workspaces: SubpolarWorkspace[]
  selectedId: string
  onSelect: (id: string) => void
  onNewProject: () => void
}) {
  return (
    <div className="space-y-2 px-4 py-4">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-[#78968d]">
        <span>Workspace</span>
        <button
          type="button"
          onClick={onNewProject}
          className="rounded p-1 text-[#b9c7bd] hover:bg-[#18383a] hover:text-[#ffe6cb] focus-visible:outline-2 focus-visible:outline-[#ffe6cb]"
          aria-label="New Project"
          title="New Project"
        >
          <FolderPlus size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="relative">
        <select
          aria-label="Select workspace"
          value={selectedId}
          onChange={event => onSelect(event.target.value)}
          className="min-h-10 w-full appearance-none rounded-lg border border-[#ffe6cb]/15 bg-[#102b2d] px-3 pr-8 text-sm text-[#ffe6cb] outline-none focus:border-[#f0c9a5] focus:ring-2 focus:ring-[#f0c9a5]/20"
        >
          {workspaces.length === 0 ? <option value="">No workspaces</option> : null}
          {workspaces.map(workspace => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-3 text-[#91aaa0]"
          size={15}
          aria-hidden="true"
        />
      </div>
      <button
        type="button"
        onClick={onNewProject}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-[#b9c7bd] hover:bg-[#18383a] hover:text-[#ffe6cb] focus-visible:outline-2 focus-visible:outline-[#ffe6cb]"
      >
        <Plus size={14} aria-hidden="true" /> New Project
      </button>
    </div>
  )
}

function Sidebar({
  pathname,
  workspaces,
  selectedWorkspaceId,
  sessions,
  sessionsLoading,
  sessionsError,
  mobileOpen,
  onClose,
  onWorkspaceSelect,
  onNewProject,
  onRetrySessions
}: {
  pathname: string
  workspaces: SubpolarWorkspace[]
  selectedWorkspaceId: string
  sessions: WorkspaceSession[]
  sessionsLoading: boolean
  sessionsError: string | null
  mobileOpen: boolean
  onClose: () => void
  onWorkspaceSelect: (id: string) => void
  onNewProject: () => void
  onRetrySessions: () => void
}) {
  const navigate = useNavigate()
  const current = sessions.filter(session => !session.archived)
  const archived = sessions.filter(session => session.archived)
  const go = (path: string) => {
    navigate(path)
    onClose()
  }
  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      ) : null}
      <aside
        id="subpolar-sidebar"
        aria-label="Primary navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(86vw,20rem)] -translate-x-full flex-col border-r bg-[#0c2224] transition-transform duration-200 lg:sticky lg:z-auto lg:w-[19rem] lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : ''}`}
        style={{ borderColor: 'rgba(255, 230, 203, 0.14)' }}
      >
        <div
          className="flex min-h-16 items-center justify-between border-b px-5"
          style={{ borderColor: 'rgba(255, 230, 203, 0.12)' }}
        >
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#f0c9a5]">Subpolar</div>
            <div className="mt-1 text-xs text-[#78968d]">Agent workspace</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-lg p-2 text-[#b9c7bd] hover:bg-[#18383a] lg:hidden"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <WorkspaceSelector
          workspaces={workspaces}
          selectedId={selectedWorkspaceId}
          onSelect={onWorkspaceSelect}
          onNewProject={onNewProject}
        />

        <nav className="px-3" aria-label="Main">
          <ul className="space-y-1">
            {NAV_ITEMS.map(({ label, path, icon: Icon }) => {
              const active = path === '/new' ? pathname === '/new' : pathname.startsWith(path)
              return (
                <li key={path}>
                  <button
                    type="button"
                    onClick={() => go(path)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-[#ffe6cb] ${active ? 'bg-[#f0c9a5] font-semibold text-[#102b2d]' : 'text-[#b9c7bd] hover:bg-[#18383a] hover:text-[#ffe6cb]'}`}
                  >
                    <Icon size={17} aria-hidden="true" /> {label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div
          className="mt-5 min-h-0 flex-1 overflow-y-auto border-t px-3 py-4"
          style={{ borderColor: 'rgba(255, 230, 203, 0.1)' }}
        >
          <div className="mb-2 flex items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#78968d]">
            <span>Conversations</span>
            <button
              type="button"
              onClick={() => go('/new')}
              aria-label="New Chat"
              className="rounded p-1 hover:bg-[#18383a] hover:text-[#ffe6cb]"
            >
              <Plus size={14} aria-hidden="true" />
            </button>
          </div>
          {sessionsLoading ? <div className="px-2 py-3 text-xs text-[#78968d]">Loading conversations...</div> : null}
          {sessionsError ? (
            <button
              type="button"
              onClick={onRetrySessions}
              className="flex items-center gap-2 px-2 py-3 text-left text-xs text-red-200 hover:text-[#ffe6cb]"
            >
              <RotateCcw size={13} aria-hidden="true" /> Retry conversations
            </button>
          ) : null}
          {!sessionsLoading && !sessionsError && current.length === 0 ? (
            <div className="px-2 py-3 text-xs leading-5 text-[#78968d]">No conversations in this workspace.</div>
          ) : null}
          <ul className="space-y-1">
            {current.map(session => (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => go(`/chat/${encodeURIComponent(session.id)}`)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-[#ffe6cb] ${pathname.endsWith(`/chat/${session.id}`) ? 'bg-[#18383a] text-[#ffe6cb]' : 'text-[#b9c7bd] hover:bg-[#18383a] hover:text-[#ffe6cb]'}`}
                >
                  <MessageSquare className="shrink-0 text-[#78968d]" size={14} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">
                    {session.title || session.preview || 'Untitled conversation'}
                  </span>
                  <span className="shrink-0 text-[10px] text-[#78968d]">{displayTime(session.last_active)}</span>
                </button>
              </li>
            ))}
          </ul>
          <details className="mt-5" open={archived.length > 0}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#78968d] focus-visible:outline-2 focus-visible:outline-[#ffe6cb]">
              <Archive size={13} aria-hidden="true" /> Archived <span className="ml-auto">{archived.length}</span>
            </summary>
            <ul className="space-y-1">
              {archived.map(session => (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => go(`/chat/${encodeURIComponent(session.id)}`)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-[#78968d] hover:bg-[#18383a] hover:text-[#ffe6cb]"
                  >
                    <MessageSquare size={14} aria-hidden="true" />
                    <span className="truncate">{session.title || 'Archived conversation'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </div>

        <div className="border-t p-3" style={{ borderColor: 'rgba(255, 230, 203, 0.12)' }}>
          <button
            type="button"
            onClick={() => go('/settings')}
            aria-current={pathname === '/settings' ? 'page' : undefined}
            className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#ffe6cb] ${pathname === '/settings' ? 'bg-[#18383a] text-[#ffe6cb]' : 'text-[#b9c7bd] hover:bg-[#18383a] hover:text-[#ffe6cb]'}`}
          >
            <Settings size={17} aria-hidden="true" /> Settings
          </button>
        </div>
      </aside>
    </>
  )
}

function ActivityPanel({
  items,
  connectionState,
  mobileOpen,
  workspaceId
}: {
  items: ActivityItem[]
  connectionState: ConnectionState
  mobileOpen: boolean
  workspaceId?: string
}) {
  const [tab, setTab] = useState<'activity' | 'source' | 'terminal'>('activity')
  const [activity, setActivity] = useState(items)
  const [terminals, setTerminals] = useState<SubpolarTerminal[]>([])
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [sourceDiff, setSourceDiff] = useState('')
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  useEffect(() => {
    if (!workspaceId) return
    subpolarApi
      .activity(workspaceId)
      .then(result =>
        setActivity(
          result.activities.map(item => ({ id: item.id, label: item.label, detail: item.status || item.kind }))
        )
      )
      .catch(() => undefined)
  }, [workspaceId])
  useEffect(() => {
    if (!workspaceId) return
    fetchJSON<{ terminals: SubpolarTerminal[] }>('/api/subpolar/terminals')
      .then(result => setTerminals(result.terminals.filter(terminal => terminal.workspace_id === workspaceId)))
      .catch(() => undefined)
  }, [workspaceId])
  const refreshSource = async () => {
    if (!workspaceId) return
    try {
      setSourceError(null)
      const result = await fetchJSON<{ files?: SourceFile[] }>(
        `/api/subpolar/source-control/changed-files?workspace_id=${encodeURIComponent(workspaceId)}`
      )
      const files = result.files ?? []
      setSourceFiles(files)
      if (selectedFile && !files.some(file => file.path === selectedFile)) {
        setSelectedFile(null)
        setSourceDiff('')
      }
    } catch (cause) {
      setSourceError(cause instanceof Error ? cause.message : 'Could not load source changes')
    }
  }
  useEffect(() => {
    if (tab === 'source') void refreshSource()
  }, [tab, workspaceId])
  useEffect(() => {
    if (!workspaceId || !selectedFile) return
    fetchJSON<{ diff: string }>(
      `/api/subpolar/source-control/diff?workspace_id=${encodeURIComponent(workspaceId)}&file=${encodeURIComponent(selectedFile)}`
    )
      .then(result => setSourceDiff(result.diff))
      .catch(() => setSourceDiff('Could not load diff.'))
  }, [selectedFile, workspaceId])
  const mutateSource = async (action: 'stage' | 'unstage' | 'discard', file: string) => {
    if (!workspaceId) return
    try {
      await fetchJSON(`/api/subpolar/source-control/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
        body: JSON.stringify({ workspace_id: workspaceId, file })
      })
      await refreshSource()
    } catch (cause) {
      setSourceError(cause instanceof Error ? cause.message : `Could not ${action} file`)
    }
  }
  const commitSource = async () => {
    if (!workspaceId || !commitMessage.trim()) return
    try {
      await fetchJSON(`/api/subpolar/source-control/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
        body: JSON.stringify({ workspace_id: workspaceId, message: commitMessage.trim() })
      })
      setCommitMessage('')
      await refreshSource()
    } catch (cause) {
      setSourceError(cause instanceof Error ? cause.message : 'Could not commit changes')
    }
  }
  const createTerminal = async () => {
    if (!workspaceId) return
    const terminal = await fetchJSON<SubpolarTerminal>('/api/subpolar/terminals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
      body: JSON.stringify({ workspace_id: workspaceId, name: `Terminal ${terminals.length + 1}` })
    })
    setTerminals(current => [...current, terminal])
  }
  return (
    <aside
      className={`${mobileOpen ? 'fixed inset-y-16 right-0 z-30 flex' : 'hidden'} w-72 shrink-0 border-l bg-[#0d2527] xl:static xl:flex`}
      style={{ borderColor: 'rgba(255, 230, 203, 0.12)' }}
      aria-label="Activity panel"
    >
      <div className="border-b px-3 pt-3" style={{ borderColor: 'rgba(255, 230, 203, 0.12)' }}>
        <div className="flex min-h-10 items-center gap-2 px-2 text-sm font-semibold text-[#ffe6cb]">
          <Activity size={16} aria-hidden="true" /> Activity Panel
        </div>
        <div className="grid grid-cols-3 gap-1" role="tablist" aria-label="Activity panel tabs">
          {(
            [
              ['activity', 'Activity'],
              ['source', 'Source Control'],
              ['terminal', 'Terminal']
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`min-h-9 rounded-t-md px-1 text-[11px] ${tab === value ? 'bg-[#18383a] text-[#ffe6cb]' : 'text-[#78968d] hover:text-[#ffe6cb]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3 p-5">
        {tab === 'terminal' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.12em] text-[#78968d]">Workspace terminals</p>
              <Button kind="quiet" onClick={() => void createTerminal()} disabled={!workspaceId}>
                + Terminal
              </Button>
            </div>
            {terminals.length === 0 ? (
              <div className="rounded-xl border p-4 text-sm leading-6 text-[#91aaa0]">
                Persistent workspace terminals stay mounted while this panel is hidden.
              </div>
            ) : (
              terminals.map(terminal => (
                <div key={terminal.id} className="rounded-xl border p-3 text-sm text-[#ffe6cb]" style={panelStyle}>
                  <div className="flex items-center justify-between">
                    <span>{terminal.name}</span>
                    <span className="text-xs text-[#78968d]">{terminal.closed ? 'closed' : 'ready'}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-[#78968d]">{terminal.id}</p>
                </div>
              ))
            )}
          </div>
        ) : null}
        {tab === 'source' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[#78968d]">Workspace changes</p>
              <Button kind="quiet" onClick={() => void refreshSource()} disabled={!workspaceId}>
                <RefreshCw size={14} aria-hidden="true" /> Refresh
              </Button>
            </div>
            {sourceError ? (
              <p className="text-sm text-red-200" role="alert">
                {sourceError}
              </p>
            ) : null}
            {sourceFiles.length === 0 ? (
              <div className="rounded-xl border p-4 text-sm leading-6 text-[#91aaa0]" style={panelStyle}>
                No changed files.
              </div>
            ) : (
              <div className="space-y-2">
                {sourceFiles.map(file => (
                  <div
                    key={file.path}
                    className={`rounded-xl border p-3 ${selectedFile === file.path ? 'border-[#f0c9a5]/60' : 'border-[#ffe6cb]/10'}`}
                    style={panelStyle}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedFile(file.path)}
                      className="flex w-full items-start gap-2 text-left text-sm text-[#ffe6cb]"
                    >
                      <GitBranch size={14} className="mt-0.5 shrink-0 text-[#f0c9a5]" aria-hidden="true" />
                      <span className="min-w-0 flex-1 break-all">{file.path}</span>
                      <span className="text-xs text-[#78968d]">
                        {file.status || (file.staged ? 'staged' : 'changed')}
                      </span>
                    </button>
                    <div className="mt-2 flex gap-1">
                      <Button
                        kind="quiet"
                        className="min-h-8 px-2 text-xs"
                        onClick={() => void mutateSource(file.staged ? 'unstage' : 'stage', file.path)}
                      >
                        {file.staged ? 'Unstage' : 'Stage'}
                      </Button>
                      <Button
                        kind="danger"
                        className="min-h-8 px-2 text-xs"
                        onClick={() => void mutateSource('discard', file.path)}
                      >
                        Discard
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {selectedFile ? (
              <pre
                className="max-h-52 overflow-auto rounded-xl border p-3 text-xs leading-5 text-[#b9c7bd]"
                style={panelStyle}
              >
                {sourceDiff || 'Loading diff...'}
              </pre>
            ) : null}
            <div className="flex gap-2">
              <input
                value={commitMessage}
                onChange={event => setCommitMessage(event.target.value)}
                placeholder="Commit message"
                className="min-h-10 min-w-0 flex-1 rounded-lg border border-[#ffe6cb]/15 bg-[#102b2d] px-3 text-sm text-[#ffe6cb] outline-none focus:border-[#f0c9a5]"
              />
              <Button
                kind="primary"
                onClick={() => void commitSource()}
                disabled={!commitMessage.trim() || sourceFiles.length === 0}
              >
                Commit
              </Button>
            </div>
          </div>
        ) : null}
        {tab === 'activity' ? (
          <>
            <div className="rounded-xl border p-3" style={panelStyle}>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#78968d]">
                <span
                  className={`h-2 w-2 rounded-full ${connectionState === 'open' ? 'bg-emerald-400' : 'bg-amber-300'}`}
                />{' '}
                Gateway
              </div>
              <p className="mt-2 text-sm text-[#b9c7bd]">
                {connectionState === 'open'
                  ? 'Connected'
                  : connectionState === 'connecting'
                    ? 'Connecting...'
                    : 'Reconnect available'}
              </p>
            </div>
            {activity.length === 0 ? (
              <p className="text-sm leading-6 text-[#78968d]">Activity from current session will appear here.</p>
            ) : null}
            {activity.map(item => (
              <div key={item.id} className="border-l border-[#f0c9a5]/40 pl-3">
                <p className="text-sm text-[#ffe6cb]">{item.label}</p>
                {item.detail ? <p className="mt-1 text-xs text-[#78968d]">{item.detail}</p> : null}
              </div>
            ))}
          </>
        ) : null}
      </div>
    </aside>
  )
}

function NewChat({
  workspace,
  workspaces,
  selectedWorkspaceId,
  onWorkspaceSelect,
  onOpenChat,
  onActivity
}: {
  workspace: SubpolarWorkspace | null
  workspaces: SubpolarWorkspace[]
  selectedWorkspaceId: string
  onWorkspaceSelect: (id: string) => void
  onOpenChat: (id: string, draft: string) => void
  onActivity: (label: string, detail?: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [agent, setAgent] = useState('master')
  const [model, setModel] = useState('')
  const [permission, setPermission] = useState('ask')
  const [temporary, setTemporary] = useState(false)
  const [attachments, setAttachments] = useState<string[]>([])
  const [modelOptions, setModelOptions] = useState<ModelOptionsResponse | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useAutoGrowingTextarea(draft)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    api
      .getModelOptions()
      .then(setModelOptions)
      .catch(() => setModelOptions(null))
  }, [])

  const models = useMemo(() => {
    const values = (modelOptions?.providers ?? []).flatMap(provider => provider.models ?? [])
    return Array.from(new Set(values))
  }, [modelOptions])

  useEffect(() => {
    if (!model && (modelOptions?.model || models[0])) setModel(modelOptions?.model || models[0] || '')
  }, [model, modelOptions?.model, models])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || creating) return
    setCreating(true)
    setError(null)
    const gateway = new GatewayClient()
    try {
      await gateway.connect()
      const response = await gateway.request<{ session_id?: string }>('session.create', {
        cols: 100,
        source: 'browser',
        cwd: workspace?.root,
        model: model || undefined,
        agent,
        permission_mode: permission,
        temporary,
        title: text.split('\n')[0].slice(0, 80)
      })
      if (!response.session_id) throw new Error('Gateway did not return a session id')
      onActivity('New conversation started', workspace?.name)
      onOpenChat(response.session_id, text)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start conversation')
    } finally {
      gateway.close()
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-10 sm:px-10">
      <div className="mb-10">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#f0c9a5]/30 bg-[#18383a] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#f0c9a5]">
          <Sparkles size={14} aria-hidden="true" /> New workspace turn
        </div>
        <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-[-0.03em] text-[#ffe6cb] sm:text-5xl">
          What do you want to work on?
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-[#91aaa0]">
          Start a focused conversation in{' '}
          {workspace ? <strong className="font-medium text-[#b9c7bd]">{workspace.name}</strong> : 'your workspace'}.
        </p>
      </div>

      <form onSubmit={submit} className="rounded-2xl border p-4 shadow-2xl shadow-black/10" style={panelStyle}>
        <div className="mb-4 flex flex-wrap gap-3 border-b pb-4" style={{ borderColor: 'rgba(255, 230, 203, 0.1)' }}>
          <SelectField label="Workspace" value={selectedWorkspaceId} onChange={onWorkspaceSelect}>
            <option value="">No workspace</option>
            {workspaces.map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Agent" value={agent} onChange={setAgent}>
            <option>master</option>
          </SelectField>
          <SelectField label="Model" value={model} onChange={setModel}>
            <option value="">Workspace default</option>
            {models.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectField>
          <SelectField label="Permissions" value={permission} onChange={setPermission}>
            <option value="ask">Ask before actions</option>
            <option value="standard">Standard</option>
            <option value="full">Full access</option>
          </SelectField>
        </div>
        <label className="sr-only" htmlFor="new-chat-input">
          Chat Input Bar
        </label>
        <textarea
          id="new-chat-input"
          ref={inputRef}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit(event)
          }}
          placeholder="Describe goal, question, or task..."
          rows={3}
          className="max-h-[220px] min-h-24 w-full resize-none bg-transparent px-1 py-2 text-base leading-7 text-[#ffe6cb] outline-none placeholder:text-[#78968d]"
        />
        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2 py-2">
            {attachments.map(name => (
              <span key={name} className="rounded-md bg-[#18383a] px-2 py-1 text-xs text-[#b9c7bd]">
                {name}
              </span>
            ))}
          </div>
        ) : null}
        <div
          className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3"
          style={{ borderColor: 'rgba(255, 230, 203, 0.1)' }}
        >
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              className="sr-only"
              onChange={event => setAttachments(Array.from(event.target.files ?? [], file => file.name))}
            />
            <Button type="button" kind="quiet" onClick={() => fileRef.current?.click()} aria-label="Attach files">
              <Paperclip size={17} aria-hidden="true" /> <span className="hidden sm:inline">Attach</span>
            </Button>
            <label className="flex min-h-10 items-center gap-2 px-2 text-xs text-[#91aaa0]">
              <input
                type="checkbox"
                checked={temporary}
                onChange={event => setTemporary(event.target.checked)}
                className="accent-[#f0c9a5]"
              />{' '}
              Temporary
            </label>
          </div>
          <Button type="submit" kind="primary" disabled={!draft.trim() || creating}>
            {creating ? (
              <RefreshCw className="animate-spin" size={16} aria-hidden="true" />
            ) : (
              <Send size={16} aria-hidden="true" />
            )}{' '}
            {creating ? 'Starting' : 'Send'}
          </Button>
        </div>
        {error ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-red-200" role="alert">
            <AlertCircle size={15} aria-hidden="true" /> {error}
          </p>
        ) : null}
      </form>
    </div>
  )
}

function ChatView({
  sessionId,
  onActivity,
  onSessionsChanged
}: {
  sessionId: string
  onActivity: (label: string, detail?: string) => void
  onSessionsChanged: () => void
}) {
  const location = useLocation()
  const initialDraft =
    typeof (location.state as { draft?: unknown } | null)?.draft === 'string'
      ? (location.state as { draft: string }).draft
      : ''
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [gatewayState, setGatewayState] = useState<ConnectionState>('idle')
  const [gatewayError, setGatewayError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [version, setVersion] = useState(0)
  const draftSent = useRef(false)
  const gatewayRef = useRef<GatewayClient | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useAutoGrowingTextarea(input)

  const loadMessages = () => {
    setLoading(true)
    setLoadError(null)
    fetchJSON<{ messages: SessionMessage[] }>(`/api/subpolar/sessions/${encodeURIComponent(sessionId)}/messages`)
      .then(response =>
        setMessages(current => {
          if (!initialDraft) return response.messages
          const draftAlreadyPersisted = response.messages.some(
            message => message.role === 'user' && messageText(message) === initialDraft
          )
          return draftAlreadyPersisted ? response.messages : [...response.messages, ...current]
        })
      )
      .catch(cause => setLoadError(cause instanceof Error ? cause.message : 'Could not load transcript'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadMessages()
    setMessages([])
    draftSent.current = false
    // Session id is route identity; reconnect version only rebuilds gateway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    const gateway = new GatewayClient()
    gatewayRef.current = gateway
    const offState = gateway.onState(setGatewayState)
    const offError = gateway.on<{ message?: string }>('error', event =>
      setGatewayError(event.payload?.message || 'Gateway reported an error')
    )
    const assistantStream = { current: false }
    const appendAssistant = (text: string) => {
      if (!text) return
      setMessages(current => {
        const last = current[current.length - 1]
        if (assistantStream.current && last?.role === 'assistant') {
          return [...current.slice(0, -1), { ...last, content: `${messageText(last)}${text}` }]
        }
        assistantStream.current = true
        return [...current, { role: 'assistant', content: text }]
      })
    }
    const offStart = gateway.on('message.start', () => {
      assistantStream.current = true
      setWorking(true)
    })
    const offDelta = gateway.on('message.delta', event => {
      setWorking(true)
      appendAssistant(eventText(event.payload))
    })
    const offInterim = gateway.on('message.interim', event => appendAssistant(eventText(event.payload)))
    const offComplete = gateway.on('message.complete', event => {
      const text = eventText(event.payload)
      if (text) appendAssistant(text)
      assistantStream.current = false
      setWorking(false)
      onSessionsChanged()
    })

    void gateway
      .connect()
      .then(async () => {
        const resumed = await gateway.request<{ session_id?: string; messages?: SessionMessage[]; running?: boolean }>(
          'session.resume',
          { session_id: sessionId, source: 'browser', omit_messages: false }
        )
        if (resumed?.messages?.length) setMessages(current => (current.length ? current : (resumed.messages ?? [])))
        if (resumed?.running) setWorking(true)
        if (initialDraft && !draftSent.current) {
          draftSent.current = true
          setMessages(current => [...current, { role: 'user', content: initialDraft }])
          setWorking(true)
          await gateway.request('prompt.submit', { session_id: resumed?.session_id || sessionId, text: initialDraft })
          onActivity('Prompt submitted', 'New conversation')
        }
      })
      .catch((cause: unknown) =>
        setGatewayError(cause instanceof Error ? cause.message : 'Could not connect to gateway')
      )

    return () => {
      offState()
      offError()
      offStart()
      offDelta()
      offInterim()
      offComplete()
      gateway.close()
      if (gatewayRef.current === gateway) gatewayRef.current = null
    }
    // Gateway instance intentionally follows reconnect version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, version])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, working])
  useEffect(() => {
    if (gatewayState === 'closed' || gatewayState === 'error') {
      setGatewayError(current => current || 'Gateway disconnected')
    }
  }, [gatewayState])

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    const text = input.trim()
    const gateway = gatewayRef.current
    if (!text || !gateway || gatewayState !== 'open' || working) return
    setInput('')
    setMessages(current => [...current, { role: 'user', content: text }])
    setWorking(true)
    setGatewayError(null)
    try {
      await gateway.request('prompt.submit', { session_id: sessionId, text })
      onActivity('Prompt submitted', text.slice(0, 80))
      onSessionsChanged()
    } catch (cause) {
      setWorking(false)
      setGatewayError(cause instanceof Error ? cause.message : 'Prompt failed')
    }
  }

  const cancel = async () => {
    const gateway = gatewayRef.current
    if (!gateway) return
    try {
      await gateway.request('session.interrupt', { session_id: sessionId })
    } catch (cause) {
      setGatewayError(cause instanceof Error ? cause.message : 'Could not cancel turn')
    }
    setWorking(false)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header
        className="flex min-h-16 items-center justify-between border-b px-5 sm:px-8"
        style={{ borderColor: 'rgba(255, 230, 203, 0.12)' }}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#78968d]">Conversation</p>
          <h1 className="truncate text-lg font-semibold text-[#ffe6cb]">{sessionId}</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#91aaa0]">
          <span className={`h-2 w-2 rounded-full ${gatewayState === 'open' ? 'bg-emerald-400' : 'bg-amber-300'}`} />{' '}
          {gatewayState === 'open' ? 'Connected' : gatewayState === 'connecting' ? 'Connecting' : 'Reconnect needed'}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-10">
        <div className="mx-auto w-full max-w-3xl space-y-5">
          {loading ? <LoadingState label="Loading transcript..." /> : null}
          {loadError ? <StatusMessage error={loadError} retry={loadMessages} label="Reload transcript" /> : null}
          {!loading && !loadError && messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#ffe6cb]/15 p-8 text-center text-sm text-[#78968d]">
              Transcript empty. Send first prompt.
            </div>
          ) : null}
          {messages.map((message, index) => (
            <div
              key={`${index}-${message.timestamp ?? 'message'}`}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-7 sm:max-w-[78%] ${message.role === 'user' ? 'rounded-br-md bg-[#f0c9a5] text-[#102b2d]' : message.role === 'system' ? 'border border-[#ffe6cb]/10 bg-[#0d2527] text-[#91aaa0]' : 'rounded-bl-md border border-[#ffe6cb]/10 bg-[#18383a] text-[#ffe6cb]'}`}
              >
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-60">
                  {message.role}
                </div>
                <div className="whitespace-pre-wrap">{messageText(message)}</div>
              </div>
            </div>
          ))}
          {working ? (
            <div className="flex items-center gap-3 text-sm text-[#91aaa0]" role="status">
              <Zap size={15} className="text-[#f0c9a5]" aria-hidden="true" /> Working...
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="border-t p-4 sm:px-8" style={{ borderColor: 'rgba(255, 230, 203, 0.12)' }}>
        {gatewayError ? (
          <div
            className="mx-auto mb-3 flex max-w-3xl items-center justify-between gap-3 rounded-lg border border-red-300/25 bg-red-950/30 px-3 py-2 text-sm text-red-100"
            role="alert"
          >
            <span className="flex min-w-0 items-center gap-2">
              <AlertCircle size={15} aria-hidden="true" /> <span className="truncate">{gatewayError}</span>
            </span>
            <Button
              kind="quiet"
              onClick={() => {
                setGatewayError(null)
                setVersion(value => value + 1)
              }}
            >
              Reconnect
            </Button>
          </div>
        ) : null}
        <form
          onSubmit={send}
          className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border p-2"
          style={panelStyle}
        >
          <label className="sr-only" htmlFor="chat-input">
            Chat Input Bar
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            value={input}
            onChange={event => setInput(event.target.value)}
            rows={1}
            placeholder="Reply to Hermes..."
            className="max-h-[180px] min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 text-[#ffe6cb] outline-none placeholder:text-[#78968d]"
          />
          {working ? (
            <Button type="button" kind="danger" onClick={cancel} aria-label="Cancel response">
              <Square size={14} fill="currentColor" aria-hidden="true" /> Cancel
            </Button>
          ) : (
            <Button
              type="submit"
              kind="primary"
              disabled={!input.trim() || gatewayState !== 'open'}
              aria-label="Send message"
            >
              <Send size={15} aria-hidden="true" /> Send
            </Button>
          )}
        </form>
      </div>
    </div>
  )
}

function AgentsPage() {
  const [agents, setAgents] = useState<SubpolarAgent[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    subpolarApi
      .agents()
      .then(result => setAgents(result.agents))
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load Agents'))
  }, [])
  return (
    <PageFrame
      eyebrow="Agents"
      title="Agents"
      description="Reusable AI behavior configurations define who performs work. Projects and workspaces define where work happens."
    >
      <div className="grid gap-4 md:grid-cols-[minmax(12rem,0.35fr)_1fr]">
        {error ? (
          <p className="mb-4 text-sm text-red-200" role="alert">
            {error}
          </p>
        ) : null}
        <section className="rounded-2xl border p-4" style={panelStyle} aria-label="Agent list">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#78968d]">Global Agents</div>
          {agents
            .filter(agent => agent.scope === 'global')
            .map(agent => (
              <button
                key={agent.id}
                type="button"
                className="flex min-h-12 w-full items-center gap-3 rounded-xl bg-[#18383a] px-3 text-left text-sm text-[#ffe6cb]"
              >
                <Bot size={17} className="text-[#f0c9a5]" aria-hidden="true" />
                <span className="flex-1">{agent.name}</span>
                <Check size={16} aria-hidden="true" />
              </button>
            ))}
        </section>
        <section className="flex min-h-56 items-center justify-center rounded-2xl border border-dashed border-[#ffe6cb]/15 p-8 text-center">
          <div>
            <CircleHelp className="mx-auto mb-3 text-[#f0c9a5]" size={24} aria-hidden="true" />
            <h2 className="text-lg font-semibold text-[#ffe6cb]">Select an Agent</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[#91aaa0]">
              Instructions, tools, skills, and inherited permission values appear here when an Agent is selected.
            </p>
          </div>
        </section>
      </div>
    </PageFrame>
  )
}

function ScheduledPage() {
  const [jobs, setJobs] = useState<SubpolarScheduledTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const load = () => {
    setLoading(true)
    setError(null)
    subpolarApi
      .schedules()
      .then(result => setJobs(result.tasks))
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load scheduled tasks'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])
  const runNow = async (job: SubpolarScheduledTask) => {
    setRunning(job.id)
    try {
      await fetchJSON(`/api/subpolar/schedules/${encodeURIComponent(job.id)}/run-now`, {
        method: 'POST',
        headers: { Origin: window.location.origin }
      })
      load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not run task')
    } finally {
      setRunning(null)
    }
  }
  return (
    <PageFrame
      eyebrow="Automation"
      title="Scheduled"
      description="Review scheduled tasks and run a task immediately without leaving Subpolar."
    >
      <div className="mb-5 flex justify-end">
        <Button kind="secondary" onClick={load}>
          <RefreshCw size={15} aria-hidden="true" /> Refresh
        </Button>
      </div>
      {loading ? <LoadingState label="Loading scheduled tasks..." /> : null}
      {error ? <StatusMessage error={error} retry={load} /> : null}
      {!loading && !error && jobs.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No scheduled tasks"
          detail="Create a task to run an Agent with a pre-resolved scheduled permission policy."
        />
      ) : null}
      <div className="space-y-3">
        {jobs.map(job => (
          <article key={job.id} className="flex flex-wrap items-center gap-4 rounded-2xl border p-4" style={panelStyle}>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="rounded-xl bg-[#18383a] p-2 text-[#f0c9a5]">
                <CalendarClock size={18} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate font-medium text-[#ffe6cb]">{job.name || 'Untitled task'}</h2>
                <p className="mt-1 text-xs text-[#91aaa0]">
                  {job.schedule} {job.last_error ? `- ${job.last_error}` : ''}
                </p>
              </div>
            </div>
            <Button kind="secondary" disabled={running === job.id} onClick={() => void runNow(job)}>
              {running === job.id ? (
                <RefreshCw className="animate-spin" size={15} aria-hidden="true" />
              ) : (
                <Zap size={15} aria-hidden="true" />
              )}{' '}
              Run now
            </Button>
          </article>
        ))}
      </div>
    </PageFrame>
  )
}

function AppsPage() {
  return (
    <PageFrame
      eyebrow="Connected surfaces"
      title="Apps"
      description="Apps will give Agents stable connections to the tools and services your work needs."
    >
      <EmptyState
        icon={Grid2X2}
        title="No apps connected"
        detail="This landing page stays ready for your first app connection."
      />
    </PageFrame>
  )
}

function SettingsPage() {
  const [tab, setTab] = useState('General')
  const [integrations, setIntegrations] = useState<
    Array<{ id: string; name: string; provider: string; kind: string; health: string }>
  >([])
  const tabs = [
    'Models',
    'Chat',
    'Appearance',
    'Voice',
    'Advanced',
    'Notifications',
    'Gateway',
    'Keybinds',
    'Plugins',
    'Skills',
    'Integrations',
    'Chat Providers',
    'Memory & Context',
    'About'
  ]
  useEffect(() => {
    if (tab === 'Integrations')
      subpolarApi
        .integrations()
        .then(result => setIntegrations(result.integrations))
        .catch(() => undefined)
  }, [tab])
  return (
    <PageFrame
      eyebrow="Workspace"
      title="Settings"
      description="Configure Subpolar shell behavior and connected services."
    >
      <div
        className="mb-6 flex gap-1 overflow-x-auto border-b"
        style={{ borderColor: 'rgba(255, 230, 203, 0.12)' }}
        role="tablist"
        aria-label="Settings tabs"
      >
        {tabs.map(item => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className={`min-h-11 shrink-0 border-b-2 px-4 text-sm ${tab === item ? 'border-[#f0c9a5] text-[#ffe6cb]' : 'border-transparent text-[#91aaa0] hover:text-[#ffe6cb]'}`}
          >
            {item}
          </button>
        ))}
      </div>
      {tab === 'Integrations' ? (
        <div className="rounded-2xl border p-6" style={panelStyle}>
          <div className="mb-3 flex items-center gap-3 text-[#ffe6cb]">
            <GitBranch size={19} aria-hidden="true" />
            <h2 className="font-semibold">Integrations</h2>
          </div>
          <p className="mb-5 text-sm leading-6 text-[#91aaa0]">
            Provider configuration and credentials belong here. Projects reference configured Git providers without
            storing credentials.
          </p>
          {integrations.length === 0 ? (
            <p className="text-sm text-[#78968d]">No provider integrations configured.</p>
          ) : (
            <ul className="space-y-2">
              {integrations.map(integration => (
                <li key={integration.id} className="flex items-center gap-3 rounded-lg bg-[#18383a] px-3 py-2 text-sm">
                  <span className="flex-1 text-[#ffe6cb]">{integration.name}</span>
                  <span className="text-xs text-[#91aaa0]">
                    {integration.provider} · {integration.kind} · {integration.health}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <SettingCard
            icon={SlidersHorizontal}
            title={tab}
            detail="Shell preferences remain local to this browser until persistence is enabled."
          />
          <SettingCard
            icon={Zap}
            title="Gateway"
            detail="Connection state and reconnect actions appear where work happens."
          />
        </div>
      )}
    </PageFrame>
  )
}

function SettingCard({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <section className="rounded-2xl border p-5" style={panelStyle}>
      <Icon size={19} className="text-[#f0c9a5]" aria-hidden="true" />
      <h2 className="mt-4 font-semibold text-[#ffe6cb]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#91aaa0]">{detail}</p>
    </section>
  )
}

function PageFrame({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-10 sm:py-12">
      <div className="mb-8">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f0c9a5]">{eyebrow}</div>
        <h1 className="text-3xl font-semibold tracking-[-0.025em] text-[#ffe6cb] sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#91aaa0]">{description}</p>
      </div>
      {children}
    </div>
  )
}

function EmptyState({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-[#ffe6cb]/15 p-8 text-center">
      <div>
        <Icon className="mx-auto mb-4 text-[#f0c9a5]" size={28} aria-hidden="true" />
        <h2 className="text-lg font-semibold text-[#ffe6cb]">{title}</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-[#91aaa0]">{detail}</p>
      </div>
    </div>
  )
}

function ProjectDialog({
  onClose,
  onCreated
}: {
  onClose: () => void
  onCreated: (workspace: SubpolarWorkspace) => void
}) {
  const [form, setForm] = useState<ProjectForm>({ name: '', root: '', repoUrl: '', mode: 'local' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (form.mode === 'clone') {
        await fetchJSON('/api/subpolar/clones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
          body: JSON.stringify({ name: form.name, root: form.root, repo_url: form.repoUrl })
        })
        onClose()
        return
      }
      const workspace = await fetchJSON<SubpolarWorkspace>('/api/subpolar/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
        body: JSON.stringify({ name: form.name, root: form.root, mode: form.mode })
      })
      onCreated(workspace)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create project')
    } finally {
      setSaving(false)
    }
  }
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border p-6 shadow-2xl"
        style={{ ...panelStyle, background: '#0c2224' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="new-project-title" className="text-xl font-semibold text-[#ffe6cb]">
              New Project
            </h2>
            <p className="mt-1 text-sm text-[#91aaa0]">Add a local, cloned, or ephemeral workspace.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close New Project"
            className="rounded-lg p-2 text-[#b9c7bd] hover:bg-[#18383a]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-sm text-[#b9c7bd]">
            Project name
            <input
              required
              value={form.name}
              onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
              className="mt-2 min-h-11 w-full rounded-lg border border-[#ffe6cb]/15 bg-[#102b2d] px-3 text-[#ffe6cb] outline-none focus:border-[#f0c9a5]"
            />
          </label>
          <SelectField
            label="Mode"
            value={form.mode}
            onChange={value => setForm(current => ({ ...current, mode: value as ProjectForm['mode'] }))}
          >
            <option value="local">Local Folder</option>
            <option value="clone">Clone Repository</option>
            <option value="ephemeral">No Persistence</option>
          </SelectField>
          <label className="block text-sm text-[#b9c7bd]">
            Workspace root
            <input
              required
              placeholder="/path/to/project"
              value={form.root}
              onChange={event => setForm(current => ({ ...current, root: event.target.value }))}
              className="mt-2 min-h-11 w-full rounded-lg border border-[#ffe6cb]/15 bg-[#102b2d] px-3 text-[#ffe6cb] outline-none focus:border-[#f0c9a5]"
            />
          </label>
          {form.mode === 'clone' ? (
            <label className="block text-sm text-[#b9c7bd]">
              Repository URL
              <input
                required
                placeholder="https://git.example/repo.git"
                value={form.repoUrl}
                onChange={event => setForm(current => ({ ...current, repoUrl: event.target.value }))}
                className="mt-2 min-h-11 w-full rounded-lg border border-[#ffe6cb]/15 bg-[#102b2d] px-3 text-[#ffe6cb] outline-none focus:border-[#f0c9a5]"
              />
            </label>
          ) : null}
        </div>
        {error ? (
          <p className="mt-4 text-sm text-red-200" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" kind="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" kind="primary" disabled={saving}>
            {saving ? 'Creating...' : form.mode === 'clone' ? 'Start Clone' : 'Create Project'}
          </Button>
        </div>
      </form>
    </div>
  )
}

export default function SubpolarApp() {
  const location = useLocation()
  const navigate = useNavigate()
  const pathname = routePath(location.pathname)
  const [bootstrap, setBootstrap] = useState<SubpolarBootstrap | null>(null)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<WorkspaceSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [activityOpen, setActivityOpen] = useState(false)
  const [shellGatewayState] = useState<ConnectionState>('idle')
  const workspaces = bootstrap?.workspaces ?? []
  const workspace = workspaces.find(item => item.id === selectedWorkspaceId) ?? workspaces[0] ?? null

  const loadBootstrap = () => {
    setBootstrapError(null)
    fetchJSON<SubpolarBootstrap>('/api/subpolar/bootstrap')
      .then(value => {
        setBootstrap(value)
        setSelectedWorkspaceId(
          current =>
            current || value.workspaces.find(workspace => !workspace.archived)?.id || value.workspaces[0]?.id || ''
        )
      })
      .catch(cause => setBootstrapError(cause instanceof Error ? cause.message : 'Could not load workspaces'))
  }
  const loadSessions = (cwdPrefix?: string) => {
    setSessionsLoading(true)
    setSessionsError(null)
    const query = new URLSearchParams({ limit: '100', archived: 'include' })
    if (cwdPrefix) query.set('cwd_prefix', cwdPrefix)
    fetchJSON<{ sessions: WorkspaceSession[] }>(`/api/subpolar/sessions?${query.toString()}`)
      .then(value => setSessions(value.sessions))
      .catch(cause => setSessionsError(cause instanceof Error ? cause.message : 'Could not load conversations'))
      .finally(() => setSessionsLoading(false))
  }
  useEffect(() => {
    loadBootstrap()
  }, [])
  useEffect(() => {
    if (bootstrap) loadSessions(workspace?.root)
  }, [bootstrap, workspace?.root])
  useEffect(() => {
    if (pathname === '/') navigate('/new', { replace: true })
  }, [navigate, pathname])

  const scopedSessions = sessions.filter(session => sessionBelongsToWorkspace(session, workspace))
  const addActivity = (label: string, detail?: string) =>
    setActivities(current => [{ id: `${Date.now()}-${label}`, label, detail }, ...current].slice(0, 8))
  const createWorkspace = (created: SubpolarWorkspace) => {
    setBootstrap(current =>
      current
        ? { ...current, workspaces: [...current.workspaces, created] }
        : { workspaces: [created], groups: [], worktrees: [] }
    )
    setSelectedWorkspaceId(created.id)
    setProjectOpen(false)
    addActivity('Project created', created.name)
  }

  let outlet: React.ReactNode
  if (bootstrapError)
    outlet = (
      <div className="mx-auto w-full max-w-2xl p-5 sm:p-10">
        <StatusMessage error={bootstrapError} retry={loadBootstrap} label="Reconnect" />
      </div>
    )
  else if (!bootstrap)
    outlet = (
      <div className="mx-auto w-full max-w-2xl p-5 sm:p-10">
        <LoadingState label="Loading Subpolar workspaces..." />
      </div>
    )
  else if (pathname === '/new')
    outlet = (
      <NewChat
        workspace={workspace}
        workspaces={workspaces}
        selectedWorkspaceId={workspace?.id ?? ''}
        onWorkspaceSelect={setSelectedWorkspaceId}
        onOpenChat={(id, draft) => navigate(`/chat/${encodeURIComponent(id)}`, { state: { draft } })}
        onActivity={addActivity}
      />
    )
  else if (pathname.startsWith('/chat/'))
    outlet = (
      <ChatView
        sessionId={decodeURIComponent(pathname.slice('/chat/'.length))}
        onActivity={addActivity}
        onSessionsChanged={loadSessions}
      />
    )
  else if (pathname === '/agents') outlet = <AgentsPage />
  else if (pathname === '/scheduled') outlet = <ScheduledPage />
  else if (pathname === '/apps') outlet = <AppsPage />
  else if (pathname === '/settings') outlet = <SettingsPage />
  else
    outlet = (
      <div className="p-10">
        <StatusMessage error="Route not found" retry={() => navigate('/new')} label="Open New Chat" />
      </div>
    )

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-[#07191b] text-[#ffe6cb]">
      <Sidebar
        pathname={pathname}
        workspaces={workspaces}
        selectedWorkspaceId={workspace?.id ?? ''}
        sessions={scopedSessions}
        sessionsLoading={sessionsLoading}
        sessionsError={sessionsError}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onWorkspaceSelect={id => {
          setSelectedWorkspaceId(id)
          setMobileOpen(false)
        }}
        onNewProject={() => setProjectOpen(true)}
        onRetrySessions={() => loadSessions(workspace?.root)}
      />
      <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header
          className="flex min-h-16 shrink-0 items-center justify-between border-b px-4 sm:px-8 lg:px-10"
          style={{ borderColor: 'rgba(255, 230, 203, 0.12)' }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              aria-controls="subpolar-sidebar"
              className="rounded-lg p-2 text-[#b9c7bd] hover:bg-[#18383a] lg:hidden"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <div className="hidden items-center gap-2 text-xs text-[#78968d] sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f0c9a5]" /> {workspace?.name || 'No workspace selected'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-[#78968d] sm:inline">
              {pathname === '/new' ? 'Ready' : 'Subpolar shell'}
            </span>
            <button
              type="button"
              aria-label="Toggle Activity panel"
              aria-expanded={activityOpen}
              onClick={() => setActivityOpen(open => !open)}
              className="rounded-lg p-2 text-[#b9c7bd] hover:bg-[#18383a] xl:hidden"
            >
              <Activity size={17} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <section className="flex min-w-0 flex-1 flex-col">{outlet}</section>
          <ActivityPanel
            items={activities}
            connectionState={shellGatewayState}
            mobileOpen={activityOpen}
            workspaceId={workspace?.id}
          />
        </div>
      </main>
      {projectOpen ? <ProjectDialog onClose={() => setProjectOpen(false)} onCreated={createWorkspace} /> : null}
    </div>
  )
}
