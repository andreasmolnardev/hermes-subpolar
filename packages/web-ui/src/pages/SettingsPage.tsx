import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Bot, UserRound } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  availableModels,
  createGitCredential,
  createIntegration,
  deleteIntegration,
  integrations,
  gitCredentials,
  modelDefaults,
  saveModelDefaults,
  setupProviders,
  startIntegrationOAuth,
  testIntegration,
  createPromptCommand,
  createSkill,
  deletePromptCommand,
  deleteSkill,
  promptCommands,
  revokeIntegrationOAuth,
  skills,
  updatePromptCommand,
  updateSkill,
  updateIntegration,
  type SubpolarPromptCommand,
  type SubpolarPromptCommandInput,
  type SubpolarSkill,
  type SubpolarSkillInput,
  type SubpolarModelDefaults,
  type SubpolarModelProvider,
  type SubpolarIntegration,
  type SubpolarGitCredential,
  type SubpolarUser
} from '@/lib/subpolar-api'
import type { ModelProviderDefinition } from '@hermes/shared/model-providers'
import { SETTINGS_SECTIONS, settingsSection, type SettingsScope } from '@/lib/settings-sections'
import { Separator } from '@/components/ui/separator'
import { useTheme, type ThemeMode } from '@/themes'

const SETTINGS_SCOPE_ICONS = { user: UserRound, agent: Bot } as const

const MODEL_DEFAULT_FIELDS: readonly {
  readonly key: keyof SubpolarModelDefaults
  readonly label: string
  readonly description: string
}[] = [
  { key: 'conversation', label: 'Default conversation model', description: 'Preselected model for new conversations.' },
  { key: 'internal', label: 'Internal tasks model', description: 'Model used for background planning and task work.' },
  { key: 'voice', label: 'Voice model', description: 'Model used when voice features need generation.' },
  { key: 'image', label: 'Image generation model', description: 'Model used for image generation requests.' }
]

function ModelSettingsTabs({ providers }: { providers: boolean }) {
  return (
    <nav
      className="mt-6 flex gap-1 border-b border-[color-mix(in_srgb,var(--midground-base)_18%,transparent)]"
      aria-label="Model settings tabs"
    >
      <NavLink
        to="/settings/agent/models"
        end
        className={({ isActive }) =>
          `px-3 py-2 text-sm ${isActive && !providers ? 'border-b-2 border-[var(--color-primary,var(--midground-base))] text-[var(--foreground-base)]' : 'setup-help'}`
        }
      >
        Models
      </NavLink>
      <NavLink
        to="/settings/agent/models/providers"
        className={`px-3 py-2 text-sm ${providers ? 'border-b-2 border-[var(--color-primary,var(--midground-base))] text-[var(--foreground-base)]' : 'setup-help'}`}
      >
        Providers
      </NavLink>
    </nav>
  )
}

function ModelsSettings() {
  const [defaults, setDefaults] = useState<SubpolarModelDefaults | null>(null)
  const [modelProviders, setModelProviders] = useState<readonly SubpolarModelProvider[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([modelDefaults(), availableModels()])
      .then(([saved, models]) => {
        setDefaults(saved)
        setModelProviders(models.providers)
      })
      .catch(() => setError('Could not load model settings.'))
  }, [])

  const options = Array.from(
    new Set([
      ...modelProviders.flatMap(provider => provider.models.map(model => model.id)),
      ...(defaults === null ? [] : MODEL_DEFAULT_FIELDS.map(field => defaults[field.key]))
    ])
  )

  async function selectModel(key: keyof SubpolarModelDefaults, value: string) {
    if (defaults === null) return
    const next = { ...defaults, [key]: value }
    setDefaults(next)
    setSaving(true)
    setError(null)
    try {
      setDefaults(await saveModelDefaults(next))
    } catch {
      setError('Could not save model settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <h2 className="text-xl font-semibold">Models</h2>
      <ModelSettingsTabs providers={false} />
      {defaults === null ? (
        <p className="setup-help mt-6">Loading model settings...</p>
      ) : (
        <div className="mt-6 space-y-3">
          {MODEL_DEFAULT_FIELDS.map(field => (
            <label key={field.key} className="setup-option block rounded-xl p-4">
              <span className="block font-medium">{field.label}</span>
              <span className="setup-help mt-1 block text-sm">{field.description}</span>
              <select
                value={defaults[field.key]}
                onChange={event => void selectModel(field.key, event.target.value)}
                className="setup-input mt-3 w-full"
                disabled={options.length === 0}
              >
                {options.length === 0 ? (
                  <option value={defaults[field.key]}>Configure a provider first</option>
                ) : (
                  options.map(model => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))
                )}
              </select>
            </label>
          ))}
        </div>
      )}
      {saving ? <p className="setup-help mt-4 text-sm">Saving...</p> : null}
      {error !== null ? (
        <p role="alert" className="setup-error mt-4">
          {error}
        </p>
      ) : null}
    </>
  )
}

