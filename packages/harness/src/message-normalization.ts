import type {
  ProviderContent,
  ProviderContentPart,
  ProviderJsonValue,
  ProviderMessage,
  ProviderMetadata,
  ProviderResult,
  ProviderToolCall
} from "chat-provider-interface";
import { isProviderJsonValue } from "chat-provider-interface";

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
] as const;

function sha256Hex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLength = bytes.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const lower = words[index - 15] ?? 0;
      const upper = words[index - 2] ?? 0;
      const sigma0 = ((lower >>> 7) | (lower << 25)) ^ ((lower >>> 18) | (lower << 14)) ^ (lower >>> 3);
      const sigma1 = ((upper >>> 17) | (upper << 15)) ^ ((upper >>> 19) | (upper << 13)) ^ (upper >>> 10);
      words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
    }

    let a = hash[0]!;
    let b = hash[1]!;
    let c = hash[2]!;
    let d = hash[3]!;
    let e = hash[4]!;
    let f = hash[5]!;
    let g = hash[6]!;
    let h = hash[7]!;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + SHA256_K[index]! + words[index]!) >>> 0;
      const sum0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      [h, g, f, e, d, c, b, a] = [g, f, e, (d + temp1) >>> 0, c, b, a, (temp1 + temp2) >>> 0];
    }
    hash[0] = (hash[0]! + a) >>> 0;
    hash[1] = (hash[1]! + b) >>> 0;
    hash[2] = (hash[2]! + c) >>> 0;
    hash[3] = (hash[3]! + d) >>> 0;
    hash[4] = (hash[4]! + e) >>> 0;
    hash[5] = (hash[5]! + f) >>> 0;
    hash[6] = (hash[6]! + g) >>> 0;
    hash[7] = (hash[7]! + h) >>> 0;
  }
  return Array.from(hash, word => word.toString(16).padStart(8, "0")).join("");
}

type NormalizedCall = {
  readonly call: ProviderToolCall;
  readonly sourceId: string;
  readonly sourceIds: readonly string[];
};

type NormalizedMessage = {
  readonly message: ProviderMessage;
  readonly calls: readonly NormalizedCall[];
};

function sanitizeString(value: string): string {
  let result = "";
  let changed = false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        result += (value[index] ?? "") + (value[index + 1] ?? "");
        index += 1;
      } else {
        result += "\uFFFD";
        changed = true;
      }
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      result += "\uFFFD";
      changed = true;
    } else {
      result += value[index];
    }
  }
  return changed ? result : value;
}

function sanitizeJson(value: ProviderJsonValue): ProviderJsonValue {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map(item => sanitizeJson(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      sanitizeString(key),
      sanitizeJson(item)
    ]));
  }
  return value;
}

