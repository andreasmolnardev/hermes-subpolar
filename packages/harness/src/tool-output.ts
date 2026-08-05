import type { ProviderContent, ProviderContentPart } from "chat-provider-interface";

export const DEFAULT_TOOL_PREVIEW_BYTES = 1_500;

export type ToolOutputResult = {
  readonly content: ProviderContent;
  readonly isError?: boolean;
  readonly truncated?: boolean;
};

export type Utf8Truncation = {
  readonly value: string;
  readonly truncated: boolean;
};

const encoder = new TextEncoder();

export function utf8Bytes(value: string): number {
  return encoder.encode(value).byteLength;
}

function byteLimit(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Truncate only at Unicode code-point boundaries and never split UTF-8. */
export function truncateUtf8(value: string, maxBytes: number): Utf8Truncation {
  const limit = byteLimit(maxBytes);
  if (utf8Bytes(value) <= limit) return { value, truncated: false };

  let result = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = utf8Bytes(character);
    if (bytes + characterBytes > limit) break;
    result += character;
    bytes += characterBytes;
  }
  return { value: result, truncated: true };
}

function takeTailUtf8(value: string, maxBytes: number): string {
  const limit = byteLimit(maxBytes);
  let start = value.length;
  let bytes = 0;
  for (const character of [...value].reverse()) {
    const characterBytes = utf8Bytes(character);
    if (bytes + characterBytes > limit) break;
    start -= character.length;
    bytes += characterBytes;
  }
  return value.slice(start);
}

/**
 * Keep terminal-style head and tail output. The notice is bounded as part of
 * the result so this helper is safe to use with a byte budget too.
 */
export function truncateTerminalOutput(value: string, maxBytes: number): Utf8Truncation {
  const limit = byteLimit(maxBytes);
  if (utf8Bytes(value) <= limit) return { value, truncated: false };

  const notice = `\n\n... [OUTPUT TRUNCATED - ${Math.max(0, value.length - limit)} chars omitted out of ${value.length} total] ...\n\n`;
  const noticeBytes = utf8Bytes(notice);
  if (noticeBytes >= limit) {
    const headBytes = Math.floor(limit * 0.4);
    return {
      value: `${truncateUtf8(value, headBytes).value}${takeTailUtf8(value, limit - headBytes)}`,
      truncated: true
    };
  }

  const remaining = limit - noticeBytes;
  const headBytes = Math.floor(remaining * 0.4);
  const tailBytes = remaining - headBytes;
  return {
    value: `${truncateUtf8(value, headBytes).value}${notice}${takeTailUtf8(value, tailBytes)}`,
    truncated: true
  };
}

/** Port of tool_result_storage.generate_preview with a UTF-8 byte limit. */
export function generatePreview(value: string, maxBytes: number = DEFAULT_TOOL_PREVIEW_BYTES): Utf8Truncation {
  const bounded = truncateUtf8(value, maxBytes);
  if (!bounded.truncated) return bounded;

  const lastNewline = bounded.value.lastIndexOf("\n");
  if (lastNewline >= 0 && utf8Bytes(bounded.value.slice(0, lastNewline + 1)) > byteLimit(maxBytes) / 2) {
    return { value: bounded.value.slice(0, lastNewline + 1), truncated: true };
  }
  return bounded;
}

export function isProviderContent(value: unknown): value is ProviderContent {
  if (typeof value === "string") return true;
  if (!Array.isArray(value)) return false;
  return value.every((part: unknown) => {
    if (typeof part !== "object" || part === null || Array.isArray(part)) return false;
    const candidate = part as Record<string, unknown>;
    if (candidate.type === "text" || candidate.type === "reasoning") {
      return typeof candidate.text === "string";
    }
    if (candidate.type === "tool-call") {
      return typeof candidate.id === "string" && typeof candidate.name === "string" &&
        typeof candidate.arguments === "string";
    }
    if (candidate.type === "image" || candidate.type === "audio" || candidate.type === "file") {
      return typeof candidate.url === "string" && candidate.url.length > 0;
    }
    if (candidate.type === "image_url") {
      return typeof candidate.imageUrl === "string" ||
        (typeof candidate.imageUrl === "object" && candidate.imageUrl !== null &&
          typeof (candidate.imageUrl as Record<string, unknown>).url === "string");
    }
    if (candidate.type === "tool-result") {
      return typeof candidate.toolCallId === "string" &&
        isProviderContent(candidate.content) &&
        (candidate.isError === undefined || typeof candidate.isError === "boolean");
    }
    return false;
  });
}

