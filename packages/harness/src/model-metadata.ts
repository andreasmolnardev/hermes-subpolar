/**
 * Deterministic, provider-independent model metadata helpers.
 *
 * This is deliberately an approximation, not a tokenizer. `rough-v1` is part
 * of the API so persisted or compared estimates cannot be mistaken for exact
 * provider usage. Unknown shapes return an explicit Python fallback signal.
 */

export const HARNESS_TOKEN_APPROXIMATION_VERSION = "rough-v1" as const;
export const HARNESS_PROVIDER_ERROR_PARSER_VERSION = "provider-error-v1" as const;
export const HARNESS_IMAGE_TOKEN_COST = 1_500;

export type HarnessTokenEstimate =
  | {
    readonly supported: true;
    readonly tokens: number;
    readonly approximationVersion: typeof HARNESS_TOKEN_APPROXIMATION_VERSION;
  }
  | {
    readonly supported: false;
    readonly approximationVersion: typeof HARNESS_TOKEN_APPROXIMATION_VERSION;
    readonly reason: "unsupported-content" | "unsupported-media" | "invalid-input";
    readonly fallback: "python";
  };

export type HarnessParsedTokenValue =
  | {
    readonly supported: true;
    readonly value: number;
    readonly parserVersion: typeof HARNESS_PROVIDER_ERROR_PARSER_VERSION;
  }
  | {
    readonly supported: false;
    readonly parserVersion: typeof HARNESS_PROVIDER_ERROR_PARSER_VERSION;
    readonly reason: "unreported-limit" | "unreported-output-cap";
    readonly fallback: "python";
  };

type UnsupportedTokenReason = "unsupported-content" | "unsupported-media" | "invalid-input";
type UnreportedReason = "unreported-limit" | "unreported-output-cap";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as RecordValue
    : undefined;
}

function unsupported(reason: UnsupportedTokenReason): HarnessTokenEstimate {
  return {
    supported: false,
    approximationVersion: HARNESS_TOKEN_APPROXIMATION_VERSION,
    reason,
    fallback: "python"
  };
}

function supported(tokens: number): HarnessTokenEstimate {
  return {
    supported: true,
    tokens,
    approximationVersion: HARNESS_TOKEN_APPROXIMATION_VERSION
  };
}

export function isSupportedTokenEstimate(
  value: HarnessTokenEstimate
): value is Extract<HarnessTokenEstimate, { readonly supported: true }> {
  return value.supported;
}

function denseCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xffef);
}

function roughTextTokenCount(text: string): number {
  if (text.length === 0) return 0;
  let dense = 0;
  let characters = 0;
  for (const character of text) {
    characters += 1;
    if (denseCharacter(character)) dense += 1;
  }
  return dense + Math.ceil((characters - dense) / 4);
}

/** Estimate text using the stable rough-v1 four-character/CJK rule. */
export function estimateTokensRough(text: unknown): HarnessTokenEstimate {
  return typeof text === "string"
    ? supported(roughTextTokenCount(text))
    : unsupported("invalid-input");
}

function isJsonValue(value: unknown, active = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (active.has(value)) return false;
  active.add(value);
  const valid = Array.isArray(value)
    ? value.every(item => isJsonValue(item, active))
    : Object.entries(value).every(([key, item]) => typeof key === "string" && isJsonValue(item, active));
  active.delete(value);
  return valid;
}

function jsonLength(value: unknown): number | undefined {
  if (!isJsonValue(value)) return undefined;
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? undefined : serialized.length;
  } catch {
    return undefined;
  }
}

function imagePart(value: RecordValue): boolean {
  return value.type === "image" || value.type === "image_url" || value.type === "input_image";
}

function imageCount(value: unknown): number | undefined {
  if (!Array.isArray(value)) return 0;
  let count = 0;
  for (const part of value) {
    const candidate = record(part);
    if (candidate === undefined || typeof candidate.type !== "string") return undefined;
    if (imagePart(candidate)) count += 1;
    if (candidate.type === "tool-result") {
      const nested = imageCount(candidate.content);
      if (nested === undefined) return undefined;
      count += nested;
    }
  }
  return count;
}

function contentImageCount(value: unknown): number | undefined {
  if (Array.isArray(value)) return imageCount(value);
  const candidate = record(value);
  return candidate?._multimodal === true ? imageCount(candidate.content) : 0;
}

