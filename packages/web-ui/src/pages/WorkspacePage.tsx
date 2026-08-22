import { useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent } from 'react'
import {
  AppWindow,
  Bot,
  CalendarClock,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Code2,
  FolderGit2,
  FolderPlus,
  LogOut,
  Menu,
  MessageSquare,
  Palette,
  Plus,
  Rocket,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Square,
  X,
  Zap
} from 'lucide-react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  agents,
  availableModels,
  capabilities,
  automations,
  automationRuns,
  createAgent,
  createAutomation,
  createProjectFromInput,
  deleteAutomation,
  gitCredentials,
  gitDiff,
  gitStatus,
  modelDefaults,
  promptCommands,
  projects,
  skills,
  sessionTranscript,
  sessions,
  updateAgent,
  updateAutomation,
  type SubpolarAgent,
  type SubpolarAgentUpdate,
  type SubpolarAutomation,
  type SubpolarAutomationRun,
  type SubpolarCapability,
  type SubpolarGitCredential,
  type SubpolarGitStatus,
  type SubpolarMessage,
  type SubpolarModelProvider,
  type SubpolarPromptCommand,
  type SubpolarProject,
  type SubpolarSkill,
  type SubpolarSession,
  type SubpolarUser
} from '@/lib/subpolar-api'
import { SubpolarWebSocketClient, type SubpolarSocketEvent } from '@/lib/subpolar-client'
import { projectSubpolarActivity, subpolarEventType, type SubpolarActivityKind } from '@/lib/subpolar-events'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AgentSkillPicker } from '@/components/AgentSkillPicker'
import { PromptCommandComposer } from '@/components/PromptCommandComposer'

type View = 'chat' | 'agents' | 'automations' | 'apps'
type WorkspaceView = View | 'projects'
type IconName = 'bot' | 'code' | 'research' | 'rocket' | 'shield' | 'palette'

const ICONS: Record<IconName, ComponentType<{ size?: number; className?: string }>> = {
  bot: Bot,
  code: Code2,
  research: Search,
  rocket: Rocket,
  shield: ShieldCheck,
  palette: Palette
}
const ICON_OPTIONS = Object.keys(ICONS) as IconName[]
function randomId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function eventText(event: SubpolarSocketEvent) {
  const payload = record(event.event)?.payload
  const value = record(payload)
  return typeof value?.text === 'string' ? value.text : ''
}

function agentIcon(agent?: SubpolarAgent) {
  const Icon = ICONS[(agent?.icon ?? 'bot') as IconName] ?? Bot
  return <Icon size={17} />
}

function messageText(message: { readonly content: SubpolarMessage['content'] }): string {
  return typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
}

type ChatMessage =
  | SubpolarMessage
  | {
      readonly role: SubpolarActivityKind
      readonly content: string
      readonly sequence?: number
    }

type PromptMessage = {
  readonly role: 'system' | 'user' | 'assistant'
  readonly content: SubpolarMessage['content']
  readonly sequence?: number
}

function isPromptMessage(message: ChatMessage): message is PromptMessage {
  return message.role === 'system' || message.role === 'user' || message.role === 'assistant'
}

interface NavProps {
  user: SubpolarUser
  projects: readonly SubpolarProject[]
  selectedProject: string
  setProject: (id: string) => void
  sessions: readonly SubpolarSession[]
  selectedSession: string | null
  open: boolean
  close: () => void
  logout: () => void
}

