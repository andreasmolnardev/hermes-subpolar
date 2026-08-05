export type GatewayTurnLeaseErrorCode = "wait_timeout" | "cancelled";

export type GatewayTurnLeaseDiagnostics = {
  readonly sessionId: string;
  readonly waitTimeoutMs: number;
  readonly waitedMs: number;
  readonly queueDepth: number;
  readonly generation?: number;
};

export class GatewayTurnLeaseError extends Error {
  readonly code: GatewayTurnLeaseErrorCode;
  readonly diagnostics: GatewayTurnLeaseDiagnostics;

  constructor(code: GatewayTurnLeaseErrorCode, diagnostics: GatewayTurnLeaseDiagnostics) {
    super(`Gateway turn lease ${code} for session ${diagnostics.sessionId}`);
    this.name = "GatewayTurnLeaseError";
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export type GatewayTurnLease = {
  readonly sessionId: string;
  readonly generation: number;
  release(): boolean;
};

export type GatewayTurnLeaseAcquireOptions = {
  readonly waitTimeoutMs?: number;
  readonly signal?: AbortSignal;
};

export type GatewayTurnLeaseManagerOptions = {
  readonly defaultWaitTimeoutMs?: number;
  readonly now?: () => number;
};

export type GatewayTurnLeaseState = {
  readonly sessionId: string;
  readonly held: boolean;
  readonly generation?: number;
  readonly queueDepth: number;
};

type Waiter = {
  readonly resolve: (lease: GatewayTurnLease) => void;
  readonly reject: (error: GatewayTurnLeaseError) => void;
  readonly startedAt: number;
  readonly waitTimeoutMs: number;
  readonly signal?: AbortSignal;
  timer?: ReturnType<typeof setTimeout>;
  onAbort?: () => void;
  settled: boolean;
};

type SessionState = {
  generation: number;
  holder: number | undefined;
  readonly waiters: Waiter[];
};

function validateWaitTimeout(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a finite non-negative number`);
}

export class GatewayTurnLeaseManager {
  private readonly sessions = new Map<string, SessionState>();
  private readonly defaultWaitTimeoutMs: number;
  private readonly now: () => number;

  constructor(options: GatewayTurnLeaseManagerOptions = {}) {
    this.defaultWaitTimeoutMs = options.defaultWaitTimeoutMs ?? 30_000;
    validateWaitTimeout(this.defaultWaitTimeoutMs, "Gateway turn lease default wait timeout");
    this.now = options.now ?? (() => Date.now());
  }

  async acquire(sessionId: string, options: GatewayTurnLeaseAcquireOptions = {}): Promise<GatewayTurnLease> {
    if (sessionId.length === 0) throw new TypeError("Gateway turn lease session id must be non-empty");
    const waitTimeoutMs = options.waitTimeoutMs ?? this.defaultWaitTimeoutMs;
    validateWaitTimeout(waitTimeoutMs, "Gateway turn lease wait timeout");
    const state = this.sessions.get(sessionId) ?? { generation: 0, holder: undefined, waiters: [] };
    this.sessions.set(sessionId, state);
    if (options.signal?.aborted === true) {
      this.removeIdleState(sessionId, state);
      throw this.error("cancelled", sessionId, waitTimeoutMs, 0, state);
    }
    if (state.holder === undefined && state.waiters.length === 0) {
      return this.grant(sessionId, state);
    }

    return new Promise<GatewayTurnLease>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        startedAt: this.now(),
        waitTimeoutMs,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        settled: false
      };
      state.waiters.push(waiter);
      const remove = (code: GatewayTurnLeaseErrorCode) => {
        if (waiter.settled) return;
        waiter.settled = true;
        const failure = this.error(code, sessionId, waitTimeoutMs, this.now() - waiter.startedAt, state);
        const index = state.waiters.indexOf(waiter);
        if (index >= 0) state.waiters.splice(index, 1);
        if (waiter.timer !== undefined) clearTimeout(waiter.timer);
        if (waiter.onAbort !== undefined) options.signal?.removeEventListener("abort", waiter.onAbort);
        waiter.reject(failure);
        this.removeIdleState(sessionId, state);
      };
      waiter.onAbort = () => remove("cancelled");
      options.signal?.addEventListener("abort", waiter.onAbort, { once: true });
      waiter.timer = setTimeout(() => remove("wait_timeout"), waitTimeoutMs);
    });
  }

  getDiagnostics(sessionId: string): GatewayTurnLeaseState {
    const state = this.sessions.get(sessionId);
    return {
      sessionId,
      held: state?.holder !== undefined,
      ...(state?.holder === undefined ? {} : { generation: state.holder }),
      queueDepth: state?.waiters.length ?? 0
    };
  }

  private grant(sessionId: string, state: SessionState): GatewayTurnLease {
    const generation = ++state.generation;
    state.holder = generation;
    let released = false;
    return {
      sessionId,
      generation,
      release: () => {
        if (released) return false;
        released = true;
        return this.release(sessionId, generation);
      }
    };
  }

  release(sessionId: string, generation: number): boolean {
    const state = this.sessions.get(sessionId);
    if (state === undefined) return false;
    if (this.sessions.get(sessionId) !== state || state.holder !== generation) return false;
    state.holder = undefined;
    this.grantNext(sessionId, state);
    this.removeIdleState(sessionId, state);
    return true;
  }

  private grantNext(sessionId: string, state: SessionState): void {
    while (state.waiters.length > 0) {
      const waiter = state.waiters.shift()!;
      if (waiter.settled) continue;
      waiter.settled = true;
      if (waiter.timer !== undefined) clearTimeout(waiter.timer);
      if (waiter.onAbort !== undefined) waiter.signal?.removeEventListener("abort", waiter.onAbort);
      const lease = this.grant(sessionId, state);
      waiter.resolve(lease);
      return;
    }
  }

  private removeIdleState(sessionId: string, state: SessionState): void {
    if (state.holder === undefined && state.waiters.length === 0 && this.sessions.get(sessionId) === state) {
      this.sessions.delete(sessionId);
    }
  }

  private error(
    code: GatewayTurnLeaseErrorCode,
    sessionId: string,
    waitTimeoutMs: number,
    waitedMs: number,
    state: SessionState
  ): GatewayTurnLeaseError {
    return new GatewayTurnLeaseError(code, {
      sessionId,
      waitTimeoutMs,
      waitedMs,
      queueDepth: state.waiters.length,
      ...(state.holder === undefined ? {} : { generation: state.holder })
    });
  }
}