function shadowPart(value: unknown): RecordValue | undefined {
  const candidate = record(value);
  if (candidate === undefined || typeof candidate.type !== "string") return undefined;
  if (candidate.type === "text" || candidate.type === "reasoning") {
    return typeof candidate.text === "string" ? { ...candidate } : undefined;
  }
  if (candidate.type === "image" || candidate.type === "input_image") {
    return { type: candidate.type, image: "[stripped]" };
  }
  if (candidate.type === "image_url") {
    return { type: candidate.type, image: "[stripped]" };
  }
  if (candidate.type === "tool-call") {
    return typeof candidate.id === "string" && typeof candidate.name === "string" &&
      typeof candidate.arguments === "string" ? { ...candidate } : undefined;
  }
  if (candidate.type === "tool-result") {
    if (typeof candidate.toolCallId !== "string") return undefined;
    const content = shadowContent(candidate.content);
    return content === undefined ? undefined : { ...candidate, content };
  }
  // Audio and arbitrary file payloads have provider-specific token rules.
  return undefined;
}

function shadowContent(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts = value.map(shadowPart);
    return parts.every((part): part is RecordValue => part !== undefined) ? parts : undefined;
  }
  const candidate = record(value);
  if (candidate?._multimodal === true && typeof candidate.text_summary === "string") {
    return candidate.text_summary;
  }
  return undefined;
}

function wireMessageShadow(value: unknown): { readonly shadow: RecordValue; readonly images: number } | undefined {
  const message = record(value);
  if (message === undefined) return undefined;

  const sidecar = message.api_content;
  const sidecarWins = typeof sidecar === "string" && sidecar.length > 0 &&
    (message.role === "user" || message.role === "assistant");
  const shadow: RecordValue = {};
  let images = 0;

  for (const [key, item] of Object.entries(message)) {
    if (key === "_anthropic_content_blocks" || key === "reasoning_details") continue;
    if (key === "api_content") {
      if (sidecarWins) shadow.content = sidecar;
      continue;
    }
    if (key === "content") {
      const effective = sidecarWins ? sidecar : item;
      const nestedImages = contentImageCount(effective);
      if (nestedImages === undefined) return undefined;
      images += nestedImages;
      const cleaned = shadowContent(effective);
      if (typeof effective === "string") shadow.content = effective;
      else if (effective === null) shadow.content = null;
      else if (cleaned !== undefined) shadow.content = cleaned;
      else return undefined;
      continue;
    }
    if (item !== undefined) shadow[key] = item;
  }

  const stashed = message._anthropic_content_blocks;
  if (Array.isArray(stashed)) {
    const stashedImages = stashed.filter(item => imagePart(record(item) ?? {})).length;
    if (stashed.some(item => record(item) === undefined)) return undefined;
    images += stashedImages;
  }
  return isJsonValue(shadow) ? { shadow, images } : undefined;
}

export function estimateContentPartTokensRough(part: unknown): HarnessTokenEstimate {
  const shadow = shadowPart(part);
  if (shadow === undefined) {
    const candidate = record(part);
    return candidate?.type === "audio" || candidate?.type === "file"
      ? unsupported("unsupported-media")
      : unsupported("unsupported-content");
  }
  const nestedImages = imagePart(shadow)
    ? 1
    : shadow.type === "tool-result" ? contentImageCount(shadow.content) : 0;
  if (nestedImages === undefined) return unsupported("unsupported-content");
  const length = jsonLength(shadow);
  return length === undefined
    ? unsupported("unsupported-content")
    : supported(roughTextTokenCount(JSON.stringify(shadow)) + nestedImages * HARNESS_IMAGE_TOKEN_COST);
}

export function estimateMessageTokensRough(message: unknown): HarnessTokenEstimate {
  const wire = wireMessageShadow(message);
  if (wire === undefined) {
    const content = record(message)?.content;
    const media = Array.isArray(content) && content.some(part => {
      const type = record(part)?.type;
      return type === "audio" || type === "file";
    });
    return unsupported(media ? "unsupported-media" : "unsupported-content");
  }
  const length = jsonLength(wire.shadow);
  return length === undefined
    ? unsupported("unsupported-content")
    : supported(roughTextTokenCount(JSON.stringify(wire.shadow)) + wire.images * HARNESS_IMAGE_TOKEN_COST);
}