function GlobalSidebar(props: NavProps) {
  const location = useLocation()
  const nav = [
    { to: '/chat/new', id: 'chat', label: 'New chat', icon: Plus },
    { to: '/agents', id: 'agents', label: 'Agents', icon: Bot },
    { to: '/automations', id: 'automations', label: 'Scheduled', icon: CalendarClock },
    { to: '/apps', id: 'apps', label: 'Apps', icon: AppWindow }
  ] as const
  return (
    <aside
      className={`${props.open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} fixed inset-y-0 left-0 z-30 flex w-[17rem] shrink-0 flex-col border-r border-[color-mix(in_srgb,var(--midground-base)_16%,transparent)] bg-[var(--background-base)] transition-transform lg:static`}
    >
      <div className="flex h-16 items-center justify-between px-4">
        <div>
          <span className="font-semibold tracking-[.16em] text-[var(--color-primary,var(--midground-base))]">
            SUBPOLAR
          </span>
          <span className="ml-2 text-xs text-[var(--color-muted-foreground,var(--midground-base))]">agent</span>
        </div>
        <button onClick={props.close} className="lg:hidden">
          <X size={18} />
        </button>
      </div>
      <nav className="space-y-1 px-3">
        {nav.map(item => (
          <NavLink
            key={item.id}
            to={item.to}
            onClick={props.close}
            className={({ isActive }) =>
              `${isActive || (item.id === 'chat' && location.pathname.startsWith('/chat')) ? 'bg-[var(--color-secondary,var(--midground-base))] text-[var(--color-secondary-foreground,var(--background-base))]' : 'text-[var(--color-muted-foreground,var(--midground-base))] hover:bg-[color-mix(in_srgb,var(--midground-base)_8%,transparent)]'} flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm`
            }
          >
            <item.icon size={16} />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="mx-3 mt-4 border-t border-white/10 pt-4">
        <div className="flex items-center gap-2">
          <Select
            value={props.selectedProject || 'all'}
            onValueChange={value => props.setProject(value === 'all' ? '' : value)}
          >
            <SelectTrigger className="min-w-0 flex-1" aria-label="Project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {props.projects.map(project => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link to="/projects/new" onClick={props.close} aria-label="Add project" className="shrink-0">
            <Plus size={14} />
          </Link>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-4">
        <p className="mb-2 text-[10px] uppercase tracking-widest text-[var(--color-muted-foreground,var(--midground-base))]">
          Threads
        </p>
        {props.sessions.map(session => (
          <Link
            key={session.sessionId}
            to={sessionHref(session)}
            onClick={props.close}
            className={`${props.selectedSession === session.sessionId ? 'bg-[var(--color-secondary,var(--midground-base))] text-[var(--color-secondary-foreground,var(--background-base))]' : 'text-[var(--color-muted-foreground,var(--midground-base))] hover:bg-[color-mix(in_srgb,var(--midground-base)_8%,transparent)]'} flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs`}
          >
            <MessageSquare size={13} />
            <span className="truncate">{session.sessionId.slice(0, 18)}</span>
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-white/10 p-3">
        <Link
          to="/settings/account"
          onClick={props.close}
          className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-white"
        >
          <Settings size={15} className="text-[#829b92]" />
          <span className="min-w-0 flex-1 truncate text-xs">{props.user.username}</span>
        </Link>
        <button onClick={props.logout} aria-label="Log out">
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  )
}

function CollectionSidebar({
  kind,
  title,
  items,
  projects = [],
  selected,
  basePath,
  onExpand
}: {
  kind: 'agents' | 'automations'
  title: string
  items: readonly { id: string; name: string; icon?: string }[]
  projects?: readonly SubpolarProject[]
  selected: string
  basePath: string
  onExpand: () => void
}) {
  const groups = kind === 'automations'
    ? [
        { label: 'Global', items: items.filter(item => !(item as SubpolarAutomation).projectId) },
        ...projects.map(project => ({ label: project.name, items: items.filter(item => (item as SubpolarAutomation).projectId === project.id) }))
      ].filter(group => group.items.length > 0)
    : [{ label: 'Default', items }]
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-[color-mix(in_srgb,var(--midground-base)_16%,transparent)] bg-[var(--color-card,var(--background-base))] sm:flex">
      <div className="flex h-16 items-center gap-2 border-b border-white/10 px-3">
        <button
          onClick={onExpand}
          className="rounded p-1.5 text-[var(--color-muted-foreground,var(--midground-base))] hover:bg-[color-mix(in_srgb,var(--midground-base)_10%,transparent)]"
          aria-label="Expand main sidebar"
        >
          <ChevronsRight size={18} />
        </button>
        <span className="font-semibold text-[var(--color-card-foreground,var(--midground-base))]">{title}</span>
      </div>
      <div className="p-3">
        {groups.map(group => <div key={group.label} className="mb-4 last:mb-0"><p className="mb-2 text-[10px] uppercase tracking-widest text-[#718b82]">{group.label}</p>{group.items.map(item => <Link key={item.id} to={`${basePath}/${encodeURIComponent(item.id)}`} className={`${selected === item.id ? 'bg-[#2a5558] text-white' : 'text-[#b3c4bb] hover:bg-white/5'} mb-1 flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm`}>{kind === 'agents' ? agentIcon(item as SubpolarAgent) : <Zap size={16} />}<span className="truncate">{item.name}</span></Link>)}</div>)}
        {groups.length === 0 && <p className="text-xs text-[#829b92]">No automations yet.</p>}
      </div>
    </aside>
  )
}

function Gallery({
  view,
  agents: agentList,
  automations: automationList,
  projects,
  createTo
}: {
  view: 'agents' | 'automations'
  agents: readonly SubpolarAgent[]
  automations: readonly SubpolarAutomation[]
  projects: readonly SubpolarProject[]
  createTo: string
}) {
  const isAgents = view === 'agents'
  const cards = isAgents ? agentList : automationList
  const groups = isAgents
    ? [{ label: 'Default', items: cards }]
    : [
        { label: 'Global', items: automationList.filter(automation => automation.projectId === undefined) },
        ...projects.map(project => ({ label: project.name, items: automationList.filter(automation => automation.projectId === project.id) }))
      ].filter(group => group.items.length > 0)
  return (
    <section className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-8">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[.18em] text-[#70d7cc]">Workspace</p>
          <h1 className="mt-1 text-3xl font-semibold">{isAgents ? 'Agents' : 'Scheduled tasks'}</h1>
          <p className="mt-2 text-sm text-[#829b92]">Choose one to open its dedicated workspace.</p>
        </div>
        <Link to={createTo} className="rounded-lg bg-[#a9ddd5] px-4 py-2 text-sm font-semibold text-[#102627]">
          <Plus className="mr-1 inline" size={15} /> Create
        </Link>
      </div>
      {groups.map(group => <div key={group.label} className="mb-8 last:mb-0"><p className="mb-3 text-xs uppercase tracking-widest text-[#829b92]">{group.label}</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{group.items.map(item => <Link key={item.id} to={`/${isAgents ? 'agents' : 'automations'}/${encodeURIComponent(item.id)}`} className="group min-h-36 rounded-xl border border-white/10 bg-[#102627] p-5 text-left transition hover:-translate-y-0.5 hover:border-[#70d7cc]/50"><div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-[#1d4142] text-[#70d7cc]">{isAgents ? agentIcon(item as SubpolarAgent) : <CalendarClock size={20} />}</div><h2 className="font-semibold group-hover:text-[#a9ddd5]">{item.name}</h2><p className="mt-1 text-xs leading-5 text-[#829b92]">{'instructions' in item ? item.instructions || 'Custom workspace agent' : item.prompt || 'Scheduled Agent run'}</p></Link>)}</div></div>)}
      {cards.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/15 p-10 text-center text-sm text-[#829b92]">
          No {isAgents ? 'agents' : 'automations'} yet.
        </div>
      )}
    </section>
  )
}

function AutomationDetail({ automation, agentList, projectList, onSaved, onDelete }: { automation: SubpolarAutomation; agentList: readonly SubpolarAgent[]; projectList: readonly SubpolarProject[]; onSaved: (automation: SubpolarAutomation) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(automation)
  const [runs, setRuns] = useState<readonly SubpolarAutomationRun[]>([])
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [expression, setExpression] = useState(automation.schedule.kind === 'cron' ? automation.schedule.expression : '')
  useEffect(() => {
    setDraft(automation)
    setExpression(automation.schedule.kind === 'cron' ? automation.schedule.expression : '')
    void automationRuns(automation.id).then(result => setRuns(result.runs)).catch(() => setRuns([]))
  }, [automation])
  const save = async () => {
    setBusy(true)
    try {
      const result = await updateAutomation(automation.id, {
        name: draft.name,
        enabled: draft.enabled,
        prompt: draft.prompt,
        agentId: draft.agentId,
        projectId: draft.projectId ?? null,
        model: draft.model ?? null,
        permissionMode: draft.permissionMode,
        schedule: { kind: 'cron', expression: expression.trim(), timezone: draft.schedule.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone }
      })
      setDraft(result.automation)
      onSaved(result.automation)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1800)
      void automationRuns(automation.id).then(result => setRuns(result.runs)).catch(() => undefined)
    } finally { setBusy(false) }
  }
  return <main className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-8"><div className="mx-auto max-w-4xl">
    <div className="mb-8 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1d4142] text-[#70d7cc]"><CalendarClock /></div><div><p className="text-xs uppercase tracking-widest text-[#70d7cc]">Scheduled automation</p><h1 className="text-2xl font-semibold">{draft.name}</h1></div></div><button className="rounded border border-red-300/30 px-3 py-2 text-xs text-red-200" onClick={() => { if (window.confirm('Delete this automation?')) void deleteAutomation(automation.id).then(onDelete) }}>Delete</button></div>
    {saved && <p className="mb-4 text-sm text-[#70d7cc]">Saved</p>}
    <div className="grid gap-5">
      <section className="rounded-xl border border-white/10 bg-[#102627] p-5"><h2 className="mb-4 text-xs uppercase tracking-widest text-[#70d7cc]">Automation</h2><div className="grid gap-3 sm:grid-cols-2"><input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className="rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2" placeholder="Name" /><label className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} /> Enabled</label></div></section>
      <section className="rounded-xl border border-white/10 bg-[#102627] p-5"><h2 className="mb-4 text-xs uppercase tracking-widest text-[#70d7cc]">Schedule</h2><div className="grid gap-3 sm:grid-cols-2"><input value={expression} onChange={event => setExpression(event.target.value)} className="rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2 font-mono" placeholder="0 8 * * *" /><input value={draft.schedule.timezone} onChange={event => setDraft({ ...draft, schedule: { kind: 'cron', expression, timezone: event.target.value } })} className="rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2" placeholder="Europe/Berlin" /></div><p className="mt-2 text-xs text-[#829b92]">Five-field cron: minute hour day-of-month month day-of-week. Examples: <button className="underline" onClick={() => setExpression('0 8 * * *')}>daily at 08:00</button>, <button className="underline" onClick={() => setExpression('0 9 * * 1')}>Mondays at 09:00</button>, <button className="underline" onClick={() => setExpression('0 */6 * * *')}>every 6 hours</button>.</p></section>
      <section className="rounded-xl border border-white/10 bg-[#102627] p-5"><h2 className="mb-4 text-xs uppercase tracking-widest text-[#70d7cc]">Execution</h2><div className="grid gap-3 sm:grid-cols-2"><select value={draft.agentId} onChange={event => setDraft({ ...draft, agentId: event.target.value })} className="rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2"><option value="">Choose agent</option>{agentList.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select><select value={draft.projectId ?? ''} onChange={event => setDraft({ ...draft, projectId: event.target.value || undefined })} className="rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2"><option value="">Global (no project)</option>{projectList.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select><input value={draft.model ?? ''} onChange={event => setDraft({ ...draft, model: event.target.value || undefined })} className="rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2" placeholder="Agent model default" /><select value={draft.permissionMode} onChange={event => setDraft({ ...draft, permissionMode: event.target.value as SubpolarAutomation['permissionMode'] })} className="rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2"><option value="read-only">Read-only</option><option value="pre-approved">Pre-approved configured permissions</option><option value="fail">Fail when approval is required</option></select></div><textarea value={draft.prompt} onChange={event => setDraft({ ...draft, prompt: event.target.value })} className="mt-3 min-h-40 w-full rounded-lg border border-white/10 bg-[#091d1e] p-3" placeholder="Prompt sent to the Agent" /></section>
      <button disabled={busy} onClick={() => void save()} className="rounded-lg bg-[#a9ddd5] px-4 py-2 text-sm font-semibold text-[#102627] disabled:opacity-50">{busy ? 'Saving…' : 'Save automation'}</button>
      <section className="rounded-xl border border-white/10 bg-[#102627] p-5"><h2 className="mb-4 text-xs uppercase tracking-widest text-[#70d7cc]">Run history</h2>{runs.length === 0 ? <p className="text-sm text-[#829b92]">No runs yet.</p> : <div className="space-y-2">{runs.map(run => <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 p-3 text-sm"><span className="capitalize">{run.status.replace('_', ' ')}</span><span className="text-xs text-[#829b92]">{new Date(run.scheduledFor).toLocaleString()}</span>{run.sessionId && <Link className="text-xs text-[#70d7cc] underline" to={`/chat/${encodeURIComponent(run.sessionId)}`}>Open session</Link>}{run.error && <p className="basis-full text-xs text-red-200">{run.error}</p>}</div>)}</div>}</section>
    </div>
  </div></main>
}

function Detail({ kind, name, agent, automation, automationAgents = [], projects = [], onAutomationSaved, onAutomationDelete, inventory = [], skillInventory = [] }: { kind: 'agent' | 'automation'; name: string; agent?: SubpolarAgent; automation?: SubpolarAutomation; automationAgents?: readonly SubpolarAgent[]; projects?: readonly SubpolarProject[]; onAutomationSaved?: (automation: SubpolarAutomation) => void; onAutomationDelete?: () => void; inventory?: readonly SubpolarCapability[]; skillInventory?: readonly SubpolarSkill[] }) {
  const [draft, setDraft] = useState(agent)
  const [saved, setSaved] = useState(false)
  useEffect(() => setDraft(agent), [agent?.id])
  if (kind === 'automation' && automation !== undefined && onAutomationSaved !== undefined && onAutomationDelete !== undefined) return <AutomationDetail automation={automation} agentList={automationAgents} projectList={projects} onSaved={onAutomationSaved} onDelete={onAutomationDelete} />
  if (kind === 'agent' && draft !== undefined) {
    const rows = [...inventory.filter(item => !draft.capabilities.some(capability => capability.capabilityId === item.capabilityId)), ...draft.capabilities.map(item => { const meta = inventory.find(candidate => candidate.capabilityId === item.capabilityId); return { ...meta, ...item, name: meta?.name ?? item.capabilityId, description: meta?.description ?? '', source: meta?.source ?? 'other', capabilities: meta?.capabilities ?? [], defaultPolicy: meta?.defaultPolicy ?? 'deny' as const } })]
    const enabled = new Set(draft.capabilities.filter(item => item.enabled).map(item => item.capabilityId))
    const inventoryPolicy = new Map(inventory.map(item => [item.capabilityId, item.defaultPolicy]))
    const policy = (id: string) => draft.permissions.find(item => item.capabilityId === id)?.policy ?? inventoryPolicy.get(id) ?? 'deny'
    const capabilityMutating = (capability: SubpolarCapability): boolean | undefined => {
      const metadata = capability.capabilities
      if (!Array.isArray(metadata)) {
        const objectMetadata = metadata as Record<string, unknown>
        if (typeof objectMetadata.mutating === 'boolean') return objectMetadata.mutating
      }
      if (Array.isArray(capability.capabilities) && capability.capabilities.includes('mutating')) return true
      return undefined
    }
    const groups = [...rows.reduce((result, item) => {
      const key = item.integrationId === undefined ? `builtin:${item.source}` : `${item.integrationType ?? 'integration'}:${item.integrationId}`
      const existing = result.get(key)
      if (existing === undefined) result.set(key, { title: item.integrationName ?? (item.integrationType === undefined ? 'Built-in' : item.integrationType.toUpperCase()), rows: [item] })
      else existing.rows.push(item)
      return result
    }, new Map<string, { title: string; rows: SubpolarCapability[] }>()).values()]
    const setBulkPolicy = (mutatingSelection: boolean, value: 'allow' | 'ask') => {
      const ids = draft.capabilities.filter(item => item.enabled).map(item => item.capabilityId).filter(id => {
        const capability = rows.find(candidate => candidate.capabilityId === id)
        return capability !== undefined && capabilityMutating(capability) === mutatingSelection
      })
      const next = [...draft.permissions.filter(item => !ids.includes(item.capabilityId)), ...ids.map(capabilityId => ({ capabilityId, policy: value }))]
      setDraft({ ...draft, permissions: next })
      void save({ permissions: next })
    }
    const save = async (changes: SubpolarAgentUpdate) => {
      const result = await updateAgent(draft.id, changes)
      setDraft(result.agent)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1800)
    }
    return (
      <main className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1d4142] text-[#70d7cc]">{agentIcon(draft)}</div><div><p className="text-xs uppercase tracking-widest text-[#70d7cc]">Agent</p><h1 className="text-2xl font-semibold">{draft.name}</h1></div></div>
          {saved && <p className="mb-4 text-sm text-[#70d7cc]">Saved</p>}
          <div className="grid gap-5">
            <section className="rounded-xl border border-white/10 bg-[#102627] p-5"><h2 className="mb-4 text-xs uppercase tracking-widest text-[#70d7cc]">General</h2><div className="grid gap-3 sm:grid-cols-2"><input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} onBlur={() => void save({ name: draft.name })} className="rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2" placeholder="Name" /><input value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} onBlur={() => void save({ description: draft.description })} className="rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2" placeholder="Description" /></div></section>
            <section className="rounded-xl border border-white/10 bg-[#102627] p-5"><h2 className="mb-4 text-xs uppercase tracking-widest text-[#70d7cc]">Instructions</h2><textarea value={draft.instructions} onChange={event => setDraft({ ...draft, instructions: event.target.value })} onBlur={() => void save({ instructions: draft.instructions })} className="min-h-40 w-full rounded-lg border border-white/10 bg-[#091d1e] p-3" /></section>
            <section className="rounded-xl border border-white/10 bg-[#102627] p-5"><h2 className="mb-4 text-xs uppercase tracking-widest text-[#70d7cc]">Model</h2><div className="grid gap-3 sm:grid-cols-2"><input value={draft.model ?? ''} onChange={event => setDraft({ ...draft, model: event.target.value })} onBlur={() => void save({ model: draft.model?.trim() || null })} className="rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2" placeholder="Conversation default" /><select value={draft.reasoningEffort ?? ''} onChange={event => { const value = event.target.value || null; setDraft({ ...draft, reasoningEffort: value ?? undefined }); void save({ reasoningEffort: value }) }} className="rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2"><option value="">Default reasoning</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div><p className="mt-2 text-xs text-[#829b92]">A conversation can temporarily choose another model.</p></section>
            <section className="rounded-xl border border-white/10 bg-[#102627] p-5"><h2 className="mb-4 text-xs uppercase tracking-widest text-[#70d7cc]">Tools & permissions</h2><p className="mb-3 text-xs text-[#829b92]">Capabilities are references to server-exposed tools; integration setup stays elsewhere.</p><div className="mb-3 flex gap-2"><button className="rounded border border-white/15 px-2 py-1 text-xs" onClick={() => setBulkPolicy(false, 'allow')}>Set reads Allow</button><button className="rounded border border-white/15 px-2 py-1 text-xs" onClick={() => setBulkPolicy(true, 'ask')}>Set writes Ask</button></div>{groups.map(group => <div key={group.title} className="mb-4"><p className="mb-2 text-xs uppercase tracking-widest text-[#829b92]">{group.title}</p><div className="grid gap-2">{group.rows.map(capability => <div key={capability.capabilityId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-3"><div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled.has(capability.capabilityId)} onChange={event => { const next = [...draft.capabilities.filter(item => item.capabilityId !== capability.capabilityId), { capabilityId: capability.capabilityId, enabled: event.target.checked }]; const permissions = event.target.checked && !draft.permissions.some(item => item.capabilityId === capability.capabilityId) ? [...draft.permissions, { capabilityId: capability.capabilityId, policy: capability.defaultPolicy }] : draft.permissions; setDraft({ ...draft, capabilities: next, permissions }); void save({ capabilities: next, permissions }) }} />{capability.displayName ?? capability.name}</label><p className="ml-6 text-xs text-[#829b92]">{capability.nativeName ?? capability.capabilityId} · {capability.description}</p></div>{enabled.has(capability.capabilityId) && <select value={policy(capability.capabilityId)} onChange={event => { const next = [...draft.permissions.filter(item => item.capabilityId !== capability.capabilityId), { capabilityId: capability.capabilityId, policy: event.target.value as 'allow' | 'ask' | 'deny' }]; setDraft({ ...draft, permissions: next }); void save({ permissions: next }) }} className="rounded border border-white/10 bg-[#091d1e] px-2 py-1 text-xs"><option value="allow">Allow</option><option value="ask">Ask</option><option value="deny">Deny</option></select>}</div>)}</div></div>)}</section>
            <AgentSkillPicker skills={skillInventory} assignedIds={draft.skillIds} onChange={skillIds => { setDraft({ ...draft, skillIds }); void save({ skillIds }) }} />
          </div>
        </div>
      </main>
    )
  }
  return (
    <main className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1d4142] text-[#70d7cc]">
            {kind === 'agent' ? agentIcon(agent) : <CalendarClock />}
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-[#70d7cc]">
              {kind === 'agent' ? 'Agent' : 'Scheduled task'}
            </p>
            <h1 className="text-2xl font-semibold">{name}</h1>
          </div>
        </div>
        <div className="grid gap-5">
          <section>
            <p className="mb-2 text-xs uppercase tracking-widest text-[#829b92]">
              {kind === 'agent' ? 'Instructions' : 'Triggers and instructions'}
            </p>
            <textarea
              readOnly
              value={
                agent?.instructions ?? 'Runs on schedule. Configure prompt, agent, workspace, and permissions here.'
              }
              className="min-h-48 w-full resize-none rounded-xl border border-white/10 bg-[#102627] p-4 text-sm leading-6 outline-none"
            />
          </section>
          <section>
            <p className="mb-2 text-xs uppercase tracking-widest text-[#829b92]">Tools</p>
            <div className="rounded-xl border border-white/10 bg-[#102627] p-4 text-sm text-[#829b92]">
              No tools configured
            </div>
          </section>
          <section>
            <p className="mb-2 text-xs uppercase tracking-widest text-[#829b92]">Skills</p>
            <div className="rounded-xl border border-white/10 bg-[#102627] p-4 text-sm text-[#829b92]">
              Project defaults
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function ProjectOverview({
  projects: projectList,
  selectedProject
}: {
  projects: readonly SubpolarProject[]
  selectedProject: string
}) {
  const project = projectList.find(item => item.id === selectedProject)
  return (
    <main className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-[.18em] text-[#70d7cc]">Workspace</p>
            <h1 className="mt-1 text-3xl font-semibold">{project?.name ?? 'Projects'}</h1>
            <p className="mt-2 text-sm text-[#829b92]">Choose a project context for chats, agents, and automations.</p>
          </div>
          <Link to="/projects/new" className="rounded-lg bg-[#a9ddd5] px-4 py-2 text-sm font-semibold text-[#102627]">
            <Plus className="mr-1 inline" size={15} /> Create
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {projectList.map(item => (
            <Link
              key={item.id}
              to={`/projects/${encodeURIComponent(item.id)}`}
              className="rounded-xl border border-white/10 bg-[#102627] p-5 transition hover:border-[#70d7cc]/50"
            >
              <h2 className="font-semibold">{item.name}</h2>
              <p className="mt-2 text-xs text-[#829b92]">Created {new Date(item.createdAt).toLocaleDateString()}</p>
              <span className="mt-5 inline-block text-xs text-[#70d7cc]">Open project</span>
            </Link>
          ))}
        </div>
        {project !== undefined && <SourceControl project={project} />}
        {projectList.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/15 p-10 text-center text-sm text-[#829b92]">
            No projects yet.
          </p>
        )}
      </div>
    </main>
  )
}

function SourceControl({ project }: { project: SubpolarProject }) {
  const [status, setStatus] = useState<SubpolarGitStatus | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | undefined>()
  const [diff, setDiff] = useState('')
  useEffect(() => { void gitStatus(project.id).then(setStatus).catch(() => setStatus(null)) }, [project.id])
  useEffect(() => { if (selectedPath !== undefined) void gitDiff(project.id, selectedPath).then(result => setDiff(result.diff)).catch(() => setDiff('')) }, [project.id, selectedPath])
  if (status === null) return null
  return <section className="mt-6 rounded-xl border border-white/10 bg-[#102627] p-5"><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-widest text-[#70d7cc]">Source control</p><p className="mt-1 text-sm text-[#829b92]">{status.branch} · {status.clean ? 'Working tree clean' : `${status.entries.length} changed file${status.entries.length === 1 ? '' : 's'}`}</p></div><FolderGit2 size={20} className="text-[#70d7cc]" /></div>{!status.clean && <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,14rem)_1fr]"><div className="space-y-1">{status.entries.map(entry => <button key={entry.path} onClick={() => setSelectedPath(entry.path)} className={`${selectedPath === entry.path ? 'bg-[#2a5558] text-white' : 'text-[#b3c4bb] hover:bg-white/5'} flex w-full items-center justify-between rounded px-2 py-2 text-left text-xs`}><span className="truncate">{entry.path}</span><span className={entry.deleted ? 'text-red-300' : entry.added ? 'text-[#70d7cc]' : 'text-amber-200'}>{entry.status}</span></button>)}</div><pre className="max-h-80 min-h-32 overflow-auto rounded bg-[#091d1e] p-3 text-xs leading-5 text-[#b8d2c8]">{diff || 'Select a changed file to view its diff.'}</pre></div>}</section>
}

function ProjectPrompt({
  projects: projectList,
  selectedProject,
  setProject,
  disabled
}: {
  projects: readonly SubpolarProject[]
  selectedProject: string
  setProject: (id: string) => void
  disabled: boolean
}) {
  const project = projectList.find(item => item.id === selectedProject)
  return (
    <div className="mb-3 flex items-center justify-center gap-2 px-2 text-center text-sm text-[var(--color-muted-foreground,var(--midground-base))]">
      <span>{project === undefined ? 'What do you want to work on?' : 'What do you want to work on in'}</span>
      <Select
        value={project?.id ?? 'none'}
        onValueChange={value => setProject(value === 'none' ? '' : value)}
        disabled={disabled}
      >
        {project === undefined ? (
          <SelectTrigger
            aria-label="Select project"
            className="!h-8 !w-8 shrink-0 justify-center rounded-full border-0 bg-[color-mix(in_srgb,var(--midground-base)_10%,transparent)] p-0 [&>svg:last-child]:hidden"
          >
            <FolderPlus size={16} />
          </SelectTrigger>
        ) : (
          <SelectTrigger className="!inline-flex !h-auto !w-auto min-w-0 border-0 bg-transparent p-0 text-sm">
            <SelectValue className="underline decoration-[color-mix(in_srgb,var(--midground-base)_55%,transparent)] underline-offset-4" />
          </SelectTrigger>
        )}
        <SelectContent>
          <SelectItem value="none">No project</SelectItem>
          {projectList.map(item => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {project !== undefined && <span>?</span>}
    </div>
  )
}

function Chat({
  messages,
  draft,
  setDraft,
  model,
  setModel,
  modelProviders,
  effort,
  setEffort,
  permission,
  setPermission,
  agents: agentList,
  agent,
  setAgent,
  projects: projectList,
  selectedProject,
  setProject,
  streaming,
  onSend,
  onCancel,
  commandInventory
}: {
  messages: readonly ChatMessage[]
  draft: string
  setDraft: (v: string) => void
  model: string
  setModel: (v: string) => void
  modelProviders: readonly SubpolarModelProvider[]
  effort: string
  setEffort: (v: string) => void
  permission: string
  setPermission: (v: string) => void
  agents: readonly SubpolarAgent[]
  agent: string
  setAgent: (v: string) => void
  projects: readonly SubpolarProject[]
  selectedProject: string
  setProject: (id: string) => void
  streaming: boolean
  onSend: () => void
  onCancel: () => void
  commandInventory: readonly SubpolarPromptCommand[]
}) {
  const control =
    'max-w-[11rem] appearance-none bg-transparent pr-5 text-xs font-medium text-[var(--color-muted-foreground,var(--midground-base))] outline-none disabled:opacity-50'
  return (
    <section className={`flex min-h-0 flex-1 flex-col ${messages.length === 0 ? 'justify-center' : ''}`}>
      {messages.length > 0 && (
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.map((message, index) => (
              <article
                key={`${message.sequence ?? index}-${message.role}`}
                className={
                  message.role === 'user'
                    ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--color-primary,var(--midground-base))] px-4 py-3 text-sm text-[var(--color-primary-foreground,var(--background-base))]'
                    : 'max-w-[90%] rounded-2xl rounded-bl-sm border border-[color-mix(in_srgb,var(--midground-base)_16%,transparent)] bg-[var(--color-card,var(--background-base))] px-4 py-3 text-sm leading-7'
                }
              >
                <div className="mb-1 text-[10px] uppercase tracking-widest opacity-60">{message.role}</div>
                <div className="whitespace-pre-wrap">{messageText(message)}</div>
              </article>
            ))}
          </div>
        </div>
      )}
      <div className={`${messages.length === 0 ? '' : 'bg-[var(--background-base)]'} px-3 pb-3 sm:px-6 sm:pb-5`}>
        {messages.length === 0 && (
          <div className="mx-auto max-w-4xl">
            <ProjectPrompt
              projects={projectList}
              selectedProject={selectedProject}
              setProject={setProject}
              disabled={streaming}
            />
          </div>
        )}
        <div className="mx-auto max-w-4xl rounded-[1.35rem] border border-[color-mix(in_srgb,var(--midground-base)_16%,transparent)] bg-[var(--color-card,var(--background-base))] p-3 shadow-2xl shadow-black/30">
          <PromptCommandComposer draft={draft} setDraft={setDraft} commands={commandInventory} disabled={streaming} onSubmit={onSend} />
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <div className="relative flex items-center gap-1.5 border-r border-[color-mix(in_srgb,var(--midground-base)_16%,transparent)] pr-3">
              <select
                aria-label="Model"
                value={model}
                onChange={event => setModel(event.target.value)}
                disabled={streaming}
                className={control}
              >
                <option value="default">Default model</option>
                {modelProviders.map(provider => (
                  <optgroup key={provider.id} label={provider.id}>
                    {provider.models.map(option => (
                      <option key={`${provider.id}:${option.id}`} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3" size={12} />
            </div>
            <div className="relative border-r border-[color-mix(in_srgb,var(--midground-base)_16%,transparent)] pr-3">
              <select
                aria-label="Model effort"
                value={effort}
                onChange={event => setEffort(event.target.value)}
                disabled={streaming}
                className={control}
              >
                <option value="">Default effort</option>
                <option value="low">Low effort</option>
                <option value="medium">Medium effort</option>
                <option value="high">High effort</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1" size={12} />
            </div>
            <div className="relative flex items-center gap-1.5 border-r border-[color-mix(in_srgb,var(--midground-base)_16%,transparent)] pr-3">
              <Bot size={14} />
              <select
                aria-label="Agent"
                value={agent}
                onChange={event => setAgent(event.target.value)}
                disabled={streaming}
                className={control}
              >
                <option value="">Default agent</option>
                {agentList.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3" size={12} />
            </div>
            <div className="relative flex items-center gap-1.5">
              <ShieldCheck size={14} />
              <select
                aria-label="Permission"
                value={permission}
                onChange={event => setPermission(event.target.value)}
                disabled={streaming}
                className={control}
              >
                <option value="full">Full access</option>
                <option value="ask">Ask before tools</option>
                <option value="read">Read only</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-0" size={12} />
            </div>
            <button
              onClick={streaming ? onCancel : onSend}
              disabled={!streaming && !draft.trim()}
              className="ml-auto rounded-full bg-[var(--color-primary,var(--midground-base))] p-2.5 text-[var(--color-primary-foreground,var(--background-base))] disabled:opacity-40"
            >
              {streaming ? <Square size={16} /> : <Send size={16} />}
            </button>
          </div>
        </div>
        <div className="mx-auto mt-2 flex max-w-4xl items-center justify-between px-2 text-[11px] text-[var(--color-muted-foreground,var(--midground-base))]">
          <span className="flex items-center gap-1">
            <FolderGit2 size={12} /> Local checkout
          </span>
          <span>
            main <ChevronDown className="inline" size={11} />
          </span>
        </div>
      </div>
    </section>
  )
}

type WorkspaceRoute = {
  view: WorkspaceView
  projectId?: string
  agentId?: string
  automationId?: string
  sessionId?: string
  create: 'project' | 'agent' | 'automation' | null
}

function routeSegment(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function sessionHref(session: SubpolarSession): string {
  const params = new URLSearchParams()
  if (session.projectId !== undefined) params.set('projectId', session.projectId)
  if (session.agentId !== undefined) params.set('agentId', session.agentId)
  const query = params.toString()
  return `/chat/${encodeURIComponent(session.sessionId)}${query ? `?${query}` : ''}`
}

function workspaceRoute(pathname: string): WorkspaceRoute {
  const parts = pathname.split('/').filter(Boolean)
  const section = parts[0]
  if (section === 'chat')
    return { view: 'chat', sessionId: parts[1] === 'new' ? undefined : routeSegment(parts[1]), create: null }
  if (section === 'projects') {
    if (parts[1] === 'new') return { view: 'projects', create: 'project' }
    if (parts[3] === 'new') return { view: 'agents', projectId: routeSegment(parts[1]), create: 'agent' }
    return { view: 'projects', projectId: routeSegment(parts[1]), create: null }
  }
  if (section === 'agents') return { view: 'agents', agentId: routeSegment(parts[1]), create: null }
  if (section === 'automations') return { view: 'automations', automationId: parts[1] === 'new' ? undefined : routeSegment(parts[1]), create: parts[1] === 'new' ? 'automation' : null }
  return { view: section === 'apps' ? 'apps' : 'chat', create: null }
}

export default function WorkspacePage({ user, onLogout }: { user: SubpolarUser; onLogout: () => void }) {
  const location = useLocation()
  const routerNavigate = useNavigate()
  const [projectList, setProjectList] = useState<readonly SubpolarProject[]>([]),
    [agentList, setAgentList] = useState<readonly SubpolarAgent[]>([]),
    [automationList, setAutomationList] = useState<readonly SubpolarAutomation[]>([]),
    [sessionList, setSessionList] = useState<readonly SubpolarSession[]>([]),
    [capabilityInventory, setCapabilityInventory] = useState<readonly SubpolarCapability[]>([])
  const [skillInventory, setSkillInventory] = useState<readonly SubpolarSkill[]>([])
  const [gitCredentialList, setGitCredentialList] = useState<readonly SubpolarGitCredential[]>([])
  const [commandInventory, setCommandInventory] = useState<readonly SubpolarPromptCommand[]>([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false),
    [mobileOpen, setMobileOpen] = useState(false),
    [messages, setMessages] = useState<readonly ChatMessage[]>([]),
    [draft, setDraft] = useState(''),
    [model, setModel] = useState('default'),
    [modelProviders, setModelProviders] = useState<readonly SubpolarModelProvider[]>([]),
    [effort, setEffort] = useState<'' | 'low' | 'medium' | 'high'>(''),
    [permission, setPermission] = useState('full'),
    [streaming, setStreaming] = useState(false),
    [error, setError] = useState<string | null>(null)
  const [permissionRequest, setPermissionRequest] = useState<{ requestId: string; callId: string; tool: string; arguments: string } | null>(null)
  const [newName, setNewName] = useState(''),
    [newDescription, setNewDescription] = useState(''),
    [newWorkspaceMode, setNewWorkspaceMode] = useState<'create' | 'existing' | 'clone'>('create'),
    [newWorkspacePath, setNewWorkspacePath] = useState(''),
    [newRepositoryUrl, setNewRepositoryUrl] = useState(''),
    [newRemoteName, setNewRemoteName] = useState('origin'),
    [newDefaultBranch, setNewDefaultBranch] = useState(''),
    [newCredentialId, setNewCredentialId] = useState(''),
    [newInstructions, setNewInstructions] = useState(''),
    [newIcon, setNewIcon] = useState<IconName | ''>(''),
    [newSchedule, setNewSchedule] = useState('0 8 * * *'),
    [newTimezone, setNewTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    [newAutomationPrompt, setNewAutomationPrompt] = useState(''),
    [newAutomationAgentId, setNewAutomationAgentId] = useState(''),
    [newAutomationProjectId, setNewAutomationProjectId] = useState(''),
    [newAutomationModel, setNewAutomationModel] = useState(''),
    [newAutomationPermission, setNewAutomationPermission] = useState<SubpolarAutomation['permissionMode']>('fail')
  const route = useMemo(() => workspaceRoute(location.pathname), [location.pathname])
  const query = useMemo(() => new URLSearchParams(location.search), [location.search])
  const queryProjectId = query.get('projectId') ?? undefined
  const view = route.view
  const selectedProject =
    route.projectId ??
    (query.has('projectId') ? (queryProjectId ?? '') : view === 'projects' ? '' : (projectList[0]?.id ?? ''))
  const selectedAgent = route.agentId ?? query.get('agentId') ?? ''
  const selectedAutomation = route.automationId ?? ''
  const selectedSession = route.sessionId ?? null
  const modal = route.create
  const clientRef = useRef<SubpolarWebSocketClient | null>(null),
    requestRef = useRef<string | null>(null),
    newSessionRef = useRef(new Set<string>())

  function setProject(id: string): void {
    routerNavigate(id ? `/chat/new?projectId=${encodeURIComponent(id)}` : '/chat/new?projectId=')
  }
  function setSession(id: string | null): void {
    if (!id) {
      routerNavigate('/chat/new')
      return
    }
    const params = new URLSearchParams(location.search)
    if (selectedProject) params.set('projectId', selectedProject)
    routerNavigate(`/chat/${encodeURIComponent(id)}${params.toString() ? `?${params.toString()}` : ''}`)
  }
  function setAgent(id: string): void {
    const params = new URLSearchParams(location.search)
    if (selectedProject) params.set('projectId', selectedProject)
    if (id) params.set('agentId', id)
    else params.delete('agentId')
    const base = selectedSession ? `/chat/${encodeURIComponent(selectedSession)}` : '/chat/new'
    routerNavigate(`${base}?${params.toString()}`)
  }
  function closeModal(): void {
    routerNavigate(-1)
  }

  useEffect(() => {
    if (modal === null) return
    setNewName('')
    setNewDescription('')
    setNewWorkspaceMode('create')
    setNewWorkspacePath('')
    setNewRepositoryUrl('')
    setNewDefaultBranch('')
    setNewCredentialId('')
    setNewInstructions('')
    setNewIcon('')
    setNewSchedule('0 8 * * *')
    setNewTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    setNewAutomationPrompt('')
    setNewAutomationAgentId(agentList[0]?.id ?? '')
    setNewAutomationProjectId(selectedProject)
    setNewAutomationModel('')
    setNewAutomationPermission('fail')
  }, [modal])
  async function refreshSessions() {
    try {
      setSessionList((await sessions()).sessions)
    } catch {
      /* ignored */
    }
  }
  useEffect(() => {
    void Promise.all([projects(), sessions(), automations()])
      .then(([projectResult, sessionResult, automationResult]) => {
        setProjectList(projectResult.projects)
        setSessionList(sessionResult.sessions)
        setAutomationList(automationResult.automations)
      })
      .catch(() => setError('Could not load workspace.'))
  }, [])
  useEffect(() => {
    void availableModels()
      .then(result => setModelProviders(result.providers))
      .catch(() => setModelProviders([]))
  }, [])
  useEffect(() => {
    void capabilities().then(result => setCapabilityInventory(result.capabilities)).catch(() => setCapabilityInventory([]))
  }, [])
  useEffect(() => {
    void skills().then(result => setSkillInventory(result.skills)).catch(() => setSkillInventory([]))
    void promptCommands().then(result => setCommandInventory(result.commands)).catch(() => setCommandInventory([]))
    void gitCredentials().then(result => setGitCredentialList(result.credentials)).catch(() => setGitCredentialList([]))
  }, [])
  useEffect(() => {
    void modelDefaults()
      .then(result => setModel(result.conversation))
      .catch(() => undefined)
  }, [])
  useEffect(() => {
    const scope = view === 'automations' ? undefined :
      route.projectId ??
      queryProjectId ??
      (route.agentId === undefined && selectedProject ? selectedProject : undefined)
    void agents(scope)
      .then(result => setAgentList(result.agents))
      .catch(() => setAgentList([]))
  }, [route.agentId, route.projectId, queryProjectId, selectedProject, view])
  useEffect(() => {
    if (selectedSession === null) {
      setMessages([])
      return
    }
    if (newSessionRef.current.delete(selectedSession)) return
    void sessionTranscript(selectedSession)
      .then(result => setMessages(result.messages))
      .catch(() => setError('Could not load thread.'))
  }, [selectedSession])
  useEffect(() => () => clientRef.current?.close(), [])

  function handleEvent(requestId: string, event: SubpolarSocketEvent) {
    if (event.requestId !== undefined && event.requestId !== requestId) return
    const type = subpolarEventType(event)
    const eventPayload = record(event.event)
    const approvalPayload = record(eventPayload?.payload) ?? eventPayload
    if (approvalPayload !== undefined && (type === 'approval.request' || type === 'approval.requested') && typeof approvalPayload.call_id === 'string' && typeof approvalPayload.name === 'string') {
      setPermissionRequest({ requestId, callId: approvalPayload.call_id, tool: approvalPayload.name, arguments: typeof approvalPayload.arguments === 'string' ? approvalPayload.arguments : JSON.stringify(approvalPayload.arguments ?? {}) })
    }
    const activity = projectSubpolarActivity(event)
    if (activity !== undefined)
      setMessages(current => [
        ...current,
        {
          role: activity.kind,
          content: activity.text,
          ...(activity.sequence === undefined ? {} : { sequence: activity.sequence })
        }
      ])
    if (type === 'message.delta')
      setMessages(current =>
        current.map((message, index) =>
          index === current.findLastIndex(item => item.role === 'assistant')
            ? { ...message, content: `${messageText(message)}${eventText(event)}` }
            : message
        )
      )
    if (type === 'message.complete') {
      setPermissionRequest(null)
      setStreaming(false)
      requestRef.current = null
      void refreshSessions()
      clientRef.current?.close()
    }
    if (type === 'error') {
      setPermissionRequest(null)
      setStreaming(false)
      requestRef.current = null
      setError('Response could not be completed.')
      clientRef.current?.close()
    }
  }

  async function send() {
    const text = draft.trim()
    if (!text || streaming) return
    const requestId = randomId(),
      sessionId = selectedSession ?? randomId()
    if (!selectedSession) newSessionRef.current.add(sessionId)
    setSession(sessionId)
    setMessages(current => [...current, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    setDraft('')
    setStreaming(true)
    requestRef.current = requestId
    const client = new SubpolarWebSocketClient({
      onEvent: event => handleEvent(requestId, event),
      onClose: () => {
        if (requestRef.current === requestId) setStreaming(false)
      }
    })
    clientRef.current = client
    try {
      const outgoing: readonly ChatMessage[] = [...messages, { role: 'user', content: text }]
      await client.start({
        requestId,
        sessionId,
        model,
        messages: outgoing
          .filter(isPromptMessage)
          .map(message => ({ role: message.role, content: messageText(message) })),
        ...(selectedProject ? { projectId: selectedProject } : {}),
        ...(selectedAgent ? { agentId: selectedAgent } : {}),
        permissionMode: permission as 'full' | 'ask' | 'read-only',
        ...(effort === '' ? {} : { reasoningEffort: effort })
      })
    } catch {
      setStreaming(false)
      requestRef.current = null
      setError('Could not connect to agent.')
      client.close()
    }
  }

  async function submitModal(event: FormEvent) {
    event.preventDefault()
    try {
      if (modal === 'project') {
        const result = await createProjectFromInput({ name: newName.trim(), description: newDescription, instructions: newInstructions, workspaceMode: newWorkspaceMode, ...(newWorkspaceMode === 'existing' ? { workspacePath: newWorkspacePath } : {}), ...(newWorkspaceMode === 'clone' ? { repository: { url: newRepositoryUrl, remoteName: newRemoteName.trim() || 'origin', ...(newDefaultBranch.trim() ? { defaultBranch: newDefaultBranch.trim() } : {}), ...(newCredentialId ? { credentialId: newCredentialId } : {}) } } : {}) })
        setProjectList(projects => [...projects, result.project])
        routerNavigate(
          query.get('next') === 'agent'
            ? `/projects/${encodeURIComponent(result.project.id)}/agents/new`
            : `/projects/${encodeURIComponent(result.project.id)}`
        )
      } else if (modal === 'agent' && selectedProject && newIcon) {
        const result = await createAgent(selectedProject, newName.trim(), newInstructions, newIcon)
        setAgentList(agents => [...agents, result.agent])
        setSidebarCollapsed(true)
        routerNavigate(`/agents/${encodeURIComponent(result.agent.id)}`)
      } else if (modal === 'automation' && newAutomationAgentId) {
        const result = await createAutomation({ name: newName.trim(), enabled: true, schedule: { kind: 'cron', expression: newSchedule, timezone: newTimezone }, prompt: newAutomationPrompt, agentId: newAutomationAgentId, projectId: newAutomationProjectId || null, model: newAutomationModel || null, permissionMode: newAutomationPermission })
        setAutomationList(automations => [...automations, result.automation])
        setSidebarCollapsed(true)
        routerNavigate(`/automations/${encodeURIComponent(result.automation.id)}`)
      }
      setNewName('')
      setNewDescription('')
      setNewWorkspacePath('')
      setNewRepositoryUrl('')
      setNewRemoteName('origin')
      setNewDefaultBranch('')
      setNewCredentialId('')
      setNewInstructions('')
      setNewIcon('')
    } catch {
      setError(`Could not create ${modal}.`)
    }
  }

  const activeAgent = useMemo(() => agentList.find(agent => agent.id === selectedAgent), [agentList, selectedAgent])
  const activeAutomation = useMemo(() => automationList.find(automation => automation.id === selectedAutomation), [automationList, selectedAutomation])
  const detailOpen = (view === 'agents' && selectedAgent) || (view === 'automations' && selectedAutomation)
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background-base)] text-[var(--midground-base)]">
      {!sidebarCollapsed && (
        <GlobalSidebar
          user={user}
          projects={projectList}
          selectedProject={selectedProject}
          setProject={setProject}
          sessions={sessionList}
          selectedSession={selectedSession}
          open={mobileOpen}
          close={() => setMobileOpen(false)}
          logout={onLogout}
        />
      )}
      {detailOpen && (
        <CollectionSidebar
          kind={view as 'agents' | 'automations'}
          title={view === 'agents' ? 'Agents' : 'Scheduled'}
          items={view === 'agents' ? agentList : automationList}
          projects={projectList}
          selected={view === 'agents' ? selectedAgent : selectedAutomation}
          basePath={view === 'agents' ? '/agents' : '/automations'}
          onExpand={() => setSidebarCollapsed(false)}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {!(view === 'chat' && selectedSession === null) && (
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-[color-mix(in_srgb,var(--midground-base)_16%,transparent)] px-4 sm:px-6">
            <div className="flex items-center gap-3">
              {sidebarCollapsed && !detailOpen && (
                <button onClick={() => setSidebarCollapsed(false)}>
                  <ChevronsRight size={18} />
                </button>
              )}
              <button onClick={() => setMobileOpen(true)} className="lg:hidden">
                <Menu size={19} />
              </button>
              <div>
                <h1 className="font-semibold">
                  {view === 'chat'
                    ? selectedSession
                      ? 'Thread'
                      : 'New chat'
                    : view === 'agents'
                      ? (activeAgent?.name ?? 'Agents')
                      : view === 'automations'
                        ? (activeAutomation?.name ??
                          'Scheduled tasks')
                        : view === 'projects'
                          ? 'Projects'
                          : 'Apps'}
                </h1>
                {view === 'chat' && (
                  <p className="text-xs text-[var(--color-muted-foreground,var(--midground-base))]">
                    {activeAgent?.name ?? 'Default agent'}
                  </p>
                )}
              </div>
            </div>
            {!sidebarCollapsed && detailOpen && (
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="hidden text-[var(--color-muted-foreground,var(--midground-base))] lg:block"
                aria-label="Collapse main sidebar"
              >
                <ChevronsLeft size={18} />
              </button>
            )}
          </header>
        )}
        {error && (
          <div className="mx-5 mt-4 rounded border border-red-300/20 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
            <button onClick={() => setError(null)} className="ml-3 underline">
              dismiss
            </button>
          </div>
        )}
        {permissionRequest && clientRef.current && (
          <div className="mx-5 mt-4 rounded-xl border border-[#70d7cc]/40 bg-[#102627] p-4 shadow-lg"><p className="text-xs uppercase tracking-widest text-[#70d7cc]">Permission request</p><p className="mt-2 text-sm">Allow <span className="font-semibold">{permissionRequest.tool}</span> for this invocation?</p><pre className="mt-2 max-h-24 overflow-auto rounded bg-[#091d1e] p-2 text-xs text-[#b8d2c8]">{permissionRequest.arguments}</pre><div className="mt-3 flex gap-2"><button className="rounded bg-[#70d7cc] px-3 py-1.5 text-sm text-[#092021]" onClick={() => { void clientRef.current?.respondPermission(permissionRequest.requestId, permissionRequest.callId, 'allow'); setPermissionRequest(null) }}>Allow</button><button className="rounded border border-white/15 px-3 py-1.5 text-sm" onClick={() => { void clientRef.current?.respondPermission(permissionRequest.requestId, permissionRequest.callId, 'deny'); setPermissionRequest(null) }}>Deny</button></div></div>
        )}
        {view === 'chat' ? (
          <Chat
            messages={messages}
            draft={draft}
            setDraft={setDraft}
            model={model}
            setModel={setModel}
            modelProviders={modelProviders}
            effort={effort}
            setEffort={value => setEffort(value === '' || value === 'low' || value === 'medium' || value === 'high' ? value : '')}
            permission={permission}
            setPermission={setPermission}
            agents={agentList}
            agent={selectedAgent}
            setAgent={setAgent}
            projects={projectList}
            selectedProject={selectedProject}
            setProject={setProject}
            streaming={streaming}
            onSend={() => void send()}
            onCancel={() => {
              const id = requestRef.current
              if (id) void clientRef.current?.cancel(id)
            }}
            commandInventory={commandInventory}
          />
        ) : view === 'projects' ? (
          <ProjectOverview projects={projectList} selectedProject={selectedProject} />
        ) : view === 'apps' ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div>
              <AppWindow className="mx-auto mb-4 text-[#70d7cc]" size={38} />
              <h1 className="text-3xl font-semibold">Subpolar Apps</h1>
              <p className="mt-2 text-sm text-[#829b92]">
                Purpose-built project tools powered by your agents and automations.
              </p>
            </div>
          </div>
        ) : detailOpen ? (
          <Detail
            kind={view === 'agents' ? 'agent' : 'automation'}
            name={
              view === 'agents'
                ? (activeAgent?.name ?? 'Agent')
                : (activeAutomation?.name ?? 'Automation')
            }
            agent={activeAgent}
            automation={activeAutomation}
            automationAgents={agentList}
            projects={projectList}
            onAutomationSaved={updated => setAutomationList(items => items.map(item => item.id === updated.id ? updated : item))}
            onAutomationDelete={() => { setAutomationList(items => items.filter(item => item.id !== selectedAutomation)); routerNavigate('/automations') }}
            inventory={capabilityInventory}
            skillInventory={skillInventory}
          />
        ) : (
          <Gallery
            view={view}
            agents={agentList}
            automations={automationList}
            projects={projectList}
            createTo={
              view === 'agents'
                ? selectedProject
                  ? `/projects/${encodeURIComponent(selectedProject)}/agents/new`
                  : '/projects/new?next=agent'
                : '/automations/new'
            }
          />
        )}
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form onSubmit={submitModal} className="w-full max-w-md rounded-xl border border-white/10 bg-[#102627] p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Create {modal}</h2>
              <button type="button" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>
            <label className="mb-4 block text-xs uppercase tracking-widest text-[#829b92]">
              Name
              <input
                autoFocus
                required
                value={newName}
                onChange={event => setNewName(event.target.value)}
                className="mt-2 w-full rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 text-sm normal-case tracking-normal outline-none focus:border-[#70d7cc]"
              />
            </label>
            {modal === 'project' && <>
              <label className="mb-4 block text-xs uppercase tracking-widest text-[#829b92]">Description<input value={newDescription} onChange={event => setNewDescription(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 text-sm normal-case tracking-normal" /></label>
              <fieldset className="mb-4"><legend className="mb-2 text-xs uppercase tracking-widest text-[#829b92]">Workspace</legend><div className="grid gap-2 sm:grid-cols-3">{(['create', 'existing', 'clone'] as const).map(mode => <button type="button" key={mode} onClick={() => setNewWorkspaceMode(mode)} className={`${newWorkspaceMode === mode ? 'border-[#70d7cc] bg-[#1d4142]' : 'border-white/10'} rounded-lg border px-2 py-2 text-xs capitalize`}>{mode === 'create' ? 'Create empty' : mode === 'existing' ? 'Use existing' : 'Clone Git'}</button>)}</div></fieldset>
              {newWorkspaceMode === 'existing' && <label className="mb-4 block text-xs uppercase tracking-widest text-[#829b92]">Server workspace path<input required value={newWorkspacePath} onChange={event => setNewWorkspacePath(event.target.value)} placeholder="/data/workspaces/my-repo" className="mt-2 w-full rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 text-sm normal-case tracking-normal" /></label>}
              {newWorkspaceMode === 'clone' && <><label className="mb-4 block text-xs uppercase tracking-widest text-[#829b92]">Repository URL<input required value={newRepositoryUrl} onChange={event => setNewRepositoryUrl(event.target.value)} placeholder="https://git.example.com/team/project.git" className="mt-2 w-full rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 text-sm normal-case tracking-normal" /></label><label className="mb-4 block text-xs uppercase tracking-widest text-[#829b92]">Credential<select value={newCredentialId} onChange={event => setNewCredentialId(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 text-sm normal-case tracking-normal"><option value="">No credential</option>{gitCredentialList.map(item => <option key={item.id} value={item.id}>{item.name} · {item.provider}</option>)}</select></label><label className="mb-4 block text-xs uppercase tracking-widest text-[#829b92]">Remote name<input required value={newRemoteName} onChange={event => setNewRemoteName(event.target.value)} placeholder="origin" className="mt-2 w-full rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 text-sm normal-case tracking-normal" /></label><label className="mb-4 block text-xs uppercase tracking-widest text-[#829b92]">Default branch<input value={newDefaultBranch} onChange={event => setNewDefaultBranch(event.target.value)} placeholder="main" className="mt-2 w-full rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 text-sm normal-case tracking-normal" /></label></>}
              <label className="mb-5 block text-xs uppercase tracking-widest text-[#829b92]">Project instructions<textarea value={newInstructions} onChange={event => setNewInstructions(event.target.value)} rows={4} className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 text-sm normal-case tracking-normal" /></label>
            </>}
            {modal === 'agent' && (
              <>
                <fieldset className="mb-4">
                  <legend className="mb-2 text-xs uppercase tracking-widest text-[#829b92]">
                    Icon <span className="text-[#70d7cc]">required</span>
                  </legend>
                  <div className="grid grid-cols-6 gap-2">
                    {ICON_OPTIONS.map(icon => {
                      const Icon = ICONS[icon]
                      return (
                        <button
                          type="button"
                          key={icon}
                          title={icon}
                          aria-label={icon}
                          aria-pressed={newIcon === icon}
                          onClick={() => setNewIcon(icon)}
                          className={`${newIcon === icon ? 'border-[#70d7cc] bg-[#1d4142] text-[#70d7cc]' : 'border-white/10 text-[#829b92]'} flex aspect-square items-center justify-center rounded-lg border`}
                        >
                          <Icon size={19} />
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
                <label className="mb-5 block text-xs uppercase tracking-widest text-[#829b92]">
                  Instructions
                  <textarea
                    value={newInstructions}
                    onChange={event => setNewInstructions(event.target.value)}
                    rows={5}
                    className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 text-sm normal-case tracking-normal outline-none focus:border-[#70d7cc]"
                  />
                </label>
              </>
            )}
            {modal === 'automation' && (
              <>
                <label className="mb-4 block text-xs uppercase tracking-widest text-[#829b92]">Schedule<input required value={newSchedule} onChange={event => setNewSchedule(event.target.value)} placeholder="0 8 * * *" className="mt-2 w-full rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 font-mono text-sm normal-case tracking-normal" /><span className="mt-1 block normal-case tracking-normal">Daily 08:00: <code>0 8 * * *</code></span></label>
                <label className="mb-4 block text-xs uppercase tracking-widest text-[#829b92]">Timezone<input required value={newTimezone} onChange={event => setNewTimezone(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 text-sm normal-case tracking-normal" /></label>
                <div className="mb-4 grid gap-3 sm:grid-cols-2"><label className="block text-xs uppercase tracking-widest text-[#829b92]">Agent<select required value={newAutomationAgentId} onChange={event => setNewAutomationAgentId(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 text-sm normal-case tracking-normal"><option value="">Choose agent</option>{agentList.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label><label className="block text-xs uppercase tracking-widest text-[#829b92]">Project<select value={newAutomationProjectId} onChange={event => setNewAutomationProjectId(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 text-sm normal-case tracking-normal"><option value="">Global</option>{projectList.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div>
                <label className="mb-4 block text-xs uppercase tracking-widest text-[#829b92]">Permission mode<select value={newAutomationPermission} onChange={event => setNewAutomationPermission(event.target.value as SubpolarAutomation['permissionMode'])} className="mt-2 w-full rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 text-sm normal-case tracking-normal"><option value="read-only">Read-only</option><option value="pre-approved">Pre-approved configured permissions</option><option value="fail">Fail when approval is required</option></select></label>
                <label className="mb-4 block text-xs uppercase tracking-widest text-[#829b92]">Model override<input value={newAutomationModel} onChange={event => setNewAutomationModel(event.target.value)} placeholder="Agent default" className="mt-2 w-full rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 text-sm normal-case tracking-normal" /></label>
                <label className="mb-5 block text-xs uppercase tracking-widest text-[#829b92]">Prompt<textarea required value={newAutomationPrompt} onChange={event => setNewAutomationPrompt(event.target.value)} rows={5} className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 text-sm normal-case tracking-normal" /></label>
              </>
            )}
            <button
              disabled={!newName.trim() || (modal === 'agent' && (!selectedProject || !newIcon)) || (modal === 'automation' && (!newAutomationAgentId || !newAutomationPrompt.trim() || !newSchedule.trim())) || (modal === 'project' && ((newWorkspaceMode === 'existing' && !newWorkspacePath.trim()) || (newWorkspaceMode === 'clone' && !newRepositoryUrl.trim())))}
              className="w-full rounded-lg bg-[#a9ddd5] px-4 py-2.5 font-semibold text-[#102627] disabled:opacity-40"
            >
              Create
            </button>
            {modal === 'agent' && !selectedProject && (
              <p className="mt-2 text-xs text-amber-200">Select project first.</p>
            )}
          </form>
        </div>
      )}
    </div>
  )
}
