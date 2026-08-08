export type IterationBudgetResource =
  | "turns"
  | "providerCalls"
  | "toolCalls"
  | "tokens";

export type IterationBudgetResourceAlias = IterationBudgetResource | "turn" | "provider" | "tool" | "token";

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

const RESOURCE_ALIASES: Record<IterationBudgetResourceAlias, IterationBudgetResource> = {
  turns: "turns",
  turn: "turns",
  providerCalls: "providerCalls",
  provider: "providerCalls",
  toolCalls: "toolCalls",
  tool: "toolCalls",
  tokens: "tokens",
  token: "tokens"
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
 * Synchronous counters for the budgets represented by HarnessBudgets.
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

  constructor(limits: IterationBudgetLimits | number = {}) {
    const values = typeof limits === "number" ? { maxTurns: limits } : limits;
    this.maxTurns = boundedLimit(values.maxTurns, "maxTurns");
    this.maxProviderCalls = boundedLimit(values.maxProviderCalls, "maxProviderCalls");
    this.maxToolCalls = boundedLimit(values.maxToolCalls, "maxToolCalls");
    this.maxTokens = boundedLimit(values.maxTokens, "maxTokens");
  }

  /** Return whether an amount can be consumed without changing the counter. */
  check(resource: IterationBudgetResourceAlias = "turns", requested = 1): IterationBudgetDecision {
    const canonical = RESOURCE_ALIASES[resource];
    const quantity = amount(requested);
    const used = this.counts[canonical];
    const limit = this[LIMIT_KEYS[canonical]];
    const remaining = limit === undefined ? undefined : Math.max(0, limit - used);
    const allowed = limit === undefined || used + quantity <= limit;
    return {
      allowed,
      resource: canonical,
      requested: quantity,
      used,
      remaining,
      limit,
      ...(allowed ? {} : { reason: REASONS[canonical] })
    };
  }

  /** Try to consume an amount and return an explicit exhaustion reason. */
  tryConsume(resource: IterationBudgetResourceAlias = "turns", requested = 1): IterationBudgetDecision {
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

  /** Boolean consume operation for callers that do not need the decision. */
  consume(resource: IterationBudgetResourceAlias = "turns", requested = 1): boolean {
    return this.tryConsume(resource, requested).allowed;
  }

  /** Return consumed capacity to a counter, never below zero. */
  refund(resource: IterationBudgetResourceAlias = "turns", requested = 1): void {
    const canonical = RESOURCE_ALIASES[resource];
    this.counts[canonical] = Math.max(0, this.counts[canonical] - amount(requested));
  }

  used(resource: IterationBudgetResourceAlias = "turns"): number {
    return this.counts[RESOURCE_ALIASES[resource]];
  }

  remaining(resource: IterationBudgetResourceAlias = "turns"): number | undefined {
    const canonical = RESOURCE_ALIASES[resource];
    const limit = this[LIMIT_KEYS[canonical]];
    return limit === undefined ? undefined : Math.max(0, limit - this.counts[canonical]);
  }

  exhaustionReason(resource: IterationBudgetResourceAlias = "turns"): IterationBudgetExhaustionReason | undefined {
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