export function estimateMessagesTokensRough(messages: readonly unknown[]): HarnessTokenEstimate {
  if (!Array.isArray(messages)) return unsupported("invalid-input");
  let total = 0;
  for (const message of messages) {
    const estimate = estimateMessageTokensRough(message);
    if (!estimate.supported) return estimate;
    total += estimate.tokens;
  }
  return supported(total);
}

function toolFields(tool: unknown): { readonly name: string; readonly description: string; readonly parameters: unknown } | undefined {
  const candidate = record(tool);
  if (candidate === undefined) return undefined;
  const functionValue = record(candidate.function);
  const source = functionValue ?? candidate;
  const name = source.name === undefined ? "" : source.name;
  const description = source.description === undefined ? "" : source.description;
  const parameters = source.parameters === undefined ? {} : source.parameters;
  return typeof name === "string" && typeof description === "string" && isJsonValue(parameters)
    ? { name, description, parameters }
    : undefined;
}

export function estimateToolsTokensRough(tools: readonly unknown[]): HarnessTokenEstimate {
  if (!Array.isArray(tools)) return unsupported("invalid-input");
  let totalCharacters = 0;
  for (const tool of tools) {
    const fields = toolFields(tool);
    if (fields === undefined) return unsupported("unsupported-content");
    const parametersLength = jsonLength(fields.parameters);
    if (parametersLength === undefined) return unsupported("unsupported-content");
    totalCharacters += fields.name.length + fields.description.length + parametersLength;
  }
  return supported(Math.ceil(totalCharacters / 4));
}

export type HarnessRequestTokenEstimateOptions = {
  readonly systemPrompt?: string;
  readonly tools?: readonly unknown[];
};

export function estimateRequestTokensRough(
  messages: readonly unknown[],
  options: HarnessRequestTokenEstimateOptions = {}
): HarnessTokenEstimate {
  let total = 0;
  if (options.systemPrompt !== undefined) {
    const system = estimateTokensRough(options.systemPrompt);
    if (!system.supported) return system;
    total += system.tokens;
  }
  const messageEstimate = estimateMessagesTokensRough(messages);
  if (!messageEstimate.supported) return messageEstimate;
  total += messageEstimate.tokens;
  if (options.tools !== undefined) {
    const toolEstimate = estimateToolsTokensRough(options.tools);
    if (!toolEstimate.supported) return toolEstimate;
    total += toolEstimate.tokens;
  }
  return supported(total);
}

function parsed(value: number): HarnessParsedTokenValue {
  return { supported: true, value, parserVersion: HARNESS_PROVIDER_ERROR_PARSER_VERSION };
}

function unreported(reason: UnreportedReason): HarnessParsedTokenValue {
  return {
    supported: false,
    parserVersion: HARNESS_PROVIDER_ERROR_PARSER_VERSION,
    reason,
    fallback: "python"
  };
}

function integer(value: string): number | undefined {
  const parsedValue = Number(value);
  return Number.isSafeInteger(parsedValue) ? parsedValue : undefined;
}