function isJsonObject(value: ProviderJsonValue): value is { readonly [key: string]: ProviderJsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deterministicCallId(name: string, argumentsValue: string, index: number): string {
  const seed = `${name}:${argumentsValue}:${index}`;
  const digest = sha256Hex(seed).slice(0, 12);
  return `call_${digest}`;
}

function effectiveCallId(value: Record<string, unknown>): string {
  const callId = typeof value.call_id === "string" ? value.call_id : "";
  const id = typeof value.id === "string" ? value.id : "";
  return (callId || id).trim();
}

function repairArgumentSubset(raw: string): string {
  const stripped = raw.trim();
  if (stripped.length === 0 || stripped === "None") return "{}";

  // Preserve valid arguments exactly. Besides avoiding needless cache churn,
  // this keeps normalization a no-op for healthy histories.
  try {
    JSON.parse(stripped);
    return raw;
  } catch {
    // Continue with the deliberately small repair subset below.
  }

  let fixed = "";
  let inString = false;
  let escaped = false;
  let changed = false;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === undefined) continue;
    if (inString) {
      if (escaped) {
        fixed += character;
        escaped = false;
      } else if (character === "\\") {
        fixed += character;
        escaped = true;
      } else if (character === '"') {
        fixed += character;
        inString = false;
      } else if (character.charCodeAt(0) < 0x20) {
        fixed += `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
        changed = true;
      } else {
        fixed += character;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      fixed += character;
      continue;
    }
    if (character === ",") {
      let next = index + 1;
      while (next < raw.length && /\s/.test(raw[next] ?? "")) next += 1;
      if (raw[next] === "}" || raw[next] === "]") {
        changed = true;
        continue;
      }
    }
    fixed += character;
  }

  if (!changed) return raw;
  try {
    JSON.parse(fixed);
    return fixed;
  } catch {
    // Truncation, Python literals other than None, and other syntax are not
    // safe to infer. Leave them invalid so execution fails closed.
    return raw;
  }
}

function normalizedCall(value: unknown, path: string, index: number): NormalizedCall {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be a tool call`);
  }
  const candidate = value as Record<string, unknown>;
  const name = typeof candidate.name === "string"
    ? candidate.name
    : typeof candidate.function === "object" && candidate.function !== null && !Array.isArray(candidate.function)
      ? (candidate.function as Record<string, unknown>).name
      : undefined;
  const rawArguments = typeof candidate.arguments === "string"
    ? candidate.arguments
    : typeof candidate.function === "object" && candidate.function !== null && !Array.isArray(candidate.function)
      ? (candidate.function as Record<string, unknown>).arguments
      : undefined;
  let argumentsValue: string | undefined;
  if (typeof rawArguments === "string") {
    argumentsValue = repairArgumentSubset(sanitizeString(rawArguments));
  } else if (isProviderJsonValue(rawArguments as ProviderJsonValue) && isJsonObject(rawArguments as ProviderJsonValue)) {
    argumentsValue = JSON.stringify(sanitizeJson(rawArguments as ProviderJsonValue));
  }
  if (typeof name !== "string" || name.length === 0 || argumentsValue === undefined) {
    throw new TypeError(`${path} is malformed`);
  }

  const explicitIds = [candidate.call_id, candidate.id]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map(value => sanitizeString(value.trim()));
  const sourceId = effectiveCallId(candidate)
    ? sanitizeString(effectiveCallId(candidate))
    : deterministicCallId(name, argumentsValue, index);
  return {
    sourceId,
    sourceIds: [...new Set([sourceId, ...explicitIds])],
    call: { id: sourceId, name: sanitizeString(name), arguments: argumentsValue }
  };
}

function sameCall(left: ProviderToolCall, right: ProviderToolCall): boolean {
  return left.id === right.id && left.name === right.name && left.arguments === right.arguments;
}

function normalizedContent(
  value: unknown,
  path: string,
  callIndex: { value: number }
): { readonly content: ProviderContent; readonly calls: readonly NormalizedCall[] } {
  if (typeof value === "string") return { content: sanitizeString(value), calls: [] };
  if (!Array.isArray(value)) throw new TypeError(`${path} must be a string or content parts`);

  const calls: NormalizedCall[] = [];
  const content = value.map((part: unknown, index): ProviderContentPart => {
    const partPath = `${path}[${index}]`;
    if (typeof part !== "object" || part === null || Array.isArray(part)) {
      throw new TypeError(`${partPath} is malformed`);
    }
    const candidate = part as Record<string, unknown>;
    if (candidate.type === "text" || candidate.type === "reasoning") {
      if (typeof candidate.text !== "string") throw new TypeError(`${partPath}.text must be a string`);
      return { type: candidate.type, text: sanitizeString(candidate.text) };
    }
    if (candidate.type === "tool-call") {
      const call = normalizedCall(candidate, partPath, callIndex.value++);
      calls.push(call);
      return { type: "tool-call", ...call.call };
    }
    if (candidate.type === "tool-result") {
      if (typeof candidate.toolCallId !== "string" || candidate.toolCallId.length === 0) {
        throw new TypeError(`${partPath}.toolCallId must be non-empty`);
      }
      if (candidate.isError !== undefined && typeof candidate.isError !== "boolean") {
        throw new TypeError(`${partPath}.isError must be a boolean`);
      }
      const nested = normalizedContent(candidate.content, `${partPath}.content`, callIndex);
      return {
        type: "tool-result",
        toolCallId: sanitizeString(candidate.toolCallId),
        content: nested.content,
        ...(candidate.isError === undefined ? {} : { isError: candidate.isError })
      };
    }
    throw new TypeError(`${partPath}.type is unsupported`);
  });
  return { content, calls };
}

