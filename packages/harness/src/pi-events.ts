import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

export type SubpolarPiEvent =
	| { type: "run.started"; runId: string }
	| { type: "turn.started"; runId: string }
	| { type: "assistant.text_delta"; runId: string; delta: string }
	| { type: "assistant.thinking_delta"; runId: string; delta: string }
	| { type: "tool.started"; runId: string; toolCallId: string; toolName: string; args: unknown }
	| { type: "tool.updated"; runId: string; toolCallId: string; toolName: string; result: unknown }
	| { type: "tool.completed"; runId: string; toolCallId: string; toolName: string; result: unknown; isError: boolean }
	| { type: "turn.completed"; runId: string }
	| { type: "run.completed"; runId: string }
	| { type: "run.retrying"; runId: string; attempt: number; error: string };

export type SubpolarPiEventSink = (event: SubpolarPiEvent) => void;

/** Project Pi's internal event vocabulary into the stable Subpolar run stream. */
export class PiEventProjector {
	constructor(
		private readonly runId: string,
		private readonly sink: SubpolarPiEventSink,
	) {}

	project(event: AgentSessionEvent): void {
		switch (event.type) {
			case "agent_start":
				this.sink({ type: "run.started", runId: this.runId });
				return;
			case "turn_start":
				this.sink({ type: "turn.started", runId: this.runId });
				return;
			case "message_update":
				if (event.assistantMessageEvent.type === "text_delta") {
					this.sink({ type: "assistant.text_delta", runId: this.runId, delta: event.assistantMessageEvent.delta });
				} else if (event.assistantMessageEvent.type === "thinking_delta") {
					this.sink({
						type: "assistant.thinking_delta",
						runId: this.runId,
						delta: event.assistantMessageEvent.delta,
					});
				}
				return;
			case "tool_execution_start":
				this.sink({
					type: "tool.started",
					runId: this.runId,
					toolCallId: event.toolCallId,
					toolName: event.toolName,
					args: event.args,
				});
				return;
			case "tool_execution_update":
				this.sink({
					type: "tool.updated",
					runId: this.runId,
					toolCallId: event.toolCallId,
					toolName: event.toolName,
					result: event.partialResult,
				});
				return;
			case "tool_execution_end":
				this.sink({
					type: "tool.completed",
					runId: this.runId,
					toolCallId: event.toolCallId,
					toolName: event.toolName,
					result: event.result,
					isError: event.isError,
				});
				return;
			case "turn_end":
				this.sink({ type: "turn.completed", runId: this.runId });
				return;
			case "agent_end":
				this.sink({ type: "run.completed", runId: this.runId });
				return;
			case "auto_retry_start":
				this.sink({
					type: "run.retrying",
					runId: this.runId,
					attempt: event.attempt,
					error: event.errorMessage,
				});
				return;
		}
	}
}
