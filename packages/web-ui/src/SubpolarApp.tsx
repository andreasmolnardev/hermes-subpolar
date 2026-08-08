import { useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent, type KeyboardEvent } from 'react'
import {
  AppWindow,
  Bot,
  CalendarClock,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Code2,
  FolderGit2,
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
  Sparkles,
  Square,
  X,
  Zap
} from 'lucide-react'
import {
  agents,
  availableModels,
  bootstrap,
  bootstrapStatus,
  createAgent,
  createProject,
  currentUser,
  login,
  logout,
  projects,
  sessionTranscript,
  sessions,
  setupStatus,
  SubpolarApiError,
  type SubpolarAgent,
  type SubpolarMessage,
  type SubpolarModelProvider,
  type SubpolarProject,
  type SubpolarSession,
  type SubpolarUser,
} from '@/lib/subpolar-api'
import { SubpolarWebSocketClient, type SubpolarSocketEvent } from '@/lib/subpolar-client'
import { projectSubpolarActivity, subpolarEventType, type SubpolarActivityKind } from '@/lib/subpolar-events'
import { ProviderSetupScreen } from '@/components/ProviderSetupScreen'

type AuthMode = 'login' | 'bootstrap'
type View = 'chat' | 'agents' | 'automations' | 'apps'
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
const AUTOMATIONS = [
  { id: 'issues', name: 'New issues', description: 'Triage and summarize new project issues.' },
  { id: 'prs', name: 'Review PRs', description: 'Review pull requests on a schedule.' }
]

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

type ChatMessage = SubpolarMessage | {
  readonly role: SubpolarActivityKind;
  readonly content: string;
  readonly sequence?: number;
};

type PromptMessage = {
  readonly role: "system" | "user" | "assistant";
  readonly content: SubpolarMessage["content"];
  readonly sequence?: number;
};

function isPromptMessage(message: ChatMessage): message is PromptMessage {
  return message.role === "system" || message.role === "user" || message.role === "assistant";
}

