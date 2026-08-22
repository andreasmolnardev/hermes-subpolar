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
- `pre-approved` uses the Agent's configured allow/deny policies, while any
  configured `ask` policy records `needs_attention`.
- `fail` runs the normal resolver in `ask` mode for mutating capabilities, so
  even a configured allow requires interactive approval and becomes
  `needs_attention` for an automation.

The scheduler claims a due occurrence in SQLite using a unique
`(automation_id, scheduled_for)` key before dispatching it. This prevents a
duplicate when scheduler ticks overlap and allows state to survive a process
restart. Automation definitions, schedules, and run history survive an
application restart. An interrupted queued or running execution is not
resumable, so it is marked failed with a restart error; a missed recurring
schedule receives one catch-up claim and the next occurrence is then
persisted. Failures do not crash the scheduler.

The current deployment assumes a single API Gateway instance. SQLite claiming
is safe within that instance; distributed deployments need an external
distributed lock/lease before running multiple replicas against the same
automation database.
