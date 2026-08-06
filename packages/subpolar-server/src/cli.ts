import { createOpenAICompatibleProvider } from "chat-provider-interface";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startSubpolarServer } from "./server";

export type SubpolarCliOptions = {
  readonly host: string;
  readonly port: number;
  readonly configPath?: string;
  readonly dataDir?: string;
};

function positivePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("--port must be a valid TCP port");
  return port;
}

export function parseSubpolarArgs(args: readonly string[]): SubpolarCliOptions {
  let index = 0;
  if (args[0] === "serve") index = 1;
  else if (args[0] !== undefined && !args[0].startsWith("-")) throw new Error(`unknown command: ${args[0]}`);
  let host = "127.0.0.1";
  let port = 8080;
  let configPath: string | undefined;
  let dataDir: string | undefined;
  while (index < args.length) {
    const flag = args[index++];
    const value = args[index++];
    if (value === undefined || value.startsWith("-")) throw new Error(`${flag} requires a value`);
    if (flag === "--host") host = value;
    else if (flag === "--port") port = positivePort(value);
    else if (flag === "--config") configPath = value;
    else if (flag === "--data-dir") dataDir = value;
    else throw new Error(`unknown option: ${flag}`);
  }
  if (!host || /[\r\n\0]/.test(host)) throw new Error("--host is invalid");
  return { host, port, ...(configPath === undefined ? {} : { configPath }), ...(dataDir === undefined ? {} : { dataDir }) };
}

export type SubpolarConfig = { readonly host?: string; readonly port?: number; readonly staticRoot?: string; readonly providerBaseUrl?: string };

export function parseSubpolarConfig(text: string): SubpolarConfig {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    const object: Record<string, unknown> = {};
    for (const [lineNumber, line] of text.split(/\r?\n/).entries()) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = /^(\w+)\s*:\s*(.*?)\s*$/.exec(trimmed);
      if (!match || match[1] === undefined || match[2] === undefined || line !== trimmed) {
        throw new Error(`config YAML line ${lineNumber + 1} is invalid`);
      }
      if (Object.hasOwn(object, match[1])) throw new Error(`config contains duplicate key: ${match[1]}`);
      const raw = match[2].replace(/\s+#.*$/, "").trim();
      object[match[1]] = raw === "true" ? true : raw === "false" ? false : /^-?\d+$/.test(raw) ? Number(raw) : raw.replace(/^(['"])(.*)\1$/, "$2");
    }
    value = object;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("config must be an object");
  const record = value as Record<string, unknown>;
  const allowed = new Set(["host", "port", "staticRoot", "providerBaseUrl"]);
  for (const key of Object.keys(record)) if (!allowed.has(key)) throw new Error(`config contains unknown key: ${key}`);
  if (record.host !== undefined && (typeof record.host !== "string" || !record.host)) throw new Error("config.host is invalid");
  if (record.port !== undefined && (typeof record.port !== "number" || !Number.isInteger(record.port))) throw new Error("config.port is invalid");
  if (record.staticRoot !== undefined && (typeof record.staticRoot !== "string" || !record.staticRoot)) throw new Error("config.staticRoot is invalid");
  if (record.providerBaseUrl !== undefined && (typeof record.providerBaseUrl !== "string" || !record.providerBaseUrl)) throw new Error("config.providerBaseUrl is invalid");
  return record as SubpolarConfig;
}

async function loadConfig(path: string | undefined): Promise<SubpolarConfig> {
  if (path === undefined) return {};
  return parseSubpolarConfig(await readFile(path, "utf8"));
}

export async function runSubpolar(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  const cli = parseSubpolarArgs(args);
  const config = await loadConfig(cli.configPath);
  const baseUrl = config.providerBaseUrl;
  const apiKey = process.env.SUBPOLAR_OPENAI_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("providerBaseUrl in --config and SUBPOLAR_OPENAI_API_KEY are required");
  const port = config.port ?? cli.port;
  if (config.port !== undefined) positivePort(String(config.port));
  startSubpolarServer({
    provider: createOpenAICompatibleProvider({ baseUrl, credentials: { apiKey }, fetch }),
    hostname: config.host ?? cli.host,
    port,
    staticRoot: config.staticRoot ?? resolve(process.cwd(), "packages/web-ui/dist"),
    ...(cli.dataDir === undefined ? {} : { dataDir: cli.dataDir }),
  });
}

if (import.meta.main) await runSubpolar();
