import type {
	AgentToolResult,
	AgentToolUpdateCallback,
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";

export type SubpolarPiPermissionDecision = "allow" | "deny";

export interface SubpolarPiToolRequest {
	readonly run: SubpolarPiRunContext;
	readonly toolCallId: string;
	readonly params: unknown;
	readonly signal: AbortSignal | undefined;
}

export interface SubpolarPiToolResult {
	readonly content: AgentToolResult<unknown>["content"];
	readonly details?: unknown;
	readonly isError?: boolean;
}

export interface SubpolarPiTool {
	readonly name: string;
	readonly label: string;
	readonly description: string;
	readonly parameters: ToolDefinition["parameters"];
	readonly capabilityId?: string;
	readonly authorize?: (request: SubpolarPiToolRequest) => Promise<SubpolarPiPermissionDecision>;
	readonly execute: (
		request: SubpolarPiToolRequest & { readonly onUpdate: AgentToolUpdateCallback | undefined },
	) => Promise<SubpolarPiToolResult>;
}

export interface SubpolarPiRunContext {
	readonly runId: string;
	readonly conversationId: string;
	readonly sessionId: string;
	readonly cwd: string;
	readonly agentDir: string;
}

function deniedResult(toolName: string): AgentToolResult<{ denied: true }> {
	return {
		content: [{ type: "text", text: `Permission denied for tool ${toolName}.` }],
		details: { denied: true },
	};
}

/** Convert a resolved Subpolar capability into a Pi custom tool. */
export function toPiToolDefinition(tool: SubpolarPiTool, run: SubpolarPiRunContext): ToolDefinition {
	return {
		name: tool.name,
		label: tool.label,
		description: tool.description,
		parameters: tool.parameters,
		execute: async (toolCallId, params, signal, onUpdate, _ctx: ExtensionContext) => {
			const request = { run, toolCallId, params, signal };
			const decision = (await tool.authorize?.(request)) ?? "allow";
			if (decision !== "allow") return deniedResult(tool.name);
			const result = await tool.execute({ ...request, onUpdate });
			return {
				content: result.content,
				details: result.details ?? {},
				...(result.isError ? { isError: true } : {}),
			};
		},
	};
}