/** Parse only an explicit, plausible context limit; never select a probe tier. */
export function parseContextLimitFromError(errorMessage: string): number | undefined {
  if (typeof errorMessage !== "string") return undefined;
  const text = errorMessage.toLowerCase();
  const patterns = [
    /max_model_len\s*(?:is\s*)?[:=(]?\s*(\d{4,})/,
    /maximum model length\s*(?:is\s*)?[:=(]?\s*(\d{4,})/,
    /context[_ ]*length[_ ]*exceeded\s*[:=]\s*(\d{4,})/,
    /(?:max(?:imum)?|limit)\s*(?:context\s*)?(?:length|size|window)?\s*(?:is|of|:)?\s*(\d{4,})/,
    /context[_ ]*(?:length|size|window)\s*(?:is|of|:)?\s*(\d{4,})/,
    /(\d{4,})\s*(?:token)?\s*(?:context|limit)/,
    />\s*(\d{4,})\s*(?:max|limit|token)/,
    /(\d{4,})\s*max(?:imum)?\b/
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.[1] === undefined ? undefined : integer(match[1]);
    if (value !== undefined && value >= 1_024 && value <= 10_000_000) return value;
  }
  return undefined;
}

export function parseContextLimitFromErrorResult(errorMessage: string): HarnessParsedTokenValue {
  const value = parseContextLimitFromError(errorMessage);
  return value === undefined ? unreported("unreported-limit") : parsed(value);
}

export function getContextLengthFromProviderError(
  errorMessage: string,
  currentContextLength: number
): number | undefined {
  const parsedLimit = parseContextLimitFromError(errorMessage);
  return parsedLimit !== undefined && parsedLimit < currentContextLength ? parsedLimit : undefined;
}

/** Parse an output cap only when the error unambiguously describes one. */
export function parseAvailableOutputTokensFromError(errorMessage: string): number | undefined {
  if (typeof errorMessage !== "string") return undefined;
  const text = errorMessage.toLowerCase();
  const outputCap = (
    (text.includes("max_tokens") && (text.includes("available_tokens") || text.includes("available tokens"))) ||
    (text.includes("in the output") && text.includes("maximum context length")) ||
    (text.includes("maximum context length") && text.includes("requested") && text.includes("output tokens")) ||
    text.includes("range of max_tokens should be")
  );
  if (!outputCap) return undefined;

  const range = /range of max_tokens should be\s*\[\s*\d+\s*,\s*(\d+)\s*\]/.exec(text);
  const rangeValue = range?.[1] === undefined ? undefined : integer(range[1]);
  if (rangeValue !== undefined && rangeValue >= 1) return rangeValue;

  for (const pattern of [/available_tokens[:\s]+(\d+)/, /available\s+tokens[:\s]+(\d+)/, /=\s*(\d+)\s*$/]) {
    const match = pattern.exec(text);
    const value = match?.[1] === undefined ? undefined : integer(match[1]);
    if (value !== undefined && value >= 1) return value;
  }

  const context = /maximum context length is (\d+)/.exec(text);
  const parts = /\((\d+)\s+of text input,\s*(\d+)\s+of tool input,\s*(\d+)\s+in the output\)/.exec(text);
  if (context?.[1] !== undefined && parts?.[1] !== undefined && parts[2] !== undefined) {
    const contextValue = integer(context[1]);
    const textInput = integer(parts[1]);
    const toolInput = integer(parts[2]);
    if (contextValue !== undefined && textInput !== undefined && toolInput !== undefined) {
      const available = contextValue - textInput - toolInput;
      if (available >= 1) return available;
    }
  }

  const contextTokens = /maximum context length is (\d+)\s*token/.exec(text);
  const characters = /prompt contains (\d+)\s*character/.exec(text);
  if (contextTokens?.[1] !== undefined && characters?.[1] !== undefined) {
    const contextValue = integer(contextTokens[1]);
    const characterCount = integer(characters[1]);
    if (contextValue !== undefined && characterCount !== undefined) {
      const available = contextValue - Math.ceil(characterCount / 3);
      if (available >= 1) return available;
    }
  }

  const inputTokens = /prompt contains (?:at least )?(\d+)\s*input tokens/.exec(text);
  if (contextTokens?.[1] !== undefined && inputTokens?.[1] !== undefined) {
    const contextValue = integer(contextTokens[1]);
    const inputValue = integer(inputTokens[1]);
    if (contextValue !== undefined && inputValue !== undefined && contextValue - inputValue >= 1) {
      return contextValue - inputValue;
    }
  }
  return undefined;
}

export function parseAvailableOutputTokensFromErrorResult(errorMessage: string): HarnessParsedTokenValue {
  const value = parseAvailableOutputTokensFromError(errorMessage);
  return value === undefined ? unreported("unreported-output-cap") : parsed(value);
}

export function isOutputCapError(errorMessage: string): boolean {
  if (typeof errorMessage !== "string") return false;
  const text = errorMessage.toLowerCase();
  const mentionsOutputParameter = text.includes("max_tokens") ||
    text.includes("max_output_tokens") || text.includes("max_completion_tokens");
  if (!mentionsOutputParameter) return false;
  const outputSignal = text.includes("range of max_tokens should be") ||
    text.includes("available_tokens") || text.includes("available tokens") ||
    (text.includes("in the output") && text.includes("maximum context length")) ||
    (text.includes("requested") && text.includes("output tokens")) ||
    text.includes("should be") || text.includes("less than or equal") || text.includes("must be");
  if (!outputSignal) return false;
  const inputOverflow = text.includes("prompt is too long") || text.includes("prompt too long") ||
    text.includes("input is too long") || text.includes("input token") || text.includes("prompt length") ||
    text.includes("prompt contains") || text.includes("reduce the length");
  return !inputOverflow;
}