function ProvidersSettings() {
  const [providers, setProviders] = useState<readonly ModelProviderDefinition[]>([])
  const [modelProviders, setModelProviders] = useState<readonly SubpolarModelProvider[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([setupProviders(), availableModels()])
      .then(([catalog, models]) => {
        setProviders(catalog.providers)
        setModelProviders(models.providers)
      })
      .catch(() => setError('Could not load providers.'))
  }, [])

  const configuredIds = new Set(modelProviders.map(provider => provider.id))
  const configured = providers.filter(provider => configuredIds.has(provider.id))
  const available = providers.filter(provider => !configuredIds.has(provider.id))
  const modelsFor = (provider: ModelProviderDefinition) =>
    modelProviders.find(item => item.id === provider.id)?.models.map(model => model.label) ??
    provider.fallbackModels ??
    []

  function providerList(title: string, items: readonly ModelProviderDefinition[], isConfigured: boolean) {
    return (
      <section className="mt-6">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="font-medium">{title}</h3>
          <span className="setup-help text-xs">{items.length}</span>
        </div>
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="setup-option rounded-xl p-4 text-sm setup-help">
              {isConfigured ? 'No providers configured.' : 'All providers are configured.'}
            </p>
          ) : (
            items.map(provider => (
              <article key={provider.id} className="setup-option rounded-xl p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h4 className="font-medium">{provider.label}</h4>
                    <p className="setup-help mt-1 text-sm">{provider.description}</p>
                    {isConfigured ? (
                      <p className="mt-2 text-xs text-[var(--foreground-base)]">
                        Models: {modelsFor(provider).join(', ') || 'No models discovered'}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    to={`/settings/agent/models/providers/configure?provider=${encodeURIComponent(provider.id)}`}
                    className="setup-primary shrink-0 text-center text-sm"
                  >
                    {isConfigured ? 'Edit' : 'Configure'}
                  </Link>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    )
  }

  return (
    <>
      <h2 className="text-xl font-semibold">Providers</h2>
      <ModelSettingsTabs providers />
      {error !== null ? (
        <p role="alert" className="setup-error mt-6">
          {error}
        </p>
      ) : null}
      {providerList('Configured providers', configured, true)}
      {providerList('Available providers', available, false)}
    </>
  )
}

export function SkillsSettings() {
  const [items, setItems] = useState<readonly SubpolarSkill[]>([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<SubpolarSkillInput>({ name: '', description: '', instructions: '', enabled: true })
  const [error, setError] = useState<string | null>(null)
  const load = () => void skills().then(result => setItems(result.skills)).catch(() => setError('Could not load Skills.'))
  useEffect(load, [])
  const visible = items.filter(item => `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase()))
  function edit(item: SubpolarSkill) { setEditing(item.id); setForm({ name: item.name, description: item.description, instructions: item.instructions, enabled: item.enabled }) }
  function newSkill() { setEditing('new'); setForm({ name: '', description: '', instructions: '', enabled: true }) }
  async function save(event: FormEvent) {
    event.preventDefault(); setError(null)
    try {
      const result = editing === 'new' ? await createSkill(form) : await updateSkill(editing as string, form)
      setItems(current => editing === 'new' ? [...current, result.skill] : current.map(item => item.id === result.skill.id ? { ...result.skill, assignmentCount: item.assignmentCount } : item))
      setEditing(null)
    } catch { setError('Could not save Skill.') }
  }
  async function remove(item: SubpolarSkill) {
    const count = item.assignmentCount ?? 0
    if (!window.confirm(`Delete “${item.name}”?${count > 0 ? `\n\nThis Skill is assigned to ${count} Agent${count === 1 ? '' : 's'}. Deleting it will remove those assignments.` : ''}`)) return
    try { await deleteSkill(item.id); setItems(current => current.filter(candidate => candidate.id !== item.id)) } catch { setError('Could not delete Skill.') }
  }
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Skills</h2><p className="setup-help mt-1 text-sm">Reusable instructions that augment assigned Agents at runtime.</p></div><button type="button" onClick={newSkill} className="setup-primary">Create Skill</button></div>
      <input value={query} onChange={event => setQuery(event.target.value)} className="setup-input mt-6 w-full" placeholder="Search Skills..." />
      {error !== null && <p role="alert" className="setup-error mt-4">{error}</p>}
      <div className="mt-4 space-y-2">{visible.map(item => <article key={item.id} className="setup-option rounded-xl p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{item.name}</h3><p className="setup-help mt-1 text-sm">{item.description || 'No description'}</p><p className={`mt-2 text-xs ${item.enabled ? 'text-[var(--color-primary,var(--foreground-base))]' : 'setup-help'}`}>{item.enabled ? 'Enabled' : 'Disabled'}{(item.assignmentCount ?? 0) > 0 ? ` · assigned to ${item.assignmentCount} Agent${item.assignmentCount === 1 ? '' : 's'}` : ''}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => void updateSkill(item.id, { enabled: !item.enabled }).then(result => setItems(current => current.map(candidate => candidate.id === item.id ? { ...result.skill, assignmentCount: candidate.assignmentCount } : candidate))).catch(() => setError('Could not update Skill.'))} className="setup-step text-xs">{item.enabled ? 'Disable' : 'Enable'}</button><button type="button" onClick={() => edit(item)} className="setup-step text-xs">Edit</button><button type="button" onClick={() => void remove(item)} className="setup-step text-xs">Delete</button></div></div></article>)}</div>
      {visible.length === 0 && <p className="setup-option mt-4 rounded-xl p-4 text-sm setup-help">No Skills match this search.</p>}
      {editing !== null && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={save} className="w-full max-w-2xl rounded-xl border border-white/10 bg-[var(--background-base)] p-6"><div className="flex items-center justify-between"><h3 className="text-lg font-semibold">{editing === 'new' ? 'Create Skill' : 'Edit Skill'}</h3><button type="button" onClick={() => setEditing(null)} className="setup-step">Close</button></div><label className="setup-label mt-5 block">Name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="setup-input mt-2 w-full" /></label><label className="setup-label mt-4 block">Description<input value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} className="setup-input mt-2 w-full" /></label><label className="setup-label mt-4 block">Instructions<textarea required value={form.instructions} onChange={event => setForm({ ...form, instructions: event.target.value })} className="setup-input mt-2 min-h-56 w-full" /></label><label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={event => setForm({ ...form, enabled: event.target.checked })} /> Enabled</label><button type="submit" className="setup-primary mt-5">Save Skill</button></form></div>}
    </div>
  )
}

function PromptCommandsSettings() {
  const [items, setItems] = useState<readonly SubpolarPromptCommand[]>([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<SubpolarPromptCommandInput>({ name: '', description: '', prompt: '', enabled: true })
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { void promptCommands().then(result => setItems(result.commands)).catch(() => setError('Could not load Prompt Commands.')) }, [])
  const visible = items.filter(item => `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase()))
  function edit(item: SubpolarPromptCommand) { setEditing(item.id); setForm({ name: item.name, description: item.description, prompt: item.prompt, enabled: item.enabled }) }
  function newCommand() { setEditing('new'); setForm({ name: '', description: '', prompt: '', enabled: true }) }
  async function save(event: FormEvent) { event.preventDefault(); setError(null); try { const result = editing === 'new' ? await createPromptCommand(form) : await updatePromptCommand(editing as string, form); setItems(current => editing === 'new' ? [...current, result.command] : current.map(item => item.id === result.command.id ? result.command : item)); setEditing(null) } catch { setError('Could not save Prompt Command.') } }
  async function remove(item: SubpolarPromptCommand) { if (!window.confirm(`Delete /${item.name}?`)) return; try { await deletePromptCommand(item.id); setItems(current => current.filter(candidate => candidate.id !== item.id)) } catch { setError('Could not delete Prompt Command.') } }
  return (
    <div><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Prompt Commands</h2><p className="setup-help mt-1 text-sm">Shortcuts that expand into editable user input; they never change Agent instructions.</p></div><button type="button" onClick={newCommand} className="setup-primary">Create Command</button></div><input value={query} onChange={event => setQuery(event.target.value)} className="setup-input mt-6 w-full" placeholder="Search Prompt Commands..." />{error !== null && <p role="alert" className="setup-error mt-4">{error}</p>}<div className="mt-4 space-y-2">{visible.map(item => <article key={item.id} className="setup-option rounded-xl p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">/{item.name}</h3><p className="setup-help mt-1 text-sm">{item.description || 'No description'}</p><p className="mt-2 text-xs">{item.enabled ? 'Enabled' : 'Disabled'}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => void updatePromptCommand(item.id, { enabled: !item.enabled }).then(result => setItems(current => current.map(candidate => candidate.id === item.id ? result.command : candidate))).catch(() => setError('Could not update Prompt Command.'))} className="setup-step text-xs">{item.enabled ? 'Disable' : 'Enable'}</button><button type="button" onClick={() => edit(item)} className="setup-step text-xs">Edit</button><button type="button" onClick={() => void remove(item)} className="setup-step text-xs">Delete</button></div></div></article>)}</div>{visible.length === 0 && <p className="setup-option mt-4 rounded-xl p-4 text-sm setup-help">No Prompt Commands match this search.</p>}{editing !== null && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={save} className="w-full max-w-2xl rounded-xl border border-white/10 bg-[var(--background-base)] p-6"><div className="flex items-center justify-between"><h3 className="text-lg font-semibold">{editing === 'new' ? 'Create Prompt Command' : 'Edit Prompt Command'}</h3><button type="button" onClick={() => setEditing(null)} className="setup-step">Close</button></div><label className="setup-label mt-5 block">Command<input required pattern="[a-z0-9_-]+" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="setup-input mt-2 w-full" placeholder="review" /></label><label className="setup-label mt-4 block">Description<input value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} className="setup-input mt-2 w-full" /></label><label className="setup-label mt-4 block">Prompt<textarea required value={form.prompt} onChange={event => setForm({ ...form, prompt: event.target.value })} className="setup-input mt-2 min-h-44 w-full" /></label><label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={event => setForm({ ...form, enabled: event.target.checked })} /> Enabled</label><button type="submit" className="setup-primary mt-5">Save Command</button></form></div>}</div>
  )
}

type IntegrationFormState = {
  name: string; type: 'mcp' | 'openapi'; transport: 'http' | 'stdio'; endpoint: string; command: string; arguments: string; environment: string; headers: string;
  specificationUrl: string; specificationContent: string; baseUrl: string; authType: string; authHeaderName: string; secret: string;
  authorizationUrl: string; tokenUrl: string; clientId: string; clientSecret: string; scopes: string; revocationUrl: string; enabled: boolean;
};

const emptyIntegrationForm = (type: 'mcp' | 'openapi'): IntegrationFormState => ({
  name: '', type, transport: 'http', endpoint: '', command: '', arguments: '', environment: '', headers: '', specificationUrl: '', specificationContent: '', baseUrl: '', authType: 'none', authHeaderName: 'x-api-key', secret: '', authorizationUrl: '', tokenUrl: '', clientId: '', clientSecret: '', scopes: '', revocationUrl: '', enabled: true
});

function linesToRecord(value: string): Record<string, string> {
  return Object.fromEntries(value.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const separator = line.indexOf('=') >= 0 ? line.indexOf('=') : line.indexOf(':')
    return separator <= 0 ? [line, ''] : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
  }).filter(([, item]) => item !== ''))
}

