import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ChevronDown, LogOut, Menu, MessageSquare, Plus, Send, Square, Sparkles, X } from "lucide-react";
import {
  agents,
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
  type SubpolarProject,
  type SubpolarSession,
  type SubpolarUser,
} from "@/lib/subpolar-api";
import { SubpolarWebSocketClient, type SubpolarSocketEvent } from "@/lib/subpolar-client";
import { ProviderSetupScreen } from "@/components/ProviderSetupScreen";

type AuthMode = "login" | "bootstrap";

function randomId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function eventRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function eventText(event: SubpolarSocketEvent): string {
  const payload = eventRecord(event.event)?.payload;
  const record = eventRecord(payload);
  return typeof record?.text === "string" ? record.text : "";
}

function messageText(message: SubpolarMessage): string {
  return typeof message.content === "string" ? message.content : JSON.stringify(message.content);
}

function AuthScreen({ mode, onAuthenticated }: { mode: AuthMode; onAuthenticated: (user: SubpolarUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isBootstrap = mode === "bootstrap";

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = isBootstrap ? await bootstrap(username, password) : await login(username, password);
      onAuthenticated(result.user);
    } catch (reason) {
      setError(reason instanceof SubpolarApiError && reason.status === 401 ? "Invalid username or password." : "Could not authenticate.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#041c1c] px-5 text-[#ffe6cb]">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-[#ffe6cb]/15 bg-[#102b2d] p-8 shadow-2xl shadow-black/30">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f0c9a5] text-[#102b2d]"><Sparkles size={21} /></div>
          <div><p className="text-xs uppercase tracking-[0.24em] text-[#91aaa0]">Subpolar</p><h1 className="text-2xl font-semibold">{isBootstrap ? "Create administrator" : "Welcome back"}</h1></div>
        </div>
        <p className="mb-6 text-sm leading-6 text-[#b9c7bd]">{isBootstrap ? "Set up the first local account. This account owns your projects, agents, and conversations." : "Sign in to continue to your private workspace."}</p>
        <label className="mb-4 block text-xs uppercase tracking-[0.14em] text-[#91aaa0]">Username<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required minLength={3} className="mt-2 w-full rounded-lg border border-[#ffe6cb]/15 bg-[#0b2224] px-3 py-3 text-sm normal-case tracking-normal text-[#ffe6cb] outline-none focus:border-[#f0c9a5]" /></label>
        <label className="mb-5 block text-xs uppercase tracking-[0.14em] text-[#91aaa0]">Password<input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete={isBootstrap ? "new-password" : "current-password"} required minLength={8} className="mt-2 w-full rounded-lg border border-[#ffe6cb]/15 bg-[#0b2224] px-3 py-3 text-sm normal-case tracking-normal text-[#ffe6cb] outline-none focus:border-[#f0c9a5]" /></label>
        {error !== null ? <p role="alert" className="mb-4 rounded-lg border border-red-300/20 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
        <button disabled={busy} className="w-full rounded-lg bg-[#f0c9a5] px-4 py-3 text-sm font-semibold text-[#102b2d] transition hover:bg-[#ffe6cb] disabled:opacity-50">{busy ? "Working…" : isBootstrap ? "Create account" : "Sign in"}</button>
      </form>
    </main>
  );
}

function Sidebar({
  user,
  projects: projectList,
  selectedProject,
  onProject,
  onCreateProject,
  agents: agentList,
  selectedAgent,
  onAgent,
  onCreateAgent,
  sessions: sessionList,
  selectedSession,
  onSession,
  mobileOpen,
  onClose,
  onLogout,
}: {
  user: SubpolarUser;
  projects: readonly SubpolarProject[];
  selectedProject: string;
  onProject: (id: string) => void;
  onCreateProject: () => void;
  agents: readonly SubpolarAgent[];
  selectedAgent: string;
  onAgent: (id: string) => void;
  onCreateAgent: () => void;
  sessions: readonly SubpolarSession[];
  selectedSession: string | null;
  onSession: (id: string) => void;
  mobileOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
}) {
  return (
    <aside className={`${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} fixed inset-y-0 left-0 z-20 flex w-[19rem] flex-col border-r border-[#ffe6cb]/10 bg-[#0b2224] transition-transform lg:static`}>
      <div className="flex h-16 items-center justify-between border-b border-[#ffe6cb]/10 px-5"><div><p className="text-[10px] uppercase tracking-[0.22em] text-[#78968d]">Workspace</p><p className="font-semibold text-[#ffe6cb]">Subpolar</p></div><button onClick={onClose} className="rounded p-2 text-[#91aaa0] hover:bg-[#18383a] lg:hidden" aria-label="Close menu"><X size={18} /></button></div>
      <div className="space-y-5 overflow-y-auto p-4">
        <section><div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-[#78968d]"><span>Projects</span><button onClick={onCreateProject} className="rounded p-1 hover:bg-[#18383a]" aria-label="Create project"><Plus size={15} /></button></div><label className="relative block"><select value={selectedProject} onChange={event => onProject(event.target.value)} className="w-full appearance-none rounded-lg border border-[#ffe6cb]/15 bg-[#102b2d] px-3 py-2.5 pr-8 text-sm text-[#ffe6cb] outline-none focus:border-[#f0c9a5]"><option value="">No project</option>{projectList.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 text-[#91aaa0]" size={15} /></label></section>
        <section><div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-[#78968d]"><span>Agents</span><button onClick={onCreateAgent} disabled={selectedProject === ""} className="rounded p-1 hover:bg-[#18383a] disabled:opacity-30" aria-label="Create agent"><Plus size={15} /></button></div><label className="relative block"><select value={selectedAgent} onChange={event => onAgent(event.target.value)} disabled={selectedProject === ""} className="w-full appearance-none rounded-lg border border-[#ffe6cb]/15 bg-[#102b2d] px-3 py-2.5 pr-8 text-sm text-[#ffe6cb] outline-none focus:border-[#f0c9a5] disabled:opacity-50"><option value="">Default agent</option>{agentList.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 text-[#91aaa0]" size={15} /></label></section>
        <section><div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[#78968d]">Conversations</div><button onClick={() => onSession("")} className="mb-2 flex w-full items-center gap-2 rounded-lg border border-[#f0c9a5]/40 bg-[#f0c9a5]/10 px-3 py-2.5 text-left text-sm text-[#ffe6cb] hover:bg-[#f0c9a5]/20"><Plus size={15} /> New conversation</button><div className="space-y-1">{sessionList.map(session => <button key={session.sessionId} onClick={() => onSession(session.sessionId)} className={`${selectedSession === session.sessionId ? "bg-[#214548] text-[#ffe6cb]" : "text-[#b9c7bd] hover:bg-[#18383a]"} flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs`}><MessageSquare size={14} /><span className="truncate">{session.sessionId.slice(0, 14)}</span></button>)}</div></section>
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-[#ffe6cb]/10 px-4 py-4"><div className="min-w-0"><p className="truncate text-sm text-[#ffe6cb]">{user.username}</p><p className="text-xs text-[#78968d]">Private account</p></div><button onClick={onLogout} className="rounded-lg p-2 text-[#91aaa0] hover:bg-[#18383a] hover:text-[#ffe6cb]" aria-label="Log out"><LogOut size={17} /></button></div>
    </aside>
  );
}

function Chat({
  messages,
  draft,
  setDraft,
  model,
  setModel,
  streaming,
  onSend,
  onCancel,
}: {
  messages: readonly SubpolarMessage[];
  draft: string;
  setDraft: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
  streaming: boolean;
  onSend: () => void;
  onCancel: () => void;
}) {
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); }
  }
  return <section className="flex min-h-0 flex-1 flex-col"><div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">{messages.length === 0 ? <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center"><div className="mb-5 rounded-2xl border border-[#f0c9a5]/25 bg-[#f0c9a5]/10 p-4 text-[#f0c9a5]"><Sparkles size={27} /></div><h2 className="text-2xl font-semibold text-[#ffe6cb]">What are we building?</h2><p className="mt-2 max-w-md text-sm leading-6 text-[#91aaa0]">Start a private conversation. Responses stream live over the authenticated Subpolar WebSocket.</p></div> : <div className="mx-auto max-w-3xl space-y-5">{messages.map((message, index) => <article key={`${message.sequence ?? index}-${message.role}`} className={message.role === "user" ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[#f0c9a5] px-4 py-3 text-sm text-[#102b2d]" : "max-w-[90%] rounded-2xl rounded-bl-sm border border-[#ffe6cb]/10 bg-[#102b2d] px-4 py-3 text-sm leading-7 text-[#ffe6cb]"}><div className="mb-1 text-[10px] uppercase tracking-[0.14em] opacity-60">{message.role}</div><div className="whitespace-pre-wrap">{messageText(message)}</div></article>)}</div>}</div><div className="border-t border-[#ffe6cb]/10 bg-[#0b2224] p-4 sm:p-6"><div className="mx-auto mb-2 flex max-w-3xl items-center gap-2"><label className="text-[10px] uppercase tracking-[0.14em] text-[#78968d]">Model<input value={model} onChange={event => setModel(event.target.value)} disabled={streaming} className="ml-2 w-48 rounded border border-[#ffe6cb]/10 bg-[#102b2d] px-2 py-1 text-xs normal-case tracking-normal text-[#ffe6cb] outline-none focus:border-[#f0c9a5]" /></label></div><div className="mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border border-[#ffe6cb]/15 bg-[#102b2d] p-2 shadow-xl shadow-black/20"><textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={keyDown} disabled={streaming} rows={1} placeholder="Ask your agent anything…" className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-sm text-[#ffe6cb] outline-none placeholder:text-[#78968d]" /><button onClick={streaming ? onCancel : onSend} className={`${streaming ? "bg-red-300/15 text-red-200" : "bg-[#f0c9a5] text-[#102b2d]"} flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition hover:brightness-110`} aria-label={streaming ? "Stop response" : "Send message"}>{streaming ? <Square size={16} fill="currentColor" /> : <Send size={17} />}</button></div><p className="mx-auto mt-2 max-w-3xl text-[11px] text-[#78968d]">Enter to send · Shift+Enter for a new line</p></div></section>;
}

function Workspace({ user, onLogout }: { user: SubpolarUser; onLogout: () => void }) {
  const [projectList, setProjectList] = useState<readonly SubpolarProject[]>([]);
  const [agentList, setAgentList] = useState<readonly SubpolarAgent[]>([]);
  const [sessionList, setSessionList] = useState<readonly SubpolarSession[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<readonly SubpolarMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState("default");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [projectForm, setProjectForm] = useState(false);
  const [agentForm, setAgentForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newInstructions, setNewInstructions] = useState("");
  const clientRef = useRef<SubpolarWebSocketClient | null>(null);
  const requestRef = useRef<string | null>(null);
  const newSessionRef = useRef(new Set<string>());

  async function refreshSessions(): Promise<void> { try { setSessionList((await sessions()).sessions); } catch { /* auth screen handles expired sessions */ } }
  useEffect(() => { void Promise.all([projects(), sessions()]).then(([projectResult, sessionResult]) => { setProjectList(projectResult.projects); setSessionList(sessionResult.sessions); setSelectedProject(projectResult.projects[0]?.id ?? ""); }).catch(() => setError("Could not load your workspace.")); }, []);
  useEffect(() => { setSelectedAgent(""); if (selectedProject) void agents(selectedProject).then(result => setAgentList(result.agents)).catch(() => setAgentList([])); else setAgentList([]); }, [selectedProject]);
  useEffect(() => { if (!selectedSession) { setMessages([]); return; } if (newSessionRef.current.delete(selectedSession)) return; void sessionTranscript(selectedSession).then(result => setMessages(result.messages)).catch(() => setError("Could not load that conversation.")); }, [selectedSession]);
  useEffect(() => () => clientRef.current?.close(), []);

  function handleEvent(requestId: string, event: SubpolarSocketEvent): void {
    const inner = eventRecord(event.event);
    const type = typeof inner?.type === "string" ? inner.type : event.type;
    if (type === "message.delta") setMessages(current => current.map((message, index) => index === current.length - 1 && message.role === "assistant" ? { ...message, content: `${messageText(message)}${eventText(event)}` } : message));
    if (type === "message.complete") { setStreaming(false); requestRef.current = null; void refreshSessions(); clientRef.current?.close(); }
    if (type === "error") { setStreaming(false); requestRef.current = null; setError("The response could not be completed."); clientRef.current?.close(); }
    if (event.requestId !== undefined && event.requestId !== requestId) return;
  }

  async function send(): Promise<void> {
    const text = draft.trim();
    if (!text || streaming) return;
    setError(null);
    const requestId = randomId();
    const sessionId = selectedSession ?? randomId();
    if (selectedSession === null) newSessionRef.current.add(sessionId);
    setSelectedSession(sessionId);
    setMessages(current => [...current, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setDraft(""); setStreaming(true); requestRef.current = requestId;
    const client = new SubpolarWebSocketClient({ onEvent: event => handleEvent(requestId, event), onClose: () => { if (requestRef.current === requestId) { setStreaming(false); setError("Connection closed while the response was streaming."); } } });
    clientRef.current = client;
    try { const outgoing: readonly SubpolarMessage[] = [...messages, { role: "user", content: text }]; await client.start({ requestId, sessionId, model, messages: outgoing.filter(message => message.role !== "tool").map(message => ({ role: message.role as "system" | "user" | "assistant", content: messageText(message) })), ...(selectedProject ? { projectId: selectedProject } : {}), ...(selectedAgent ? { agentId: selectedAgent } : {}) }); } catch { setStreaming(false); requestRef.current = null; setError("Could not connect to the agent."); client.close(); }
  }

  async function createNewProject(): Promise<void> { const name = newName.trim(); if (!name) return; try { const result = await createProject(name); setProjectList(current => [...current, result.project]); setSelectedProject(result.project.id); setNewName(""); setProjectForm(false); } catch { setError("Could not create the project."); } }
  async function createNewAgent(): Promise<void> { if (!selectedProject || !newName.trim()) return; try { const result = await createAgent(selectedProject, newName.trim(), newInstructions); setAgentList(current => [...current, result.agent]); setSelectedAgent(result.agent.id); setNewName(""); setNewInstructions(""); setAgentForm(false); } catch { setError("Could not create the agent."); } }
  async function selectSession(id: string): Promise<void> { setMobileOpen(false); setSelectedSession(id || null); }

  const selectedAgentName = useMemo(() => agentList.find(agent => agent.id === selectedAgent)?.name, [agentList, selectedAgent]);
  return <div className="flex h-screen overflow-hidden bg-[#041c1c] text-[#ffe6cb]"><Sidebar user={user} projects={projectList} selectedProject={selectedProject} onProject={setSelectedProject} onCreateProject={() => { setNewName(""); setProjectForm(true); }} agents={agentList} selectedAgent={selectedAgent} onAgent={setSelectedAgent} onCreateAgent={() => { setNewName(""); setAgentForm(true); }} sessions={sessionList} selectedSession={selectedSession} onSession={selectSession} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} onLogout={onLogout} /><main className="flex min-w-0 flex-1 flex-col"><header className="flex h-16 items-center justify-between border-b border-[#ffe6cb]/10 px-4 sm:px-8"><div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-[#91aaa0] hover:bg-[#18383a] lg:hidden" aria-label="Open menu"><Menu size={19} /></button><div><h1 className="font-semibold">{selectedSession ? "Conversation" : "New chat"}</h1><p className="text-xs text-[#78968d]">{selectedAgentName ?? "Default agent"}</p></div></div><div className="flex items-center gap-2 text-xs text-[#78968d]"><span className="h-2 w-2 rounded-full bg-emerald-400" /> authenticated</div></header>{error !== null ? <div role="alert" className="mx-4 mt-4 rounded-lg border border-red-300/20 bg-red-950/30 px-4 py-3 text-sm text-red-100 sm:mx-8">{error}<button onClick={() => setError(null)} className="ml-3 underline">dismiss</button></div> : null}<Chat messages={messages} draft={draft} setDraft={setDraft} model={model} setModel={setModel} streaming={streaming} onSend={() => void send()} onCancel={() => { const requestId = requestRef.current; if (requestId) void clientRef.current?.cancel(requestId); }} /></main>{projectForm || agentForm ? <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4"><form onSubmit={event => { event.preventDefault(); void (projectForm ? createNewProject() : createNewAgent()); }} className="w-full max-w-md rounded-2xl border border-[#ffe6cb]/15 bg-[#102b2d] p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold">{projectForm ? "New project" : "New agent"}</h2><button type="button" onClick={() => { setProjectForm(false); setAgentForm(false); }} className="rounded p-1 text-[#91aaa0] hover:bg-[#18383a]"><X size={18} /></button></div><label className="mb-4 block text-xs uppercase tracking-[0.14em] text-[#91aaa0]">Name<input autoFocus value={newName} onChange={event => setNewName(event.target.value)} className="mt-2 w-full rounded-lg border border-[#ffe6cb]/15 bg-[#0b2224] px-3 py-3 text-sm normal-case tracking-normal text-[#ffe6cb] outline-none focus:border-[#f0c9a5]" /></label>{agentForm ? <label className="mb-5 block text-xs uppercase tracking-[0.14em] text-[#91aaa0]">Instructions<textarea value={newInstructions} onChange={event => setNewInstructions(event.target.value)} rows={5} className="mt-2 w-full resize-y rounded-lg border border-[#ffe6cb]/15 bg-[#0b2224] px-3 py-3 text-sm normal-case tracking-normal text-[#ffe6cb] outline-none focus:border-[#f0c9a5]" /></label> : null}<button className="w-full rounded-lg bg-[#f0c9a5] px-4 py-3 text-sm font-semibold text-[#102b2d] hover:bg-[#ffe6cb]">Create</button></form></div> : null}</div>;
}

export default function SubpolarApp() {
  const [user, setUser] = useState<SubpolarUser | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [setupComplete, setSetupComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void currentUser().then(async result => { setUser(result.user); setSetupComplete((await setupStatus()).complete); }).catch(async reason => { if (!(reason instanceof SubpolarApiError) || reason.status !== 401) return; try { setAuthMode((await bootstrapStatus()).required ? "bootstrap" : "login"); } catch { setAuthMode("login"); } }).finally(() => setLoading(false)); }, []);
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#041c1c] text-sm text-[#91aaa0]">Loading private workspace…</main>;
  if (user === null) return <AuthScreen mode={authMode} onAuthenticated={async authenticated => { setUser(authenticated); setSetupComplete((await setupStatus()).complete); }} />;
  if (!setupComplete) return <ProviderSetupScreen onComplete={() => setSetupComplete(true)} />;
  return <Workspace user={user} onLogout={() => { void logout().finally(() => setUser(null)); }} />;
}
