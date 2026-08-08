import type { HarnessContext, HarnessContextAssembler, HarnessMessage } from "./index";
import { truncateUtf8, utf8Bytes } from "./tool-output";

export const HARNESS_PROMPT_SECTION_ORDER = [
  "identity",
  "tool-guidance",
  "workspace",
  "session",
  "instructions",
  "turn"
] as const;

export type HarnessPromptSectionName = typeof HARNESS_PROMPT_SECTION_ORDER[number];

export type HarnessPromptSource = {
  /** Runtime validation intentionally rejects kinds outside the first cut. */
  readonly kind: string;
  readonly content: string;
  readonly sessionId?: string;
  readonly workspaceId?: string;
};

export type HarnessPromptBudget = {
  /** Maximum UTF-8 bytes retained in the generated system prompt. */
  readonly maxBytes?: number;
  /** Maximum estimated tokens retained in the generated system prompt. */
  readonly maxTokens?: number;
  /** Bytes per estimated token. Defaults to four. */
  readonly bytesPerToken?: number;
};

export type HarnessPromptAssemblerOptions = {
  readonly sources?: readonly HarnessPromptSource[];
  readonly cache?: boolean;
  readonly budget?: HarnessPromptBudget;
};

export type HarnessPromptSection = {
  readonly name: HarnessPromptSectionName;
  readonly content: string;
  readonly startByte: number;
  readonly endByte: number;
  readonly cacheable: boolean;
  readonly truncated: boolean;
};

export type HarnessPromptCacheMarker = {
  readonly kind: "start" | "end";
  readonly byteOffset: number;
  readonly section: HarnessPromptSectionName;
};

export type HarnessPromptAssembly = {
  readonly messages: readonly HarnessMessage[];
  readonly systemPrompt: string;
  readonly serialized: string;
  readonly byteLength: number;
  readonly estimatedTokens: number;
  readonly sections: readonly HarnessPromptSection[];
  readonly cache: {
    readonly enabled: boolean;
    readonly prefixEndByte: number | undefined;
    readonly markers: readonly HarnessPromptCacheMarker[];
  };
};

export type HarnessUnsupportedSourceKind =
  | "filesystem"
  | "network"
  | "memory"
  | "plugin"
  | "discovery"
  | "unknown";

export type HarnessUnsupportedKind = "context" | "model" | "tokens";
export type HarnessUnsupportedReason =
  | "unsupported-context-source"
  | "unsupported-model"
  | "unsupported-token-shape";

export class HarnessUnsupportedError extends Error {
  readonly kind: HarnessUnsupportedKind;
  readonly reason: HarnessUnsupportedReason;

  constructor(kind: HarnessUnsupportedKind, reason: HarnessUnsupportedReason, message: string) {
    super(message);
    this.name = "HarnessUnsupportedError";
    this.kind = kind;
    this.reason = reason;
  }
}

export class HarnessUnsupportedContextSourceError extends HarnessUnsupportedError {
  readonly sourceKind: string;

  constructor(sourceKind: string) {
    super(
      "context",
      "unsupported-context-source",
      `Context source is unsupported by the TypeScript harness runtime: ${sourceKind}`
    );
    this.name = "HarnessUnsupportedContextSourceError";
    this.sourceKind = sourceKind;
  }
}

const SECTION_START = "<harness-section name=\"";
const SECTION_END = "</harness-section>";
const DEFAULT_BYTES_PER_TOKEN = 4;

function normalizeContent(content: string): string {
  return content.replace(/\r\n?/g, "\n");
}

function sectionWrapper(name: HarnessPromptSectionName, content: string): string {
  return `${SECTION_START}${name}">\n${content}\n${SECTION_END}\n`;
}

function sourceRank(kind: string): number {
  const rank = HARNESS_PROMPT_SECTION_ORDER.indexOf(kind as HarnessPromptSectionName);
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
}

function sourceKind(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "unknown";
  const kind = (value as { readonly kind?: unknown }).kind;
  return typeof kind === "string" && kind.length > 0 ? kind : "unknown";
}

function validateSource(source: HarnessPromptSource, context: HarnessContext): void {
  const kind = sourceKind(source);
  if (sourceRank(kind) === Number.MAX_SAFE_INTEGER) {
    throw new HarnessUnsupportedContextSourceError(kind);
  }
  if (typeof source.content !== "string") {
    throw new TypeError(`Context source ${kind} content must be a string`);
  }
  if (source.sessionId !== undefined && source.sessionId !== context.sessionId) {
    throw new Error(`Context source ${kind} is scoped to another session`);
  }
  if (source.workspaceId !== undefined && source.workspaceId !== context.workspaceId) {
    throw new Error(`Context source ${kind} is scoped to another workspace`);
  }
  if ((kind === "session" || kind === "turn") && source.sessionId !== context.sessionId) {
    throw new Error(`Context source ${kind} must declare the active session scope`);
  }
  if (kind === "workspace" && (source.workspaceId === undefined || source.workspaceId !== context.workspaceId)) {
    throw new Error("Workspace context must declare the active workspace scope");
  }
}