function AuthScreen({ mode, onAuthenticated }: { mode: AuthMode; onAuthenticated: (user: SubpolarUser) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isBootstrap = mode === 'bootstrap'
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onAuthenticated((isBootstrap ? await bootstrap(username, password) : await login(username, password)).user)
    } catch (reason) {
      setError(
        reason instanceof SubpolarApiError && reason.status === 401
          ? 'Invalid username or password.'
          : 'Could not authenticate.'
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07191a] px-5 text-[#f5eadc]">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#102627] p-8 shadow-2xl"
      >
        <Sparkles className="mb-5 text-[#70d7cc]" />
        <h1 className="text-2xl font-semibold">{isBootstrap ? 'Create administrator' : 'Welcome back'}</h1>
        <p className="mb-6 mt-2 text-sm text-[#91aaa0]">Private Subpolar workspace.</p>
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
          minLength={3}
          placeholder="Username"
          className="mb-3 w-full rounded-lg border border-white/10 bg-[#091d1e] px-3 py-3 outline-none focus:border-[#70d7cc]"
        />
        <input
          value={password}
          onChange={e => setPassword(e.target.value)}
          type="password"
          required
          minLength={8}
          placeholder="Password"
          className="mb-4 w-full rounded-lg border border-white/10 bg-[#091d1e] px-3 py-3 outline-none focus:border-[#70d7cc]"
        />
        {error && (
          <p role="alert" className="mb-4 text-sm text-red-300">
            {error}
          </p>
        )}
        <button
          disabled={busy}
          className="w-full rounded-lg bg-[#a9ddd5] px-4 py-3 font-semibold text-[#102627] disabled:opacity-50"
        >
          {busy ? 'Working...' : isBootstrap ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}

interface NavProps {
  user: SubpolarUser
  view: View
  setView: (view: View) => void
  projects: readonly SubpolarProject[]
  selectedProject: string
  setProject: (id: string) => void
  sessions: readonly SubpolarSession[]
  selectedSession: string | null
  setSession: (id: string) => void
  onProject: () => void
  open: boolean
  close: () => void
  logout: () => void
}
function GlobalSidebar(props: NavProps) {
  const nav = [
    { id: 'chat', label: 'New chat', icon: Plus },
    { id: 'agents', label: 'Agents', icon: Bot },
    { id: 'automations', label: 'Scheduled', icon: CalendarClock },
    { id: 'apps', label: 'Apps', icon: AppWindow }
  ] as const
  return (
    <aside
      className={`${props.open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} fixed inset-y-0 left-0 z-30 flex w-[17rem] shrink-0 flex-col border-r border-white/10 bg-[#091d1e] transition-transform lg:static`}
    >
      <div className="flex h-16 items-center justify-between px-4">
        <div>
          <span className="font-semibold tracking-[.16em] text-[#70d7cc]">SUBPOLAR</span>
          <span className="ml-2 text-xs text-[#829b92]">agent</span>
        </div>
        <button onClick={props.close} className="lg:hidden">
          <X size={18} />
        </button>
      </div>
      <nav className="space-y-1 px-3">
        {nav.map(item => (
          <button
            key={item.id}
            onClick={() => {
              props.setView(item.id)
              props.close()
            }}
            className={`${props.view === item.id ? 'bg-[#214447] text-[#f5eadc]' : 'text-[#b3c4bb] hover:bg-white/5'} flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm`}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="mx-3 mt-4 border-t border-white/10 pt-4">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-[#718b82]">
          <span>Projects</span>
          <button onClick={props.onProject}>
            <Plus size={14} />
          </button>
        </div>
        <label className="relative block">
          <select
            value={props.selectedProject}
            onChange={e => props.setProject(e.target.value)}
            className="w-full appearance-none rounded border border-white/10 bg-[#102627] px-2.5 py-2 pr-7 text-xs outline-none"
          >
            <option value="">All projects</option>
            {props.projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-2.5" size={13} />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-4">
        <p className="mb-2 text-[10px] uppercase tracking-widest text-[#718b82]">Threads</p>
        {props.sessions.map(session => (
          <button
            key={session.sessionId}
            onClick={() => {
              props.setSession(session.sessionId)
              props.setView('chat')
              props.close()
            }}
            className={`${props.selectedSession === session.sessionId ? 'bg-[#18383a] text-white' : 'text-[#9dafA6] hover:bg-white/5'} flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs`}
          >
            <MessageSquare size={13} />
            <span className="truncate">{session.sessionId.slice(0, 18)}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-white/10 p-3">
        <Settings size={15} className="text-[#829b92]" />
        <span className="min-w-0 flex-1 truncate text-xs">{props.user.username}</span>
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
  selected,
  onSelect,
  onExpand
}: {
  kind: 'agents' | 'automations'
  title: string
  items: readonly { id: string; name: string; icon?: string }[]
  selected: string
  onSelect: (id: string) => void
  onExpand: () => void
}) {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-white/10 bg-[#0b2021] sm:flex">
      <div className="flex h-16 items-center gap-2 border-b border-white/10 px-3">
        <button
          onClick={onExpand}
          className="rounded p-1.5 text-[#829b92] hover:bg-white/10"
          aria-label="Expand main sidebar"
        >
          <ChevronsRight size={18} />
        </button>
        <span className="font-semibold">{title}</span>
      </div>
      <div className="p-3">
        <p className="mb-2 text-[10px] uppercase tracking-widest text-[#718b82]">Default</p>
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`${selected === item.id ? 'bg-[#2a5558] text-white' : 'text-[#b3c4bb] hover:bg-white/5'} mb-1 flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm`}
          >
            {kind === 'agents' ? agentIcon(item as SubpolarAgent) : <Zap size={16} />}
            <span className="truncate">{item.name}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}

function Gallery({
  view,
  agents,
  onAgent,
  onAutomation,
  onCreate
}: {
  view: 'agents' | 'automations'
  agents: readonly SubpolarAgent[]
  onAgent: (id: string) => void
  onAutomation: (id: string) => void
  onCreate: () => void
}) {
  const isAgents = view === 'agents'
  const cards = isAgents ? agents : AUTOMATIONS
  return (
    <section className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-8">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[.18em] text-[#70d7cc]">Workspace</p>
          <h1 className="mt-1 text-3xl font-semibold">{isAgents ? 'Agents' : 'Scheduled tasks'}</h1>
          <p className="mt-2 text-sm text-[#829b92]">Choose one to open its dedicated workspace.</p>
        </div>
        <button onClick={onCreate} className="rounded-lg bg-[#a9ddd5] px-4 py-2 text-sm font-semibold text-[#102627]">
          <Plus className="mr-1 inline" size={15} /> Create
        </button>
      </div>
      <p className="mb-3 text-xs uppercase tracking-widest text-[#829b92]">Default</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(item => (
          <button
            key={item.id}
            onClick={() => (isAgents ? onAgent(item.id) : onAutomation(item.id))}
            className="group min-h-36 rounded-xl border border-white/10 bg-[#102627] p-5 text-left transition hover:-translate-y-0.5 hover:border-[#70d7cc]/50"
          >
            <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-[#1d4142] text-[#70d7cc]">
              {isAgents ? agentIcon(item as SubpolarAgent) : <CalendarClock size={20} />}
            </div>
            <h2 className="font-semibold group-hover:text-[#a9ddd5]">{item.name}</h2>
            <p className="mt-1 text-xs leading-5 text-[#829b92]">
              {'instructions' in item ? item.instructions || 'Custom workspace agent' : item.description}
            </p>
          </button>
        ))}
      </div>
      {cards.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/15 p-10 text-center text-sm text-[#829b92]">
          No {view} in this project yet.
        </div>
      )}
    </section>
  )
}

function Detail({ kind, name, agent }: { kind: 'agent' | 'automation'; name: string; agent?: SubpolarAgent }) {
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
  streaming,
  onSend,
  onCancel
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
  streaming: boolean
  onSend: () => void
  onCancel: () => void
}) {
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSend()
    }
  }
  const control =
    'max-w-[11rem] appearance-none bg-transparent pr-5 text-xs font-medium text-[#a8b9b1] outline-none disabled:opacity-50'
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
            <Sparkles className="mb-5 text-[#70d7cc]" size={30} />
            <h2 className="text-2xl font-semibold">What do you want to work on?</h2>
            <p className="mt-2 text-sm text-[#829b92]">Start a thread in your selected project and agent.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.map((message, index) => (
              <article
                key={`${message.sequence ?? index}-${message.role}`}
                className={
                  message.role === 'user'
                    ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[#a9ddd5] px-4 py-3 text-sm text-[#102627]'
                    : 'max-w-[90%] rounded-2xl rounded-bl-sm border border-white/10 bg-[#102627] px-4 py-3 text-sm leading-7'
                }
              >
                <div className="mb-1 text-[10px] uppercase tracking-widest opacity-60">{message.role}</div>
                <div className="whitespace-pre-wrap">{messageText(message)}</div>
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="bg-[#091d1e] px-3 pb-3 sm:px-6 sm:pb-5">
        <div className="mx-auto max-w-4xl rounded-[1.35rem] border border-white/10 bg-[#102627] p-3 shadow-2xl shadow-black/30">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={keyDown}
            disabled={streaming}
            rows={3}
            placeholder="Ask for follow-up changes or attach images"
            className="min-h-20 w-full resize-none bg-transparent px-1 py-1 text-sm outline-none placeholder:text-[#647a72]"
          />
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <div className="relative flex items-center gap-1.5 border-r border-white/10 pr-3">
              <Sparkles size={14} className="text-[#70d7cc]" />
              <select
                aria-label="Model"
                value={model}
                onChange={e => setModel(e.target.value)}
                disabled={streaming}
                className={control}
              >
                <option value="default">Default model</option>
                {modelProviders.map(provider => (
                  <optgroup key={provider.slug} label={provider.slug}>
                    {provider.models.map(option => (
                      <option key={`${provider.slug}:${option.id}`} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3" size={12} />
            </div>
            <div className="relative border-r border-white/10 pr-3">
              <select
                aria-label="Model effort"
                value={effort}
                onChange={e => setEffort(e.target.value)}
                disabled={streaming}
                className={control}
              >
                <option value="normal">Normal effort</option>
                <option value="low">Low effort</option>
                <option value="high">High effort</option>
                <option value="max">Max effort</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1" size={12} />
            </div>
            <div className="relative flex items-center gap-1.5 border-r border-white/10 pr-3">
              <Bot size={14} />
              <select
                aria-label="Agent"
                value={agent}
                onChange={e => setAgent(e.target.value)}
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
                onChange={e => setPermission(e.target.value)}
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
              className="ml-auto rounded-full bg-[#3972b8] p-2.5 text-white disabled:bg-[#24435f] disabled:text-white/40"
            >
              {streaming ? <Square size={16} /> : <Send size={16} />}
            </button>
          </div>
        </div>
        <div className="mx-auto mt-2 flex max-w-4xl items-center justify-between px-2 text-[11px] text-[#647a72]">
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

function Workspace({ user, onLogout }: { user: SubpolarUser; onLogout: () => void }) {
  const [projectList, setProjectList] = useState<readonly SubpolarProject[]>([]),
    [agentList, setAgentList] = useState<readonly SubpolarAgent[]>([]),
    [sessionList, setSessionList] = useState<readonly SubpolarSession[]>([])
  const [selectedProject, setSelectedProject] = useState(''),
    [selectedAgent, setSelectedAgent] = useState(''),
    [selectedAutomation, setSelectedAutomation] = useState(''),
    [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [view, setView] = useState<View>('chat'),
    [sidebarCollapsed, setSidebarCollapsed] = useState(false),
    [mobileOpen, setMobileOpen] = useState(false),
     [messages, setMessages] = useState<readonly ChatMessage[]>([]),
    [draft, setDraft] = useState(''),
    [model, setModel] = useState('default'),
    [modelProviders, setModelProviders] = useState<readonly SubpolarModelProvider[]>([]),
    [effort, setEffort] = useState('normal'),
    [permission, setPermission] = useState('full'),
    [streaming, setStreaming] = useState(false),
    [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<'project' | 'agent' | null>(null),
    [newName, setNewName] = useState(''),
    [newInstructions, setNewInstructions] = useState(''),
    [newIcon, setNewIcon] = useState<IconName | ''>('')
  const clientRef = useRef<SubpolarWebSocketClient | null>(null),
    requestRef = useRef<string | null>(null),
    newSessionRef = useRef(new Set<string>())
   async function refreshSessions() {
    try {
      setSessionList((await sessions()).sessions)
    } catch {
      /* ignored */
    }
  }
  useEffect(() => {
    void Promise.all([projects(), sessions()])
      .then(([p, s]) => {
        setProjectList(p.projects)
        setSessionList(s.sessions)
        setSelectedProject(p.projects[0]?.id ?? '')
      })
      .catch(() => setError('Could not load workspace.'))
  }, [])
  useEffect(() => {
    void availableModels()
      .then(result => setModelProviders(result.providers))
      .catch(() => setModelProviders([]))
  }, [])
  useEffect(() => {
    setSelectedAgent('')
    if (selectedProject)
      void agents(selectedProject)
        .then(r => setAgentList(r.agents))
        .catch(() => setAgentList([]))
    else
      void agents()
        .then(r => setAgentList(r.agents))
        .catch(() => setAgentList([]))
  }, [selectedProject])
  useEffect(() => {
    if (!selectedSession) {
      setMessages([])
      return
    }
    if (newSessionRef.current.delete(selectedSession)) return
    void sessionTranscript(selectedSession)
      .then(r => setMessages(r.messages))
      .catch(() => setError('Could not load thread.'))
  }, [selectedSession])
  useEffect(() => () => clientRef.current?.close(), [])
   function handleEvent(requestId: string, event: SubpolarSocketEvent) {
     if (event.requestId !== undefined && event.requestId !== requestId) return
     const type = subpolarEventType(event)
     const activity = projectSubpolarActivity(event)
     if (activity !== undefined)
       setMessages(current => [
         ...current,
         { role: activity.kind, content: activity.text, ...(activity.sequence === undefined ? {} : { sequence: activity.sequence }) }
       ])
     if (type === 'message.delta')
       setMessages(current =>
         current.map((m, i) =>
           i === current.findLastIndex(message => message.role === 'assistant')
             ? { ...m, content: `${messageText(m)}${eventText(event)}` }
             : m
        )
      )
    if (type === 'message.complete') {
      setStreaming(false)
      requestRef.current = null
      void refreshSessions()
      clientRef.current?.close()
    }
     if (type === 'error') {
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
    setSelectedSession(sessionId)
    setMessages(current => [...current, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    setDraft('')
    setStreaming(true)
    requestRef.current = requestId
    const client = new SubpolarWebSocketClient({
      onEvent: e => handleEvent(requestId, e),
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
         messages: outgoing.filter(isPromptMessage).map(message => ({
           role: message.role,
           content: messageText(message)
         })),
         ...(selectedProject ? { projectId: selectedProject } : {}),
         ...(selectedAgent ? { agentId: selectedAgent } : {})
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
        const r = await createProject(newName.trim())
        setProjectList(p => [...p, r.project])
        setSelectedProject(r.project.id)
      } else if (modal === 'agent' && selectedProject && newIcon) {
        const r = await createAgent(selectedProject, newName.trim(), newInstructions, newIcon)
        setAgentList(a => [...a, r.agent])
        setSelectedAgent(r.agent.id)
        setSidebarCollapsed(true)
      }
      setModal(null)
      setNewName('')
      setNewInstructions('')
      setNewIcon('')
    } catch {
      setError(`Could not create ${modal}.`)
    }
  }
  const activeAgent = useMemo(() => agentList.find(a => a.id === selectedAgent), [agentList, selectedAgent])
  const detailOpen = (view === 'agents' && selectedAgent) || (view === 'automations' && selectedAutomation)
  return (
    <div className="flex h-screen overflow-hidden bg-[#07191a] text-[#f5eadc]">
      {!sidebarCollapsed && (
        <GlobalSidebar
          user={user}
          view={view}
          setView={next => {
            setView(next)
            setSelectedAgent('')
            setSelectedAutomation('')
          }}
          projects={projectList}
          selectedProject={selectedProject}
          setProject={setSelectedProject}
          sessions={sessionList}
          selectedSession={selectedSession}
          setSession={id => setSelectedSession(id || null)}
          onProject={() => {
            setModal('project')
            setNewName('')
          }}
          open={mobileOpen}
          close={() => setMobileOpen(false)}
          logout={onLogout}
        />
      )}
      {detailOpen && (
        <CollectionSidebar
          kind={view as 'agents' | 'automations'}
          title={view === 'agents' ? 'Agents' : 'Scheduled'}
          items={view === 'agents' ? agentList : AUTOMATIONS}
          selected={view === 'agents' ? selectedAgent : selectedAutomation}
          onSelect={view === 'agents' ? setSelectedAgent : setSelectedAutomation}
          onExpand={() => setSidebarCollapsed(false)}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4 sm:px-6">
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
                      ? (AUTOMATIONS.find(a => a.id === selectedAutomation)?.name ?? 'Scheduled tasks')
                      : 'Apps'}
              </h1>
              {view === 'chat' && <p className="text-xs text-[#718b82]">{activeAgent?.name ?? 'Default agent'}</p>}
            </div>
          </div>
          {!sidebarCollapsed && detailOpen && (
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="hidden text-[#829b92] lg:block"
              aria-label="Collapse main sidebar"
            >
              <ChevronsLeft size={18} />
            </button>
          )}
        </header>
        {error && (
          <div className="mx-5 mt-4 rounded border border-red-300/20 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
            <button onClick={() => setError(null)} className="ml-3 underline">
              dismiss
            </button>
          </div>
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
            setEffort={setEffort}
            permission={permission}
            setPermission={setPermission}
            agents={agentList}
            agent={selectedAgent}
            setAgent={setSelectedAgent}
            streaming={streaming}
            onSend={() => void send()}
            onCancel={() => {
              const id = requestRef.current
              if (id) void clientRef.current?.cancel(id)
            }}
          />
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
                : (AUTOMATIONS.find(a => a.id === selectedAutomation)?.name ?? 'Automation')
            }
            agent={activeAgent}
          />
        ) : (
          <Gallery
            view={view}
            agents={agentList}
            onAgent={id => {
              setSelectedAgent(id)
              setSidebarCollapsed(true)
            }}
            onAutomation={id => {
              setSelectedAutomation(id)
              setSidebarCollapsed(true)
            }}
            onCreate={() => {
              if (view === 'agents') {
                setModal('agent')
                setNewName('')
                setNewIcon('')
              } else setSelectedAutomation('issues')
            }}
          />
        )}
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form onSubmit={submitModal} className="w-full max-w-md rounded-xl border border-white/10 bg-[#102627] p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Create {modal}</h2>
              <button type="button" onClick={() => setModal(null)}>
                <X size={18} />
              </button>
            </div>
            <label className="mb-4 block text-xs uppercase tracking-widest text-[#829b92]">
              Name
              <input
                autoFocus
                required
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="mt-2 w-full rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 text-sm normal-case tracking-normal outline-none focus:border-[#70d7cc]"
              />
            </label>
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
                    onChange={e => setNewInstructions(e.target.value)}
                    rows={5}
                    className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-[#091d1e] px-3 py-2.5 text-sm normal-case tracking-normal outline-none focus:border-[#70d7cc]"
                  />
                </label>
              </>
            )}
            <button
              disabled={!newName.trim() || (modal === 'agent' && (!selectedProject || !newIcon))}
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

export default function SubpolarApp() {
  const [user, setUser] = useState<SubpolarUser | null>(null),
    [authMode, setAuthMode] = useState<AuthMode>('login'),
    [setupComplete, setSetupComplete] = useState(false),
    [loading, setLoading] = useState(true)
  useEffect(() => {
    void currentUser()
      .then(async r => {
        setUser(r.user)
        setSetupComplete((await setupStatus()).complete)
      })
      .catch(async reason => {
        if (!(reason instanceof SubpolarApiError) || reason.status !== 401) return
        try {
          setAuthMode((await bootstrapStatus()).required ? 'bootstrap' : 'login')
        } catch {
          setAuthMode('login')
        }
      })
      .finally(() => setLoading(false))
  }, [])
  if (loading)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07191a] text-[#829b92]">
        Loading workspace...
      </main>
    )
  if (!user)
    return (
      <AuthScreen
        mode={authMode}
        onAuthenticated={async authenticated => {
          setUser(authenticated)
          setSetupComplete((await setupStatus()).complete)
        }}
      />
    )
  if (!setupComplete) return <ProviderSetupScreen onComplete={() => setSetupComplete(true)} />
  return (
    <Workspace
      user={user}
      onLogout={() => {
        void logout().finally(() => setUser(null))
      }}
    />
  )
}
