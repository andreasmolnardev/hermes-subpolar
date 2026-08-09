import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Bot } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { ModelProviderDefinition } from "@hermes/shared/model-providers";
import { completeProviderDeviceAuth, configureProvider, createInitialAgents, setupProviders, setupStatus, startProviderDeviceAuth, startProviderOAuth } from "@/lib/subpolar-api";

type SetupStep = "provider" | "agents";

function SetupCard({ step, canOpenAgents, children, editing, backTo }: { step: SetupStep; canOpenAgents: boolean; children: ReactNode; editing: boolean; backTo: string }) {
  return (
    <main className="setup-page flex min-h-screen items-center justify-center px-5 py-8">
      <section className="setup-card w-full max-w-xl rounded-2xl p-8 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="setup-icon flex h-11 w-11 items-center justify-center rounded-xl"><Bot size={21} /></div>
          <div>
            <p className="setup-eyebrow">Subpolar setup</p>
            <h1 className="text-2xl font-semibold">{editing ? "Provider settings" : step === "provider" ? "Connect a model provider" : "Choose your agent team"}</h1>
          </div>
        </div>
        {editing ? <Link to={backTo} className="setup-help mb-6 inline-block text-sm hover:underline">Back to settings</Link> : null}
        {!editing ? <nav aria-label="Setup steps" className="mb-7 grid grid-cols-2 gap-2">
          {(["provider", "agents"] as const).map((item, index) => (
            <Link
              key={item}
              to={item === "provider" ? "/setup" : "/setup/agents"}
              aria-disabled={item === "agents" && !canOpenAgents}
              onClick={event => {
                if (item === "agents" && !canOpenAgents) event.preventDefault();
              }}
              className={`setup-step ${step === item ? "setup-step-active" : ""}`}
            >
              <span className="setup-step-number">{index + 1}</span>
              {item === "provider" ? "Provider" : "Agents"}
            </Link>
          ))}
        </nav> : null}
        {children}
      </section>
    </main>
  );
}

export function ProviderSetupScreen({ onComplete, editing = false }: { onComplete: () => void; editing?: boolean }) {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const step: SetupStep = editing ? "provider" : location.pathname === "/setup/agents" ? "agents" : "provider";
  const initialProviderId = new URLSearchParams(location.search).get("provider");
  const [providers, setProviders] = useState<readonly ModelProviderDefinition[]>([]);
  const [providerId, setProviderId] = useState("openai-api");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [research, setResearch] = useState(false);
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<{ readonly deviceCode: string; readonly userCode?: string; readonly verificationUri?: string; readonly verificationUriComplete?: string } | null>(null);
  const [deviceInput, setDeviceInput] = useState("");
  const navigate = useCallback((next: SetupStep, replace = false): void => {
    if (editing) return;
    routerNavigate(next === "provider" ? "/setup" : "/setup/agents", { replace });
  }, [editing, routerNavigate]);

  useEffect(() => {
    void Promise.all([setupProviders(), setupStatus()])
      .then(([catalog, status]) => {
        setProviders(catalog.providers);
        setProviderConfigured(status.providerConfigured);
        if (!status.providerConfigured && step === "agents") {
          navigate("provider", true);
        }
        const selected = catalog.providers.find(item => item.id === initialProviderId) ?? catalog.providers.find(item => item.id === "openai-api") ?? catalog.providers[0];
        if (selected === undefined) return;
        setProviderId(selected.id);
        setBaseUrl(selected.baseUrl ?? "");
        setModel(selected.fallbackModels?.[0] ?? "");
      })
      .catch(() => setError("Could not load setup configuration."));
  }, [initialProviderId, navigate, step]);

  function selectProvider(slug: string): void {
    const selected = providers.find(item => item.id === slug);
    setProviderId(slug);
    setBaseUrl(selected?.baseUrl ?? "");
    setModel(selected?.fallbackModels?.[0] ?? "");
  }

  async function submitProvider(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (selectedProvider?.authType === "oauth") {
        const result = await startProviderOAuth(providerId, baseUrl, model);
        window.location.assign(result.authorizationUrl);
        return;
      }
      await configureProvider(providerId, baseUrl, selectedProvider?.requiresCredential === false ? "none" : apiKey, model);
      setProviderConfigured(true);
      if (editing) onComplete();
      else navigate("agents");
    } catch {
      setError("Could not save that provider connection. Check the provider, URL, credential, and model.");
    } finally {
      setBusy(false);
    }
  }

  async function beginDevice(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      setDevice(await startProviderDeviceAuth(providerId));
    } catch {
      setError("Could not start the device authorization flow.");
    } finally {
      setBusy(false);
    }
  }

  async function finishDevice(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await completeProviderDeviceAuth(providerId, deviceInput || device?.deviceCode || "");
      setProviderConfigured(true);
      setDevice(null);
      navigate("agents");
    } catch {
      setError("Could not complete the device authorization flow.");
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

  const selectedProvider = providers.find(item => item.id === providerId);

  return (
    <SetupCard step={step} canOpenAgents={providerConfigured} editing={editing} backTo="/settings/agent/models/providers">
      {step === "provider" ? (
        <form onSubmit={submitProvider}>
          <p className="setup-copy mb-6">Choose from the same provider catalog used by Hermes provider settings. Credentials stay on this server and are never sent back to the browser.</p>
          <label className="setup-label mb-4">Provider
              <select value={providerId} onChange={event => selectProvider(event.target.value)} disabled={providers.length === 0} className="setup-input mt-2 w-full"><option value="">Select a provider</option>{providers.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          </label>
          {selectedProvider?.description !== undefined ? <p className="setup-help -mt-2 mb-4">{selectedProvider.description}</p> : null}
           <label className="setup-label mb-4">Base URL<input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} type="url" required className="setup-input mt-2 w-full" /></label>
           {selectedProvider?.authType !== "oauth" && selectedProvider?.authType !== "copilot" && selectedProvider?.requiresCredential !== false ? <label className="setup-label mb-4">{selectedProvider?.authType === "aws_sdk" ? "AWS credentials JSON or env" : selectedProvider?.authType === "gcp" ? "GCP access token or env" : selectedProvider?.authType === "external_process" ? "Process credentials JSON" : "API key"}<input value={apiKey} onChange={event => setApiKey(event.target.value)} type="password" autoComplete="off" required className="setup-input mt-2 w-full" /></label> : null}
           {selectedProvider?.authType === "copilot" && device === null ? <button type="button" onClick={() => void beginDevice()} disabled={busy} className="setup-primary mb-4 w-full">{busy ? "Working..." : "Connect with GitHub device login"}</button> : null}
           {device !== null ? <div className="setup-option mb-4 rounded-xl p-4"><p className="setup-help">Open {device.verificationUriComplete ?? device.verificationUri ?? "the GitHub verification URL"} and enter {device.userCode ?? "the displayed code"}.</p><input value={deviceInput} onChange={event => setDeviceInput(event.target.value)} placeholder="Device code" className="setup-input mt-3 w-full" /><button type="button" onClick={() => void finishDevice()} disabled={busy} className="setup-primary mt-3 w-full">Complete device login</button></div> : null}
          <label className="setup-label mb-5">Default model<input value={model} onChange={event => setModel(event.target.value)} required className="setup-input mt-2 w-full" /></label>
          {error !== null ? <p role="alert" className="setup-error mb-4">{error}</p> : null}
           {selectedProvider?.authType !== "copilot" ? <button disabled={busy || providers.length === 0} className="setup-primary w-full">{busy ? "Working..." : selectedProvider?.authType === "oauth" ? "Continue to sign in" : "Continue"}</button> : null}
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
