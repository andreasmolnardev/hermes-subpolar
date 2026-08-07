import { useEffect, useState, type FormEvent } from "react";
import { Sparkles } from "lucide-react";
import type { ModelProviderDefinition } from "@hermes/shared/model-providers";
import { configureProvider, createInitialAgents, setupProviders } from "@/lib/subpolar-api";

export function ProviderSetupScreen({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<"provider" | "agents">("provider");
  const [providers, setProviders] = useState<readonly ModelProviderDefinition[]>([]);
  const [provider, setProvider] = useState("openai-api");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [research, setResearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void setupProviders()
      .then(result => {
        setProviders(result.providers);
        const selected = result.providers.find(item => item.slug === "openai-api") ?? result.providers[0];
        if (selected === undefined) return;
        setProvider(selected.slug);
        setBaseUrl(selected.baseUrl ?? "");
      })
      .catch(() => setError("Could not load model providers."));
  }, []);

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
      setStep("agents");
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
    <main className="flex min-h-screen items-center justify-center bg-[#041c1c] px-5 text-[#ffe6cb]">
      <form onSubmit={step === "provider" ? submitProvider : finish} className="w-full max-w-xl rounded-2xl border border-[#ffe6cb]/15 bg-[#102b2d] p-8 shadow-2xl shadow-black/30">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f0c9a5] text-[#102b2d]"><Sparkles size={21} /></div>
          <div><p className="text-xs uppercase tracking-[0.24em] text-[#91aaa0]">Subpolar setup</p><h1 className="text-2xl font-semibold">{step === "provider" ? "Connect a model provider" : "Choose your agent team"}</h1></div>
        </div>
        {step === "provider" ? (
          <>
            <p className="mb-6 text-sm leading-6 text-[#b9c7bd]">Choose from same provider catalog used by Hermes provider settings. Credentials stay on this server and are never sent back to browser.</p>
            <label className="mb-4 block text-xs uppercase tracking-[0.14em] text-[#91aaa0]">Provider
              <select value={provider} onChange={event => selectProvider(event.target.value)} disabled={providers.length === 0} className="mt-2 w-full rounded-lg border border-[#ffe6cb]/15 bg-[#0b2224] px-3 py-3 text-sm normal-case tracking-normal text-[#ffe6cb] outline-none focus:border-[#f0c9a5]"><option value="">Select a provider</option>{providers.map(item => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select>
            </label>
            {selectedProvider?.description !== undefined ? <p className="-mt-2 mb-4 text-xs text-[#91aaa0]">{selectedProvider.description}</p> : null}
            <label className="mb-4 block text-xs uppercase tracking-[0.14em] text-[#91aaa0]">Base URL<input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} type="url" required className="mt-2 w-full rounded-lg border border-[#ffe6cb]/15 bg-[#0b2224] px-3 py-3 text-sm normal-case tracking-normal text-[#ffe6cb] outline-none focus:border-[#f0c9a5]" /></label>
            <label className="mb-4 block text-xs uppercase tracking-[0.14em] text-[#91aaa0]">API key or access token<input value={apiKey} onChange={event => setApiKey(event.target.value)} type="password" autoComplete="off" required className="mt-2 w-full rounded-lg border border-[#ffe6cb]/15 bg-[#0b2224] px-3 py-3 text-sm normal-case tracking-normal text-[#ffe6cb] outline-none focus:border-[#f0c9a5]" /></label>
            <label className="mb-5 block text-xs uppercase tracking-[0.14em] text-[#91aaa0]">Default model<input value={model} onChange={event => setModel(event.target.value)} required className="mt-2 w-full rounded-lg border border-[#ffe6cb]/15 bg-[#0b2224] px-3 py-3 text-sm normal-case tracking-normal text-[#ffe6cb] outline-none focus:border-[#f0c9a5]" /></label>
          </>
        ) : (
          <>
            <p className="mb-6 text-sm leading-6 text-[#b9c7bd]">Every workspace includes <strong className="text-[#ffe6cb]">master</strong>, your primary agent. Add specialists now; you can manage them later.</p>
            <label className="mb-5 flex cursor-pointer gap-3 rounded-xl border border-[#ffe6cb]/15 bg-[#0b2224] p-4"><input checked={research} onChange={event => setResearch(event.target.checked)} type="checkbox" className="mt-1 accent-[#f0c9a5]" /><span><span className="block font-medium">Research</span><span className="mt-1 block text-sm leading-5 text-[#91aaa0]">Investigates questions and returns concise findings for master.</span></span></label>
          </>
        )}
        {error !== null ? <p role="alert" className="mb-4 rounded-lg border border-red-300/20 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
        <button disabled={busy || (step === "provider" && providers.length === 0)} className="w-full rounded-lg bg-[#f0c9a5] px-4 py-3 text-sm font-semibold text-[#102b2d] transition hover:bg-[#ffe6cb] disabled:opacity-50">{busy ? "Working…" : step === "provider" ? "Continue" : "Open workspace"}</button>
      </form>
    </main>
  );
}
