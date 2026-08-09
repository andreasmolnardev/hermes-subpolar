import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Bot, UserRound } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  availableModels,
  modelDefaults,
  saveModelDefaults,
  setupProviders,
  type SubpolarModelDefaults,
  type SubpolarModelProvider,
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
