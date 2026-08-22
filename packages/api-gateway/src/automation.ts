import type {
  AutomationRecord,
  AutomationRunRecord,
  AutomationSchedule,
  SQLiteIdentityRepository,
} from "data-layer";

type CronField = { readonly values: ReadonlySet<number>; readonly min: number; readonly max: number };

function cronField(value: string, min: number, max: number): CronField {
  const values = new Set<number>();
  for (const part of value.split(",")) {
    const [base, stepText] = part.split("/");
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) throw new Error("Invalid cron step");
    const range = base === "*" || base === "" ? [min, max] : base!.split("-").map(Number);
    if (range.length !== 1 && range.length !== 2 || range.some(item => !Number.isInteger(item))) throw new Error("Invalid cron range");
    const start = range[0] as number;
    const end = (range[1] ?? start) as number;
    if (start < min || end > max || start > end) throw new Error("Cron value is outside its field");
    for (let item = start; item <= end; item += step) values.add(item);
  }
  if (values.size === 0) throw new Error("Cron field is empty");
  return { values, min, max };
}

function cronFields(expression: string): readonly CronField[] {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error("Cron schedules require five fields");
  return [cronField(fields[0]!, 0, 59), cronField(fields[1]!, 0, 23), cronField(fields[2]!, 1, 31), cronField(fields[3]!, 1, 12), cronField(fields[4]!, 0, 7)];
}

function timezone(value: string | undefined): string {
  const candidate = value?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!candidate) throw new Error("Automation timezone is required");
  try { new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(); } catch { throw new Error("Automation timezone is invalid"); }
  return candidate;
}

export function normalizeAutomationSchedule(value: unknown): AutomationSchedule {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Automation schedule is invalid");
  const input = value as Record<string, unknown>;
  if (input.kind === "once") {
    if (typeof input.at !== "string" || Number.isNaN(Date.parse(input.at))) throw new Error("One-time schedule is invalid");
    return { kind: "once", at: new Date(input.at).toISOString(), timezone: timezone(typeof input.timezone === "string" ? input.timezone : undefined) };
  }
  if (input.kind !== "cron" || typeof input.expression !== "string") throw new Error("Cron schedule is invalid");
  const expression = input.expression.trim().replace(/\s+/g, " ");
  cronFields(expression);
  return { kind: "cron", expression, timezone: timezone(typeof input.timezone === "string" ? input.timezone : undefined) };
}

function localParts(date: Date, zone: string): { readonly minute: number; readonly hour: number; readonly day: number; readonly month: number; readonly weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", weekday: "short" }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { minute: Number(get("minute")), hour: Number(get("hour")), day: Number(get("day")), month: Number(get("month")), weekday: weekday < 0 ? 0 : weekday };
}

export function nextAutomationRun(schedule: AutomationSchedule, after = new Date()): string | null {
  if (schedule.kind === "once") {
    const at = new Date(schedule.at);
    return at.getTime() > after.getTime() ? at.toISOString() : null;
  }
  const fields = cronFields(schedule.expression);
  const minutes = fields[0]!;
  const hours = fields[1]!;
  const days = fields[2]!;
  const months = fields[3]!;
  const weekdays = fields[4]!;
  const start = new Date(Math.floor(after.getTime() / 60_000) * 60_000 + 60_000);
  const dayRestricted = !schedule.expression.trim().split(/\s+/)[2]!.startsWith("*");
  const weekdayRestricted = !schedule.expression.trim().split(/\s+/)[4]!.startsWith("*");
  for (let offset = 0; offset <= 366 * 24 * 60; offset += 1) {
    const candidate = new Date(start.getTime() + offset * 60_000);
    const local = localParts(candidate, schedule.timezone);
    const dayMatch = days.values.has(local.day);
    const weekdayMatch = weekdays.values.has(local.weekday) || weekdays.values.has(7) && local.weekday === 0;
    const calendarMatch = dayRestricted && weekdayRestricted ? dayMatch || weekdayMatch : dayMatch && weekdayMatch;
    if (minutes.values.has(local.minute) && hours.values.has(local.hour) && months.values.has(local.month) && calendarMatch) return candidate.toISOString();
  }
  throw new Error("Cron schedule has no occurrence within one year");
}

export class AutomationRunError extends Error {
  readonly status: "failed" | "needs_attention";
  constructor(status: "failed" | "needs_attention", message: string) {
    super(message);
    this.name = "AutomationRunError";
    this.status = status;
  }
}

export type AutomationExecutor = (automation: AutomationRecord, run: AutomationRunRecord, signal: AbortSignal) => Promise<void>;

export class AutomationScheduler {
  private readonly active = new Map<string, AbortController>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private tickPromise: Promise<void> | undefined;
  private stopped = true;

  constructor(
    private readonly identity: SQLiteIdentityRepository,
    private readonly execute: AutomationExecutor,
    private readonly pollMs = 30_000,
  ) {
    if (!Number.isFinite(pollMs) || pollMs < 100) throw new TypeError("Automation scheduler poll interval is invalid");
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.identity.recoverAutomationRuns();
    this.timer = setInterval(() => { void this.tick(); }, this.pollMs);
    void this.tick();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    for (const controller of this.active.values()) controller.abort();
    await this.tickPromise;
    while (this.active.size > 0) await Promise.all([...this.active.keys()].map(id => this.waitForRun(id)));
  }

  async dispatch(run: AutomationRunRecord, automation: AutomationRecord): Promise<void> {
    if (this.stopped || this.active.has(run.id)) return;
    const controller = new AbortController();
    this.active.set(run.id, controller);
    this.identity.updateAutomationRun(run.id, "running");
    try {
      await this.execute(automation, run, controller.signal);
      this.identity.updateAutomationRun(run.id, "completed");
    } catch (error) {
      const status = error instanceof AutomationRunError ? error.status : controller.signal.aborted ? "cancelled" : "failed";
      this.identity.updateAutomationRun(run.id, status, error instanceof Error ? error.message : String(error));
    } finally {
      this.active.delete(run.id);
    }
  }

  private waitForRun(runId: string): Promise<void> {
    return new Promise(resolve => {
      const check = () => this.active.has(runId) ? setTimeout(check, 10) : resolve();
      check();
    });
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.tickPromise !== undefined) return this.tickPromise;
    this.tickPromise = (async () => {
      const at = new Date();
      for (const automation of this.identity.listDueAutomations(at.toISOString())) {
        if (automation.nextRunAt === undefined) continue;
        let next: string | null;
        try { next = nextAutomationRun(automation.schedule, new Date(automation.nextRunAt)); }
        catch (error) {
          const run = this.identity.claimDueAutomationRun(automation.id, automation.nextRunAt, null, { scheduler: "invalid_schedule" });
          if (run !== null) this.identity.updateAutomationRun(run.id, "failed", error instanceof Error ? error.message : String(error));
          continue;
        }
        const run = this.identity.claimDueAutomationRun(automation.id, automation.nextRunAt, next, { scheduler: "cron" });
        if (run !== null) void this.dispatch(run, automation);
      }
    })().finally(() => { this.tickPromise = undefined; });
    return this.tickPromise;
  }
}