export function contentText(content: ProviderContent): string {
  if (typeof content === "string") return content;
  return content.map((part: ProviderContentPart) => {
    if (part.type === "text" || part.type === "reasoning") return part.text;
    if (part.type === "tool-call") return `${part.name}(${part.arguments})`;
    if (part.type === "tool-result") return contentText(part.content);
    return "";
  }).join("");
}

function contentBytes(content: ProviderContent): number {
  if (typeof content === "string") return utf8Bytes(content);
  const serialized = JSON.stringify(content);
  return serialized === undefined ? utf8Bytes(contentText(content)) : utf8Bytes(serialized);
}

function resultWithContent(
  result: ToolOutputResult,
  content: ProviderContent,
  truncated = result.truncated === true
): ToolOutputResult {
  return {
    content,
    ...(result.isError === undefined ? {} : { isError: result.isError }),
    ...(result.truncated === undefined && !truncated
      ? {}
      : { truncated: truncated || result.truncated === true })
  };
}

/** Validate and bound one tool result without persistence side effects. */
export function boundToolResult(
  value: unknown,
  maxBytes: number,
  previewBytes: number = DEFAULT_TOOL_PREVIEW_BYTES
): ToolOutputResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Tool returned an invalid result");
  }
  const candidate = value as {
    readonly content?: unknown;
    readonly isError?: unknown;
    readonly truncated?: unknown;
  };
  if (!isProviderContent(candidate.content) ||
      (candidate.isError !== undefined && typeof candidate.isError !== "boolean") ||
      (candidate.truncated !== undefined && typeof candidate.truncated !== "boolean")) {
    throw new TypeError("Tool returned an invalid result");
  }

  const result: ToolOutputResult = {
    content: candidate.content,
    ...(candidate.isError === undefined ? {} : { isError: candidate.isError }),
    ...(candidate.truncated === undefined ? {} : { truncated: candidate.truncated })
  };
  if (typeof result.content === "string") {
    const bounded = generatePreview(result.content, maxBytes);
    return resultWithContent(result, bounded.value, bounded.truncated);
  }

  if (contentBytes(result.content) <= byteLimit(maxBytes)) return result;
  return resultWithContent(result, generatePreview(contentText(result.content), previewBytes).value, true);
}

function replaceForBudget(result: ToolOutputResult, maxBytes: number): ToolOutputResult {
  if (typeof result.content === "string") {
    const bounded = generatePreview(result.content, maxBytes);
    return resultWithContent(result, bounded.value, bounded.truncated);
  }
  return resultWithContent(result, generatePreview(contentText(result.content), maxBytes).value, true);
}

/**
 * Enforce a turn-wide budget by selecting the largest results first. Ties are
 * resolved by input order, while the returned results always retain that order.
 */
export function enforceToolTurnBudget(
  results: readonly ToolOutputResult[],
  maxBytes: number
): readonly ToolOutputResult[] {
  const budget = byteLimit(maxBytes);
  let total = results.reduce((sum, result) => sum + contentBytes(result.content), 0);
  if (total <= budget) return results;

  const candidates = results
    .map((result, index) => ({ index, size: contentBytes(result.content) }))
    .sort((left, right) => right.size - left.size || left.index - right.index);
  const bounded = [...results];

  for (const candidate of candidates) {
    if (total <= budget) break;
    const current = bounded[candidate.index];
    if (current === undefined) continue;
    const currentSize = contentBytes(current.content);
    const target = Math.max(0, currentSize - (total - budget));
    const replacement = replaceForBudget(current, target);
    bounded[candidate.index] = replacement;
    total = bounded.reduce((sum, result) => sum + contentBytes(result.content), 0);
  }
  return bounded;
}
