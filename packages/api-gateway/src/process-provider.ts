import { resolve } from "node:path";
import {
  ProviderError,
  validateProviderRequest,
  validateProviderResult,
  type ChatProvider,
  type ProviderRequest
} from "chat-provider-interface";
import type { ProviderCredentials } from "data-layer";

function allowedExecutable(executable: string): string {
  const normalized = resolve(executable);
  const allowed = new Set((process.env.SUBPOLAR_PROVIDER_EXECUTABLES ?? "").split(",").map(item => item.trim()).filter(Boolean).map(item => resolve(item)));
  if (allowed.size === 0 || !allowed.has(normalized)) throw new ProviderError("Provider executable is not allowlisted", { category: "authorization" });
  return normalized;
}

export function createExternalProcessProvider(credentials: ProviderCredentials): ChatProvider {
  if (credentials.executable === undefined) throw new ProviderError("Provider executable is not configured", { category: "invalid_request" });
  const executable = allowedExecutable(credentials.executable);
  const args = credentials.arguments ?? [];
  if (args.some(argument => argument.includes("\u0000"))) throw new TypeError("Provider process arguments are invalid");
  return {
    async complete(request) {
      validateProviderRequest(request);
      const child = Bun.spawn({
        cmd: [executable, ...args],
        stdin: "pipe",
        stdout: "pipe",
        stderr: "ignore",
        env: { PATH: process.env.PATH ?? "" }
      });
      const signal = request.signal ?? request.cancellation;
      const abort = () => child.kill();
      if (signal !== undefined) {
        if (signal.aborted) { child.kill(); throw new ProviderError("Provider process cancelled", { category: "cancelled" }); }
        signal.addEventListener("abort", abort, { once: true });
      }
      try {
        await child.stdin.write(`${JSON.stringify(request)}\n`);
        await child.stdin.end();
        const output = await new Response(child.stdout).text();
        await child.exited;
        if (signal?.aborted) throw new ProviderError("Provider process cancelled", { category: "cancelled" });
        let value: unknown;
        try { value = JSON.parse(output); } catch { throw new ProviderError("Provider process returned malformed JSON", { category: "invalid_request" }); }
        if (typeof value !== "object" || value === null || !Object.hasOwn(value, "message") || !Object.hasOwn(value, "usage")) throw new ProviderError("Provider process returned an invalid result", { category: "invalid_request" });
        const result = value as Parameters<typeof validateProviderResult>[0];
        validateProviderResult(result);
        return result;
      } finally {
        if (signal !== undefined) signal.removeEventListener("abort", abort);
        if (!child.killed) child.kill();
      }
    }
  };
}
