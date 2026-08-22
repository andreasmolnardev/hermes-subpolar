# Automations

Automations are persisted, owner-scoped schedules that submit a prompt to the
normal API Gateway and Harness. They can be global or associated with a
Project. Each invocation creates an `AutomationRun` and a normal persisted
session, so the transcript remains available from the run history.

Schedules are normalized to a five-field cron expression plus an explicit IANA
timezone. The UI provides examples for daily, weekly, and interval schedules;
the server validates the expression and calculates `nextRunAt`. One-time
invocations are also accepted with `kind: "once"`.

Automation permission modes are deliberately non-interactive:

- `read-only` removes mutating capabilities through the normal Tool Resolver.
- `pre-approved` uses the Agent's configured allow/deny policies.
- `fail` uses those policies and records `needs_attention` if an `ask` policy
  would require interactive approval.

The scheduler claims a due occurrence in SQLite using a unique
`(automation_id, scheduled_for)` key before dispatching it. This prevents a
duplicate when scheduler ticks overlap and allows state to survive a process
restart. On restart, queued or running rows from the previous process are
marked failed, and a missed recurring schedule receives one catch-up claim;
the next occurrence is then persisted. Failures do not crash the scheduler.

The current deployment assumes a single API Gateway instance. SQLite claiming
is safe within that instance; distributed deployments need an external
distributed lock/lease before running multiple replicas against the same
automation database.
