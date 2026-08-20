export type IterationBudgetResource =
  | "turns"
  | "providerCalls"
  | "toolCalls"
  | "tokens";

export type IterationBudgetLimits = {
  readonly maxTurns?: number;
  readonly maxProviderCalls?: number;
  readonly maxToolCalls?: number;
  readonly maxTokens?: number;
};

export type IterationBudgetExhaustionReason =
  | "max_turns"
  | "max_provider_calls"
  | "max_tool_calls"
  | "max_tokens";

export type IterationBudgetDecision = {
  readonly allowed: boolean;
  readonly resource: IterationBudgetResource;
  readonly requested: number;
  readonly used: number;
  readonly remaining: number | undefined;
  readonly limit: number | undefined;
  readonly reason?: IterationBudgetExhaustionReason;
};

export type IterationBudgetSnapshot = {
  readonly turns: number;
  readonly providerCalls: number;
  readonly toolCalls: number;
  readonly tokens: number;
  readonly remaining: {
    readonly turns: number | undefined;
    readonly providerCalls: number | undefined;
    readonly toolCalls: number | undefined;
    readonly tokens: number | undefined;
  };
};

const LIMIT_KEYS: Record<IterationBudgetResource, keyof IterationBudgetLimits> = {
  turns: "maxTurns",
  providerCalls: "maxProviderCalls",
  toolCalls: "maxToolCalls",
  tokens: "maxTokens"
};

const REASONS: Record<IterationBudgetResource, IterationBudgetExhaustionReason> = {
  turns: "max_turns",
  providerCalls: "max_provider_calls",
  toolCalls: "max_tool_calls",
  tokens: "max_tokens"
};

function boundedLimit(value: number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number`);
  }
  return value;
}

function amount(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("Budget amounts must be finite non-negative numbers");
  }
  return value;
}

/**
 * Synchronous counters for the harness budgets.
 *
 * Each operation completes without an await, so concurrent promise callbacks
 * cannot observe or create a partially-applied update. `check` is useful for
 * preserving a preflight boundary; `tryConsume` combines that check with the
 * update and reports why it was refused.
 */
export class IterationBudget {
  readonly maxTurns: number | undefined;
  readonly maxProviderCalls: number | undefined;
  readonly maxToolCalls: number | undefined;
  readonly maxTokens: number | undefined;

  private readonly counts: Record<IterationBudgetResource, number> = {
    turns: 0,
    providerCalls: 0,
    toolCalls: 0,
    tokens: 0
  };

  constructor(limits: IterationBudgetLimits = {}) {
    this.maxTurns = boundedLimit(limits.maxTurns, "maxTurns");
    this.maxProviderCalls = boundedLimit(limits.maxProviderCalls, "maxProviderCalls");
    this.maxToolCalls = boundedLimit(limits.maxToolCalls, "maxToolCalls");
    this.maxTokens = boundedLimit(limits.maxTokens, "maxTokens");
  }

  /** Return whether an amount can be consumed without changing the counter. */
  check(resource: IterationBudgetResource = "turns", requested = 1): IterationBudgetDecision {
    const quantity = amount(requested);
    const used = this.counts[resource];
    const limit = this[LIMIT_KEYS[resource]];
    const remaining = limit === undefined ? undefined : Math.max(0, limit - used);
    const allowed = limit === undefined || used + quantity <= limit;
    return {
      allowed,
      resource,
      requested: quantity,
      used,
      remaining,
      limit,
      ...(allowed ? {} : { reason: REASONS[resource] })
    };
  }

  /** Try to consume an amount and return an explicit exhaustion reason. */
  tryConsume(resource: IterationBudgetResource = "turns", requested = 1): IterationBudgetDecision {
    const decision = this.check(resource, requested);
    if (decision.allowed) this.counts[decision.resource] += decision.requested;
    return decision.allowed
      ? {
        ...decision,
        used: this.counts[decision.resource],
        remaining: decision.limit === undefined
          ? undefined
          : Math.max(0, decision.limit - this.counts[decision.resource])
      }
      : decision;
  }

  /** Return consumed capacity to a counter, never below zero. */
  refund(resource: IterationBudgetResource = "turns", requested = 1): void {
    this.counts[resource] = Math.max(0, this.counts[resource] - amount(requested));
  }

  used(resource: IterationBudgetResource = "turns"): number {
    return this.counts[resource];
  }

  remaining(resource: IterationBudgetResource = "turns"): number | undefined {
    const limit = this[LIMIT_KEYS[resource]];
    return limit === undefined ? undefined : Math.max(0, limit - this.counts[resource]);
  }

  exhaustionReason(resource: IterationBudgetResource = "turns"): IterationBudgetExhaustionReason | undefined {
    const decision = this.check(resource, 1);
    return decision.reason;
  }

  snapshot(): IterationBudgetSnapshot {
    return {
      turns: this.used("turns"),
      providerCalls: this.used("providerCalls"),
      toolCalls: this.used("toolCalls"),
      tokens: this.used("tokens"),
      remaining: {
        turns: this.remaining("turns"),
        providerCalls: this.remaining("providerCalls"),
        toolCalls: this.remaining("toolCalls"),
        tokens: this.remaining("tokens")
      }
    };
  }
}