function IntegrationForm({ initial, onCancel, onSaved }: { initial: IntegrationFormState; onCancel: () => void; onSaved: (input: IntegrationFormState) => Promise<void> }) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof IntegrationFormState>(key: K, value: IntegrationFormState[K]) => setForm(current => ({ ...current, [key]: value }))
  return <form onSubmit={event => { event.preventDefault(); setSaving(true); void onSaved(form).finally(() => setSaving(false)) }} className="setup-option mt-5 rounded-xl p-5">
    <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">{initial.name ? `Edit ${initial.name}` : `Add ${initial.type === 'mcp' ? 'MCP' : 'OpenAPI'} integration`}</h3><button type="button" onClick={onCancel} className="setup-step">Cancel</button></div>
    <label className="setup-label mt-5 block">Name<input required value={form.name} onChange={event => set('name', event.target.value)} className="setup-input mt-2 w-full" /></label>
    {form.type === 'mcp' ? <>
      <label className="setup-label mt-4 block">Transport<select value={form.transport} onChange={event => set('transport', event.target.value as 'http' | 'stdio')} className="setup-input mt-2 w-full"><option value="http">HTTP / Streamable HTTP</option><option value="stdio">stdio</option></select></label>
      {form.transport === 'http' ? <label className="setup-label mt-4 block">Endpoint<input required value={form.endpoint} onChange={event => set('endpoint', event.target.value)} className="setup-input mt-2 w-full" placeholder="https://mcp.example.com/mcp" /></label> : <><label className="setup-label mt-4 block">Command<input required value={form.command} onChange={event => set('command', event.target.value)} className="setup-input mt-2 w-full" placeholder="npx" /></label><label className="setup-label mt-4 block">Arguments<input value={form.arguments} onChange={event => set('arguments', event.target.value)} className="setup-input mt-2 w-full" placeholder="-y @example/mcp" /></label></>}
      <label className="setup-label mt-4 block">Environment variables <span className="normal-case tracking-normal">(NAME=value, one per line)</span><textarea value={form.environment} onChange={event => set('environment', event.target.value)} className="setup-input mt-2 min-h-20 w-full" /></label>
    </> : <>
      <label className="setup-label mt-4 block">Specification URL<input value={form.specificationUrl} onChange={event => set('specificationUrl', event.target.value)} className="setup-input mt-2 w-full" placeholder="https://api.example.com/openapi.json" /></label>
      <label className="setup-label mt-4 block">Or specification content<textarea value={form.specificationContent} onChange={event => set('specificationContent', event.target.value)} className="setup-input mt-2 min-h-24 w-full" placeholder="OpenAPI JSON" /></label>
      <label className="setup-label mt-4 block">Base URL<input required value={form.baseUrl} onChange={event => set('baseUrl', event.target.value)} className="setup-input mt-2 w-full" placeholder="https://api.example.com" /></label>
    </>}
    <label className="setup-label mt-4 block">{form.type === 'openapi' ? 'Custom static headers' : 'HTTP headers'} <span className="normal-case tracking-normal">(Name: value, one per line; saved values stay hidden while editing)</span><textarea value={form.headers} onChange={event => set('headers', event.target.value)} className="setup-input mt-2 min-h-20 w-full" /></label>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="setup-label">Authentication<select value={form.authType} onChange={event => set('authType', event.target.value)} className="setup-input mt-2 w-full"><option value="none">None</option><option value="bearer">Bearer token</option><option value="api_key">API key header</option><option value="custom_headers">Custom static headers</option><option value="oauth">OAuth</option></select></label>{form.authType === 'api_key' && <label className="setup-label">Header name<input value={form.authHeaderName} onChange={event => set('authHeaderName', event.target.value)} className="setup-input mt-2 w-full" /></label>}</div>
    {form.authType === 'oauth' ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="setup-label">Authorization URL<input required value={form.authorizationUrl} onChange={event => set('authorizationUrl', event.target.value)} className="setup-input mt-2 w-full" /></label><label className="setup-label">Token URL<input required value={form.tokenUrl} onChange={event => set('tokenUrl', event.target.value)} className="setup-input mt-2 w-full" /></label><label className="setup-label">Client ID<input required value={form.clientId} onChange={event => set('clientId', event.target.value)} className="setup-input mt-2 w-full" /></label><label className="setup-label">Client secret<input type="password" value={form.clientSecret} onChange={event => set('clientSecret', event.target.value)} className="setup-input mt-2 w-full" placeholder="Leave blank to keep saved secret" /></label><label className="setup-label">Scopes<input value={form.scopes} onChange={event => set('scopes', event.target.value)} className="setup-input mt-2 w-full" placeholder="tools.read tools.write" /></label><label className="setup-label">Revocation URL<input value={form.revocationUrl} onChange={event => set('revocationUrl', event.target.value)} className="setup-input mt-2 w-full" /></label></div> : form.authType !== 'none' && form.authType !== 'custom_headers' ? <label className="setup-label mt-4 block">Secret<input type="password" value={form.secret} onChange={event => set('secret', event.target.value)} className="setup-input mt-2 w-full" placeholder="Leave blank to keep saved secret" /></label> : null}
    <label className="mt-5 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={event => set('enabled', event.target.checked)} /> Enabled</label>
    <button type="submit" disabled={saving} className="setup-primary mt-5">{saving ? 'Saving…' : 'Save integration'}</button>
  </form>
}