function effectiveByteBudget(budget: HarnessPromptBudget | undefined): number | undefined {
  if (budget === undefined) return undefined;
  const candidates = [budget.maxBytes].filter((value): value is number => value !== undefined);
  if (budget.maxTokens !== undefined) {
    const bytesPerToken = budget.bytesPerToken ?? DEFAULT_BYTES_PER_TOKEN;
    if (!Number.isFinite(bytesPerToken) || bytesPerToken <= 0) {
      throw new RangeError("bytesPerToken must be a positive finite number");
    }
    candidates.push(Math.floor(budget.maxTokens * bytesPerToken));
  }
  if (candidates.some(value => !Number.isFinite(value) || value < 0)) {
    throw new RangeError("Prompt budgets must be finite non-negative numbers");
  }
  return candidates.length === 0 ? undefined : Math.min(...candidates);
}

function orderedSources(sources: readonly HarnessPromptSource[], context: HarnessContext): readonly HarnessPromptSource[] {
  const checked = sources.map(source => {
    validateSource(source, context);
    return { ...source, content: normalizeContent(source.content) };
  });
  return checked
    .map((source, index) => ({ source, index }))
    .sort((left, right) => sourceRank(left.source.kind) - sourceRank(right.source.kind) || left.index - right.index)
    .map(entry => entry.source);
}

function assemble(context: HarnessContext, options: HarnessPromptAssemblerOptions): HarnessPromptAssembly {
  const sources = orderedSources(options.sources ?? [], context);
  const byteBudget = effectiveByteBudget(options.budget);

  // A caller that already assembled a system message owns its exact prompt.
  // This also prevents a second system message from changing provider role order.
  if (context.messages.some(message => message.role === "system")) {
    return {
      messages: context.messages,
      systemPrompt: "",
      serialized: "",
      byteLength: 0,
      estimatedTokens: 0,
      sections: [],
      cache: { enabled: false, prefixEndByte: undefined, markers: [] }
    };
  }

  const sections: HarnessPromptSection[] = [];
  let serialized = "";

  for (const source of sources) {
    const cacheable = source.kind === "identity" || source.kind === "tool-guidance";
    const name = source.kind as HarnessPromptSectionName;
    const full = sectionWrapper(name, source.content);
    const remaining = byteBudget === undefined ? undefined : byteBudget - utf8Bytes(serialized);
    if (remaining !== undefined && remaining <= 0) {
      break;
    }
    const rendered = remaining === undefined || utf8Bytes(full) <= remaining
      ? full
      : sectionWrapper(
        name,
        truncateUtf8(source.content, Math.max(0, remaining - utf8Bytes(sectionWrapper(name, "")))).value
      );
    const renderedBytes = utf8Bytes(rendered);
    if (renderedBytes === 0 || (remaining !== undefined && renderedBytes > remaining)) {
      break;
    }
    const startByte = utf8Bytes(serialized);
    serialized += rendered;
    sections.push({
      name,
      content: rendered,
      startByte,
      endByte: startByte + renderedBytes,
      cacheable,
      truncated: rendered !== full
    });
    if (rendered !== full) {
      break;
    }
  }

  // A budget can omit later sections, but never allows a non-contiguous cache
  // prefix to be described as cacheable.
  const prefixSections: readonly HarnessPromptSection[] = sections.filter(section => section.cacheable);
  const prefixEndByte = prefixSections.length === 0 || prefixSections.length !== sections.findIndex(section => !section.cacheable)
    ? prefixSections.length === sections.length && prefixSections.length > 0
      ? sections.at(-1)?.endByte
      : undefined
    : prefixSections.at(-1)?.endByte;
  const cacheEnabled = options.cache === true && prefixEndByte !== undefined;
  const markers: readonly HarnessPromptCacheMarker[] = cacheEnabled
    ? [
      { kind: "start", byteOffset: prefixSections[0]!.startByte, section: prefixSections[0]!.name },
      { kind: "end", byteOffset: prefixEndByte!, section: prefixSections.at(-1)!.name }
    ]
    : [];
  const systemPrompt = serialized;
  const messages: readonly HarnessMessage[] = systemPrompt.length === 0
    ? context.messages
    : [{ role: "system", content: systemPrompt }, ...context.messages];
  const bytes = utf8Bytes(systemPrompt);
  const bytesPerToken = options.budget?.bytesPerToken ?? DEFAULT_BYTES_PER_TOKEN;

  return {
    messages,
    systemPrompt,
    serialized: systemPrompt,
    byteLength: bytes,
    estimatedTokens: Math.ceil(bytes / bytesPerToken),
    sections,
    cache: {
      enabled: cacheEnabled,
      prefixEndByte: cacheEnabled ? prefixEndByte : undefined,
      markers
    }
  };
}

export function assembleHarnessContext(
  context: HarnessContext,
  options: HarnessPromptAssemblerOptions = {}
): HarnessPromptAssembly {
  return assemble(context, options);
}

export function createHarnessContextAssembler(
  options: HarnessPromptAssemblerOptions = {}
): HarnessContextAssembler {
  return async (context) => assemble(context, options).messages;
}

export function isHarnessUnsupportedContextSourceError(
  value: unknown
): value is HarnessUnsupportedContextSourceError {
  return value instanceof HarnessUnsupportedContextSourceError;
}

export function isHarnessUnsupportedError(
  value: unknown
): value is HarnessUnsupportedError {
  return value instanceof HarnessUnsupportedError;
}