function rewriteContent(
  content: ProviderContent,
  calls: readonly ProviderToolCall[],
  toolResultId?: string
): ProviderContent {
  if (typeof content === "string") return content;
  let callIndex = 0;
  return content.map(part => {
    if (part.type === "tool-call") {
      const replacement = calls[callIndex];
      callIndex += 1;
      return replacement === undefined ? part : { type: "tool-call", ...replacement };
    }
    if (part.type === "tool-result" && toolResultId !== undefined) {
      return { ...part, toolCallId: toolResultId, content: rewriteContent(part.content, calls, toolResultId) };
    }
    return part;
  });
}

function uniqueId(sourceId: string, used: Set<string>): string {
  const compositeSuffix = sourceId.includes("|") ? `|${sourceId.split("|", 2)[1] ?? ""}` : "";
  const base = sourceId.split("|", 1)[0] ?? sourceId;
  if (!used.has(base)) {
    used.add(base);
    return sourceId;
  }
  let suffix = 2;
  let candidateBase = `${base}_d${suffix}`;
  while (used.has(candidateBase)) {
    suffix += 1;
    candidateBase = `${base}_d${suffix}`;
  }
  used.add(candidateBase);
  return `${candidateBase}${compositeSuffix}`;
}

function normalizedMessage(value: unknown, index: number): NormalizedMessage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`History message[${index}] is malformed`);
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.role !== "system" && candidate.role !== "user" &&
      candidate.role !== "assistant" && candidate.role !== "tool") {
    throw new TypeError(`History message[${index}] has an invalid role`);
  }

  const callIndex = { value: 0 };
  const normalized = normalizedContent(candidate.content, `History message[${index}].content`, callIndex);
  const contentCalls = normalized.calls;
  const declaredCalls = candidate.toolCalls === undefined
    ? undefined
    : Array.isArray(candidate.toolCalls)
      ? candidate.toolCalls.map((call, callIndexValue) => normalizedCall(
        call,
        `History message[${index}].toolCalls[${callIndexValue}]`,
        callIndexValue
      ))
      : (() => { throw new TypeError(`History message[${index}].toolCalls must be an array`); })();

  if ((candidate.role !== "assistant" && declaredCalls !== undefined) ||
      (candidate.role !== "tool" && candidate.toolCallId !== undefined)) {
    throw new TypeError(`History message[${index}] has tool fields on a non-assistant/non-tool message`);
  }
  if (candidate.role === "tool" &&
      (typeof candidate.toolCallId !== "string" || candidate.toolCallId.length === 0)) {
    throw new TypeError(`History message[${index}] toolCallId must be non-empty`);
  }
  if (candidate.role === "tool" && Array.isArray(normalized.content)) {
    for (const part of normalized.content) {
      if (part.type === "tool-result" && part.toolCallId !== sanitizeString(candidate.toolCallId as string)) {
        throw new TypeError(`History message[${index}] tool-result does not match toolCallId`);
      }
    }
  }

  const calls = contentCalls.length === 0
    ? (declaredCalls ?? [])
    : declaredCalls === undefined
      ? contentCalls
      : declaredCalls.length === contentCalls.length && declaredCalls.every((call, callIndexValue) => {
        const contentCall = contentCalls[callIndexValue];
        return contentCall !== undefined && sameCall(call.call, contentCall.call);
      })
        ? declaredCalls
        : (() => { throw new TypeError(`History message[${index}] tool-call parts do not match toolCalls`); })();

  const persistedResult = candidate.toolResult;
  if (persistedResult !== undefined) {
    if (typeof persistedResult !== "object" || persistedResult === null || Array.isArray(persistedResult)) {
      throw new TypeError(`History message[${index}].toolResult is malformed`);
    }
    const result = persistedResult as Record<string, unknown>;
    if (typeof result.toolCallId !== "string" || result.toolCallId.length === 0 ||
        result.toolCallId !== candidate.toolCallId || typeof result.isError !== "boolean") {
      throw new TypeError(`History message[${index}].toolResult is inconsistent`);
    }
    normalizedContent(result.content, `History message[${index}].toolResult.content`, callIndex);
  }

  const metadata = candidate.metadata === undefined
    ? undefined
    : isProviderJsonValue(candidate.metadata)
      ? sanitizeJson(candidate.metadata) as ProviderMetadata
      : (() => { throw new TypeError(`History message[${index}].metadata is malformed`); })();
  const message: ProviderMessage = {
    role: candidate.role,
    content: normalized.content,
    ...(typeof candidate.reasoning === "string" ? { reasoning: sanitizeString(candidate.reasoning) } :
      candidate.reasoning === undefined ? {} : (() => { throw new TypeError(`History message[${index}].reasoning must be a string`); })()),
    ...(calls.length === 0 ? {} : { toolCalls: calls.map(call => call.call) }),
    ...(candidate.toolCallId === undefined ? {} : { toolCallId: sanitizeString(candidate.toolCallId as string) }),
    ...(candidate.name === undefined ? {} : typeof candidate.name === "string"
      ? { name: sanitizeString(candidate.name) }
      : (() => { throw new TypeError(`History message[${index}].name must be a string`); })()),
    ...(metadata === undefined ? {} : { metadata })
  };
  return { message, calls };
}

