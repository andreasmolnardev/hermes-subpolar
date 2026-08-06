import { createToolHandle, type JsonSchema, type ToolDefinition, validateJsonSchema } from "tool-resolver";

export type McpTransport = {
  request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown>;
};

export type McpToolOptions = {
  readonly serverName: string;
  readonly transport: McpTransport;
  readonly policy?: "allow" | "ask" | "auto" | "deny";
};

type McpTool = { readonly name: string; readonly description?: string; readonly inputSchema?: JsonSchema };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toolName(server: string, name: string): string {
  const sanitize = (value: string) => value.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64);
  const result = `mcp__${sanitize(server)}__${sanitize(name)}`;
  if (result === "mcp____") throw new TypeError("MCP tool name is invalid");
  return result;
}

function toolsFromResponse(response: unknown): readonly McpTool[] {
  if (!isRecord(response) || !Array.isArray(response.tools)) throw new TypeError("MCP tools/list response is invalid");
  return response.tools.map(item => {
    if (!isRecord(item) || typeof item.name !== "string" || !item.name) throw new TypeError("MCP tool metadata is invalid");
    if (item.description !== undefined && typeof item.description !== "string") throw new TypeError("MCP description is invalid");
    return { name: item.name, ...(typeof item.description === "string" ? { description: item.description } : {}),
       ...(item.inputSchema !== undefined ? { inputSchema: validateJsonSchema(item.inputSchema, item.name) } : {}) };
  });
}

export async function createMcpToolDefinitions(options: McpToolOptions): Promise<readonly ToolDefinition[]> {
  const tools = toolsFromResponse(await options.transport.request("tools/list", {}));
  const names = new Set<string>();
  return tools.map(tool => {
    const name = toolName(options.serverName, tool.name);
    if (names.has(name)) throw new TypeError(`MCP tool name collision: ${name}`);
    names.add(name);
    return {
      name,
      description: tool.description ?? `MCP tool ${tool.name}`,
      inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
      source: `tool-runtime:mcp:${options.serverName}`,
      capabilities: ["mcp"],
       executable: { handle: createToolHandle(async (argumentsValue, signal) => {
         if (!isRecord(argumentsValue)) throw new TypeError("MCP tool arguments must be an object");
         try {
           return await options.transport.request("tools/call", { name: tool.name, arguments: argumentsValue }, signal instanceof AbortSignal ? signal : undefined);
         } catch {
           throw new Error("MCP tool request failed");
         }
       }) },
      policy: options.policy ?? "ask"
    };
  });
}
