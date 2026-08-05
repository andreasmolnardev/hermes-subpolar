import type { ToolPolicySnapshot } from "data-layer/contracts";

export type ResolvedTool = {
  name: string;
  policy: Exclude<ToolPolicySnapshot["policy"], "deny">;
};

export function resolveTools(snapshot: readonly ToolPolicySnapshot[]): readonly ResolvedTool[] {
  return snapshot
    .filter((tool): tool is ToolPolicySnapshot & { policy: ResolvedTool["policy"] } => tool.policy !== "deny")
    .map(tool => ({ name: tool.toolName, policy: tool.policy }));
}