function IntegrationsSettings() {
  const location = useLocation()
  const type = new URLSearchParams(location.search).get('type') === 'openapi' ? 'openapi' : 'mcp'
  const [items, setItems] = useState<readonly SubpolarIntegration[]>([])
  const [editing, setEditing] = useState<IntegrationFormState | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [gitItems, setGitItems] = useState<readonly SubpolarGitCredential[]>([])
  const [gitForm, setGitForm] = useState({ name: '', provider: 'github' as SubpolarGitCredential['provider'], username: '', token: '', privateKey: '' })
  const refresh = () => integrations().then(result => setItems(result.integrations)).catch(() => setError('Could not load integrations.'))
  useEffect(() => { void refresh(); void gitCredentials().then(result => setGitItems(result.credentials)).catch(() => setError('Could not load Git credentials.')) }, [])
  const formFor = (item?: SubpolarIntegration): IntegrationFormState => {
    const config = item?.config ?? {}
    const auth = typeof config.auth === 'object' && config.auth !== null ? config.auth as Record<string, unknown> : {}
    return { ...emptyIntegrationForm((item?.type as 'mcp' | 'openapi') ?? type), name: item?.name ?? '', transport: config.transport === 'stdio' ? 'stdio' : 'http', endpoint: String(config.endpoint ?? ''), command: String(config.command ?? ''), arguments: Array.isArray(config.arguments) ? config.arguments.join(' ') : '', environment: '', headers: '', specificationUrl: String(config.specificationUrl ?? ''), specificationContent: String(config.specificationContent ?? ''), baseUrl: String(config.baseUrl ?? ''), authType: String(auth.type ?? 'none'), authHeaderName: String(auth.headerName ?? 'x-api-key'), secret: '', authorizationUrl: String(auth.authorizationUrl ?? ''), tokenUrl: String(auth.tokenUrl ?? ''), clientId: String(auth.clientId ?? ''), clientSecret: '', scopes: Array.isArray(auth.scopes) ? auth.scopes.join(' ') : '', revocationUrl: String(auth.revocationUrl ?? ''), enabled: item?.enabled ?? true }
  }
  async function save(form: IntegrationFormState) {
    const config: Record<string, unknown> = form.type === 'mcp' ? { transport: form.transport, ...(form.endpoint ? { endpoint: form.endpoint } : {}), ...(form.command ? { command: form.command } : {}), arguments: form.arguments.split(/\s+/).filter(Boolean) } : { ...(form.specificationUrl ? { specificationUrl: form.specificationUrl } : {}), ...(form.specificationContent ? { specificationContent: form.specificationContent } : {}), baseUrl: form.baseUrl }
    const auth: Record<string, unknown> = { type: form.authType, ...(form.authType === 'api_key' ? { headerName: form.authHeaderName } : {}), ...(form.authType === 'oauth' ? { authorizationUrl: form.authorizationUrl, tokenUrl: form.tokenUrl, clientId: form.clientId, scopes: form.scopes.split(/\s+/).filter(Boolean), ...(form.revocationUrl ? { revocationUrl: form.revocationUrl } : {}) } : {}) }
    config.auth = auth
    const secrets: Record<string, unknown> = { ...(form.headers ? { headers: linesToRecord(form.headers) } : {}), ...(form.environment ? { environment: linesToRecord(form.environment) } : {}), ...(form.authType === 'oauth' && form.clientSecret ? { clientSecret: form.clientSecret } : {}), ...(form.authType === 'bearer' && form.secret ? { token: form.secret } : {}), ...(form.authType === 'api_key' && form.secret ? { apiKey: form.secret } : {}) }
    const result = editingId === null ? await createIntegration({ name: form.name, type: form.type, enabled: form.enabled, config, secrets }) : await updateIntegration(editingId, { name: form.name, type: form.type, enabled: form.enabled, config, ...(Object.keys(secrets).length > 0 ? { secrets } : {}) })
    setItems(current => editingId === null ? [...current, result.integration] : current.map(item => item.id === result.integration.id ? result.integration : item)); setEditing(null); setEditingId(null); setError(null)
  }
  return <div><section className="setup-option mb-6 rounded-xl p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Git credentials</h2><p className="setup-help mt-1 text-sm">Named credentials are stored on the server and never sent to the Agent.</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><input aria-label="Git credential name" placeholder="Name" value={gitForm.name} onChange={event => setGitForm({ ...gitForm, name: event.target.value })} className="setup-input" /><select aria-label="Git provider" value={gitForm.provider} onChange={event => setGitForm({ ...gitForm, provider: event.target.value as SubpolarGitCredential['provider'] })} className="setup-input"><option value="github">GitHub</option><option value="gitlab">GitLab</option><option value="gitea">Gitea</option><option value="generic">Generic Git</option></select><input aria-label="Git username" placeholder="Username (optional)" value={gitForm.username} onChange={event => setGitForm({ ...gitForm, username: event.target.value })} className="setup-input" /><input aria-label="Git token" type="password" placeholder="Access token or password" value={gitForm.token} onChange={event => setGitForm({ ...gitForm, token: event.target.value })} className="setup-input" /></div><button type="button" className="setup-primary mt-3" disabled={!gitForm.name.trim() || !gitForm.token} onClick={() => void createGitCredential({ ...gitForm, username: gitForm.username || undefined, token: gitForm.token }).then(result => { setGitItems(current => [...current, result.credential]); setGitForm({ ...gitForm, name: '', token: '', privateKey: '' }) }).catch(() => setError('Could not save Git credential.'))}>Save Git credential</button>{gitItems.length > 0 && <div className="mt-4 grid gap-2">{gitItems.map(item => <p key={item.id} className="text-sm text-[var(--foreground-base)]">{item.name} <span className="setup-help">· {item.provider}{item.username ? ` · ${item.username}` : ''}</span></p>)}</div>}</section><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Integrations</h2><p className="setup-help mt-1 text-sm">Configure global connections once; Agents select individual discovered capabilities.</p></div><button type="button" onClick={() => { setEditingId(null); setEditing(emptyIntegrationForm(type)) }} className="setup-primary">Add {type === 'mcp' ? 'MCP' : 'OpenAPI'}</button></div><nav className="mt-5 flex gap-2" aria-label="Integration types"><NavLink to="/settings/agent/integrations?type=mcp" className={`setup-step ${type === 'mcp' ? 'setup-step-active' : ''}`}>MCP</NavLink><NavLink to="/settings/agent/integrations?type=openapi" className={`setup-step ${type === 'openapi' ? 'setup-step-active' : ''}`}>OpenAPI</NavLink></nav>{error !== null && <p role="alert" className="setup-error mt-4">{error}</p>}{editing !== null && <IntegrationForm key={`${editingId ?? 'new'}-${editing.type}`} initial={editing} onCancel={() => { setEditing(null); setEditingId(null) }} onSaved={save} />}
    <div className="mt-5 grid gap-3">{items.filter(item => item.type === type).map(item => <article key={item.id} className="setup-option rounded-xl p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium">{item.name}</h3><p className="setup-help mt-1 text-xs">{item.type.toUpperCase()} · {item.status.replace('_', ' ')} · {item.capabilities.length} capabilities</p><p className="setup-help mt-1 text-xs">{item.lastSuccessfulDiscovery === undefined ? 'Not discovered yet' : `Last discovery ${new Date(item.lastSuccessfulDiscovery).toLocaleString()}`}</p>{item.lastError !== undefined && <p className="mt-1 text-xs text-red-300">{item.lastError}</p>}</div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void updateIntegration(item.id, { enabled: !item.enabled }).then(result => setItems(current => current.map(candidate => candidate.id === item.id ? result.integration : candidate))).catch(() => setError('Could not update integration.'))} className="setup-step text-xs">{item.enabled ? 'Disable' : 'Enable'}</button><button type="button" onClick={() => { setEditingId(item.id); setEditing(formFor(item)) }} className="setup-step text-xs">Edit</button><button type="button" onClick={() => void testIntegration(item.id).then(result => setItems(current => current.map(candidate => candidate.id === item.id ? result.integration : candidate))).catch(() => setError('Connection test failed.'))} className="setup-step text-xs">Test / reconnect</button>{typeof (item.config.auth as Record<string, unknown> | undefined)?.type === 'string' && (item.config.auth as Record<string, unknown>).type === 'oauth' && <><button type="button" onClick={() => void startIntegrationOAuth(item.id).then(result => { window.location.assign(result.authorizationUrl) }).catch(() => setError('Could not start authorization.'))} className="setup-step text-xs">Connect</button><button type="button" onClick={() => void revokeIntegrationOAuth(item.id).then(result => setItems(current => current.map(candidate => candidate.id === item.id ? result.integration : candidate))).catch(() => setError('Could not revoke authorization.'))} className="setup-step text-xs">Revoke</button></>}<button type="button" onClick={() => { if (!window.confirm(`Delete ${item.name}?`)) return; void deleteIntegration(item.id).then(() => setItems(current => current.filter(candidate => candidate.id !== item.id))).catch(() => setError('Could not delete integration.')) }} className="setup-step text-xs">Delete</button></div></div></article>)}</div>{items.filter(item => item.type === type).length === 0 && editing === null && <p className="setup-option mt-5 rounded-xl p-4 text-sm setup-help">No {type === 'mcp' ? 'MCP' : 'OpenAPI'} integrations configured.</p>}</div>
}

