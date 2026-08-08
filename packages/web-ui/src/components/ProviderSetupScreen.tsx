import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import type { ModelProviderDefinition } from "@hermes/shared/model-providers";
import { configureProvider, createInitialAgents, setupProviders, setupStatus } from "@/lib/subpolar-api";

type SetupStep = "provider" | "agents";

function stepFromPath(): SetupStep {
  return typeof window !== "undefined" && window.location.pathname === "/setup/agents" ? "agents" : "provider";
}

function SetupCard({ step, canOpenAgents, onStep, children }: { step: SetupStep; canOpenAgents: boolean; onStep: (next: SetupStep) => void; children: ReactNode }) {
  return (
    <main className="setup-page flex min-h-screen items-center justify-center px-5 py-8">
      <section className="setup-card w-full max-w-xl rounded-2xl p-8 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="setup-icon flex h-11 w-11 items-center justify-center rounded-xl"><Sparkles size={21} /></div>
          <div>
            <p className="setup-eyebrow">Subpolar setup</p>
            <h1 className="text-2xl font-semibold">{step === "provider" ? "Connect a model provider" : "Choose your agent team"}</h1>
          </div>
        </div>
        <nav aria-label="Setup steps" className="mb-7 grid grid-cols-2 gap-2">
          {(["provider", "agents"] as const).map((item, index) => (
            <button
              key={item}
              type="button"
              disabled={item === "agents" && !canOpenAgents}
              onClick={() => onStep(item)}
              className={`setup-step ${step === item ? "setup-step-active" : ""}`}
            >
              <span className="setup-step-number">{index + 1}</span>
              {item === "provider" ? "Provider" : "Agents"}
            </button>
          ))}
        </nav>
        {children}
      </section>
    </main>
  );
}

export function ProviderSetupScreen({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<SetupStep>(stepFromPath);
  const [providers, setProviders] = useState<readonly ModelProviderDefinition[]>([]);
  const [provider, setProvider] = useState("openai-api");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [research, setResearch] = useState(false);
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onPopState = () => setStep(stepFromPath());
    window.addEventListener("popstate", onPopState);
    void Promise.all([setupProviders(), setupStatus()])
      .then(([catalog, status]) => {
        setProviders(catalog.providers);
        setProviderConfigured(status.providerConfigured);
        if (!status.providerConfigured && stepFromPath() === "agents") {
          navigate("provider", true);
        }
        const selected = catalog.providers.find(item => item.slug === "openai-api") ?? catalog.providers[0];
        if (selected === undefined) return;
        setProvider(selected.slug);
        setBaseUrl(selected.baseUrl ?? "");
      })
      .catch(() => setError("Could not load setup configuration."));
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(next: SetupStep, replace = false): void {
    const path = next === "provider" ? "/setup" : "/setup/agents";
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history[replace ? "replaceState" : "pushState"]({}, "", path);
    }
    setStep(next);
  }

  function selectProvider(slug: string): void {
    const selected = providers.find(item => item.slug === slug);
    setProvider(slug);
    setBaseUrl(selected?.baseUrl ?? "");
  }

  async function submitProvider(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await configureProvider(provider, baseUrl, apiKey, model);
      setProviderConfigured(true);
      navigate("agents");
    } catch {
      setError("Could not save that provider connection. Check the provider, URL, credential, and model.");
    } finally {
      setBusy(false);
    }
  }

  async function finish(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createInitialAgents(research ? ["research"] : []);
      onComplete();
    } catch {
      setError("Could not create the selected agents.");
    } finally {
      setBusy(false);
    }
  }

  const selectedProvider = providers.find(item => item.slug === provider);

  return (
    <SetupCard step={step} canOpenAgents={providerConfigured} onStep={next => navigate(next)}>
      {step === "provider" ? (
        <form onSubmit={submitProvider}>
          <p className="setup-copy mb-6">Choose from the same provider catalog used by Hermes provider settings. Credentials stay on this server and are never sent back to the browser.</p>
          <label className="setup-label mb-4">Provider
            <select value={provider} onChange={event => selectProvider(event.target.value)} disabled={providers.length === 0} className="setup-input mt-2 w-full"><option value="">Select a provider</option>{providers.map(item => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select>
          </label>
          {selectedProvider?.description !== undefined ? <p className="setup-help -mt-2 mb-4">{selectedProvider.description}</p> : null}
          <label className="setup-label mb-4">Base URL<input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} type="url" required className="setup-input mt-2 w-full" /></label>
          <label className="setup-label mb-4">API key or access token<input value={apiKey} onChange={event => setApiKey(event.target.value)} type="password" autoComplete="off" required className="setup-input mt-2 w-full" /></label>
          <label className="setup-label mb-5">Default model<input value={model} onChange={event => setModel(event.target.value)} required className="setup-input mt-2 w-full" /></label>
          {error !== null ? <p role="alert" className="setup-error mb-4">{error}</p> : null}
          <button disabled={busy || providers.length === 0} className="setup-primary w-full">{busy ? "Working..." : "Continue"}</button>
        </form>
      ) : (
        <form onSubmit={finish}>
          <p className="setup-copy mb-6">Every workspace includes <strong>master</strong>, your primary agent. Add specialists now; you can manage them later.</p>
          <label className="setup-option mb-5 flex cursor-pointer gap-3 rounded-xl p-4"><input checked={research} onChange={event => setResearch(event.target.checked)} type="checkbox" className="mt-1" /><span><span className="block font-medium">Research</span><span className="setup-help mt-1 block">Investigates questions and returns concise findings for master.</span></span></label>
          {error !== null ? <p role="alert" className="setup-error mb-4">{error}</p> : null}
          <button disabled={busy} className="setup-primary w-full">{busy ? "Working..." : "Open workspace"}</button>
        </form>
      )}
    </SetupCard>
  );
}