function applyUniqueIds(normalized: NormalizedMessage, used: Set<string>): NormalizedMessage {
  if (normalized.message.role !== "assistant" || normalized.calls.length === 0) return normalized;
  const calls = normalized.calls.map(entry => {
    const id = uniqueId(entry.sourceId, used);
    return { sourceId: entry.sourceId, sourceIds: entry.sourceIds, call: { ...entry.call, id } };
  });
  return {
    calls,
    message: {
      ...normalized.message,
      content: rewriteContent(normalized.message.content, calls.map(entry => entry.call)),
      toolCalls: calls.map(entry => entry.call)
    }
  };
}

function normalizeHarnessMessage(value: unknown, index: number): ProviderMessage {
  return applyUniqueIds(normalizedMessage(value, index), new Set()).message;
}

export function normalizeHarnessMessages(values: readonly ProviderMessage[]): readonly ProviderMessage[] {
  const normalized = values.map((value, index) => normalizedMessage(value, index));
  const used = new Set<string>();
  const messages = normalized.map(message => applyUniqueIds(message, used));
  const result: ProviderMessage[] = [];
  let pending: Array<{ readonly sourceIds: readonly string[]; readonly call: ProviderToolCall }> | undefined;

  for (const [index, entry] of messages.entries()) {
    let message = entry.message;
    if (message.role === "tool") {
      if (pending === undefined) throw new TypeError(`History message[${index}] has an orphan tool result`);
      const toolCallId = message.toolCallId ?? "";
      const pendingIndex = pending.findIndex(candidate =>
        candidate.sourceIds.includes(toolCallId) || candidate.call.id === toolCallId
      );
      if (pendingIndex < 0) throw new TypeError(`History message[${index}] does not match a pending tool call`);
      const matched = pending[pendingIndex];
      if (matched === undefined) throw new TypeError(`History message[${index}] does not match a pending tool call`);
      pending = pending.filter((_, candidateIndex) => candidateIndex !== pendingIndex);
      message = {
        ...message,
        toolCallId: matched.call.id,
        content: rewriteContent(message.content, [], matched.call.id)
      };
      result.push(message);
      if (pending.length === 0) pending = undefined;
      continue;
    }

    if (pending !== undefined) throw new TypeError(`History message[${index}] breaks tool result adjacency`);
    if (message.role === "assistant" && entry.calls.length > 0) {
      pending = entry.calls.map(call => ({ sourceIds: call.sourceIds, call: call.call }));
    }
    result.push(message);
  }
  if (pending !== undefined) throw new TypeError("History ends with unresolved tool calls");
  return result;
}

export function normalizeProviderResult(
  result: ProviderResult,
  index: number,
  existingCallIds: ReadonlySet<string> = new Set()
): ProviderResult {
  const normalized = normalizedMessage(result.message, index);
  const message = applyUniqueIds(normalized, new Set(existingCallIds)).message;
  if (message.role !== "assistant") throw new TypeError("Provider result message must have assistant role");
  return { ...result, message };
}

export function closeInterruptedToolSequence(
  messages: readonly ProviderMessage[],
  finalResponse?: unknown
): readonly ProviderMessage[] {
  if (messages.length === 0 || messages[messages.length - 1]?.role !== "tool") return messages;
  const text = typeof finalResponse === "string" ? finalResponse.trim() : "";
  return [...messages, { role: "assistant", content: text || "Operation interrupted." }];
}