export default function SettingsPage({ user, onLogout }: { user: SubpolarUser; onLogout: () => void }) {
  const location = useLocation()
  const {
    theme,
    baseThemeName,
    themeMode,
    availableThemes,
    setTheme,
    setThemeMode,
    createCustomTheme,
    fontId,
    fontChoices,
    setFont
  } = useTheme()
  const [, , scopeSegment = 'user', sectionId = 'account'] = location.pathname.split('/')
  const scope: SettingsScope = scopeSegment === 'agent' ? 'agent' : 'user'
  const section = settingsSection(scope, sectionId) ?? SETTINGS_SECTIONS[scope][0]
  const providersTab = location.pathname === '/settings/agent/models/providers'
  const [customThemeLabel, setCustomThemeLabel] = useState('')
  const [customBackground, setCustomBackground] = useState('#1a1b26')
  const [customForeground, setCustomForeground] = useState('#a9b1d6')
  const [customAccent, setCustomAccent] = useState('#7aa2f7')
  const [settingsSectionsOpen, setSettingsSectionsOpen] = useState(false)

  function submitCustomTheme(event: FormEvent) {
    event.preventDefault()
    if (!customThemeLabel.trim()) return
    createCustomTheme({
      label: customThemeLabel,
      background: customBackground,
      foreground: customForeground,
      accent: customAccent
    })
    setCustomThemeLabel('')
  }

  return (
    <main className="setup-page min-h-screen overflow-y-auto p-3 sm:p-4">
      <div className="grid min-h-screen w-full gap-3 md:gap-4 md:grid-cols-[1fr_3fr]">
        <aside className="flex min-h-screen min-w-0 flex-col" aria-label="Settings navigation">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-3xl font-semibold">Settings</h1>
          </div>
          <nav className="mt-4 flex flex-col gap-1" aria-label="Settings scope">
            {(['user', 'agent'] as const).map(item => {
              const Icon = SETTINGS_SCOPE_ICONS[item]
              return (
                <NavLink
                  key={item}
                  to={`/settings/${item}/${SETTINGS_SECTIONS[item][0].id}`}
                  className={`setup-step !text-base w-full capitalize ${scope === item ? 'setup-step-active shadow-none' : ''}`}
                >
                  <Icon size={16} />
                  {item}
                </NavLink>
              )
            })}
          </nav>
          <Separator className="my-4" />
          <nav
            className={`${settingsSectionsOpen ? 'flex' : 'hidden'} min-h-0 flex-col gap-1 md:flex md:flex-1 md:overflow-y-auto`}
            aria-label={`${scope} settings sections`}
          >
            {SETTINGS_SECTIONS[scope].map(item => (
              <NavLink
                key={item.id}
                to={`/settings/${scope}/${item.id}`}
                onClick={() => setSettingsSectionsOpen(false)}
                className={({ isActive }) =>
                  `setup-step !text-base w-full ${isActive ? 'setup-step-active shadow-none' : 'setup-help hover:text-[var(--foreground-base)]'}`
                }
              >
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <Link to="/chat/new" className="setup-step mt-auto w-full setup-help hover:text-[var(--foreground-base)]">
            <ArrowLeft size={16} />
            Back to Conversations
          </Link>
        </aside>
        <section className="min-w-0">
          {scope === 'user' && section.id === 'appearance' ? (
            <>
              <h2 className="text-xl font-semibold">Appearance</h2>
              <label className="setup-label mt-6 block">
                Theme
                <select
                  value={themeMode}
                  onChange={event => setThemeMode(event.target.value as ThemeMode)}
                  className="setup-input mt-2 w-full"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="high-contrast-light">High Contrast Light</option>
                  <option value="high-contrast-dark">High Contrast Dark</option>
                </select>
              </label>
              <div className="mt-6">
                <p className="setup-label">Color theme</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {availableThemes
                    .filter(item => !item.name.startsWith('high-contrast-'))
                    .map(item => (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => setTheme(item.name)}
                        aria-pressed={baseThemeName === item.name}
                        className={`setup-option rounded-xl p-4 text-left ${baseThemeName === item.name ? 'setup-theme-selected' : ''}`}
                      >
                        <span className="block font-medium">{item.label}</span>
                        <span className="mt-3 flex gap-1.5" aria-label={`${item.label} colors`}>
                          {(
                            item.definition?.swatchColors ?? [
                              item.definition?.palette.background.hex,
                              item.definition?.palette.midground.hex,
                              item.definition?.colorOverrides?.primary ?? item.definition?.palette.warmGlow
                            ]
                          )
                            .filter((color): color is string => color !== undefined)
                            .map((color, index) => (
                              <span
                                key={`${color}-${index}`}
                                className="h-6 flex-1 rounded-sm border border-black/10"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
              <form onSubmit={submitCustomTheme} className="setup-option mt-6 rounded-xl p-4">
                <h3 className="font-medium">Create custom theme</h3>
                <label className="setup-label mt-4 block">
                  Name
                  <input
                    value={customThemeLabel}
                    onChange={event => setCustomThemeLabel(event.target.value)}
                    className="setup-input mt-2 w-full"
                    placeholder="My theme"
                  />
                </label>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ['Background', customBackground, setCustomBackground],
                      ['Foreground', customForeground, setCustomForeground],
                      ['Accent', customAccent, setCustomAccent]
                    ] as const
                  ).map(([label, value, setValue]) => (
                    <label key={label} className="setup-label">
                      {label}
                      <input
                        type="color"
                        value={value}
                        onChange={event => setValue(event.target.value)}
                        className="mt-2 h-10 w-full cursor-pointer rounded border border-white/10 bg-transparent p-1"
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={!customThemeLabel.trim()}
                  className="setup-primary mt-4 disabled:opacity-40"
                >
                  Create theme
                </button>
              </form>
              <label className="setup-label mt-8 block">
                Interface font
                <select
                  value={fontId}
                  onChange={event => setFont(event.target.value)}
                  className="setup-input mt-2 w-full"
                >
                  {fontChoices.map(choice => (
                    <option key={choice.id} value={choice.id}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="setup-help mt-5 text-sm">Active theme: {theme.label}</p>
            </>
          ) : scope === 'user' && section.id === 'account' ? (
            <>
              <h2 className="text-xl font-semibold">Account</h2>
              <div className="setup-option mt-6 rounded-xl p-4">
                <p className="setup-label">Username</p>
                <p className="mt-2 font-medium">{user.username}</p>
              </div>
              <button type="button" onClick={onLogout} className="setup-primary mt-6">
                Log out
              </button>
            </>
          ) : scope === 'agent' && section.id === 'models' ? (
            providersTab ? (
              <ProvidersSettings />
            ) : (
              <ModelsSettings />
            )
          ) : scope === 'agent' && section.id === 'skills' ? (
            <SkillsSettings />
          ) : scope === 'agent' && section.id === 'integrations' ? (
            <IntegrationsSettings />
          ) : scope === 'user' && section.id === 'prompt-commands' ? (
            <PromptCommandsSettings />
          ) : (
            <>
              <h2 className="text-xl font-semibold">{section.label}</h2>
              <div className="setup-option mt-6 rounded-xl p-4">
                <p className="setup-help text-sm">Configuration for this section is not available yet.</p>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
