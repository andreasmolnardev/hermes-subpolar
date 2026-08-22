export type SpeechToTextInput = {
  readonly audio: Uint8Array;
  readonly mimeType: string;
  readonly model: string;
  readonly language?: string;
  readonly signal?: AbortSignal;
};

export type SpeechToTextProvider = {
  readonly transcribe: (input: SpeechToTextInput) => Promise<string>;
};

export type TextToSpeechInput = {
  readonly text: string;
  readonly model: string;
  readonly voice: string;
  readonly speed?: number;
  readonly signal?: AbortSignal;
};

export type TextToSpeechResult = {
  readonly audio: Uint8Array;
  readonly mimeType: string;
};

export type TextToSpeechProvider = {
  readonly synthesize: (input: TextToSpeechInput) => Promise<TextToSpeechResult>;
};

export type HttpVoiceProviderConfig = {
  readonly endpoint: string;
  readonly apiKey?: string;
};

export class VoiceProviderError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "VoiceProviderError";
    this.status = status;
  }
}

function authorization(apiKey: string | undefined): Record<string, string> {
  return apiKey === undefined || apiKey.trim() === "" ? {} : { Authorization: `Bearer ${apiKey}` };
}

function blobPart(audio: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(audio.byteLength);
  new Uint8Array(copy).set(audio);
  return copy;
}

async function providerFailure(response: Response): Promise<never> {
  let detail = response.statusText || "Voice provider request failed";
  try {
    const payload: unknown = await response.json();
    if (typeof payload === "object" && payload !== null) {
      const record = payload as Record<string, unknown>;
      const error = record.error;
      detail = typeof error === "string" ? error : typeof record.message === "string" ? record.message : detail;
    }
  } catch {
    // Keep the status text when a provider returns a non-JSON error body.
  }
  throw new VoiceProviderError(detail, response.status);
}

export function createHttpSpeechToTextProvider(config: HttpVoiceProviderConfig): SpeechToTextProvider {
  return {
    async transcribe(input) {
      const form = new FormData();
      form.append("file", new Blob([blobPart(input.audio)], { type: input.mimeType }), "recording");
      form.append("model", input.model);
      if (input.language !== undefined && input.language !== "auto" && input.language !== "") form.append("language", input.language);
      const request: RequestInit = {
        method: "POST",
        headers: authorization(config.apiKey),
        body: form,
      };
      if (input.signal !== undefined) request.signal = input.signal;
      const response = await fetch(config.endpoint, request);
      if (!response.ok) await providerFailure(response);
      const payload: unknown = await response.json();
      if (typeof payload !== "object" || payload === null || typeof (payload as Record<string, unknown>).text !== "string") {
        throw new VoiceProviderError("Voice provider returned no transcription");
      }
      return ((payload as Record<string, unknown>).text as string).trim();
    },
  };
}

export function createHttpTextToSpeechProvider(config: HttpVoiceProviderConfig): TextToSpeechProvider {
  return {
    async synthesize(input) {
      const request: RequestInit = {
        method: "POST",
        headers: { ...authorization(config.apiKey), "content-type": "application/json" },
        body: JSON.stringify({ model: input.model, input: input.text, voice: input.voice, ...(input.speed === undefined ? {} : { speed: input.speed }) }),
      };
      if (input.signal !== undefined) request.signal = input.signal;
      const response = await fetch(config.endpoint, request);
      if (!response.ok) await providerFailure(response);
      return {
        audio: new Uint8Array(await response.arrayBuffer()),
        mimeType: response.headers.get("content-type")?.split(";", 1)[0] ?? "audio/mpeg",
      };
    },
  };
}
