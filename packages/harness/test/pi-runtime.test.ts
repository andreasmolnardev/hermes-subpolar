import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
	createSubpolarPiRuntime,
	hydratePiSession,
	PiEventProjector,
	SubpolarPiCredentialStore,
	SubpolarResourceLoader,
	toPiMessages,
	toPiResolvedTool,
	toPiToolDefinition,
	type SubpolarPiEvent,
	type SubpolarPiTool,
} from "../src/index";
import { Type, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { resolveToolDescriptors } from "tool-resolver";

async function withTempRun<T>(fn: (root: string) => Promise<T>): Promise<T> {
	const root = await mkdtemp(join(tmpdir(), "hermes-subpolar-pi-"));
	try {
		return await fn(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

const run = {
	runId: "run-1",
	conversationId: "conversation-1",
	sessionId: "session-1",
	cwd: "/controlled/project",
	agentDir: "/controlled/agent",
} as const;

describe("Subpolar Pi runtime seam", () => {
	test("resource loading is explicit and does not discover project files", () => {
		const loader = new SubpolarResourceLoader({ systemPrompt: "Subpolar policy" });

		expect(loader.getSystemPrompt()).toBe("Subpolar policy");
		expect(loader.getSkills().skills).toEqual([]);
		expect(loader.getAgentsFiles().agentsFiles).toEqual([]);
		expect(loader.getExtensions().extensions).toEqual([]);
		expect(loader.getExtensions().errors).toEqual([]);
	});

	test("Pi events are projected into stable Subpolar events", () => {
		const events: SubpolarPiEvent[] = [];
		const projector = new PiEventProjector("run-1", (event) => events.push(event));

		projector.project({ type: "agent_start" });
		projector.project({ type: "message_update", message: {} as never, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "hello", partial: {} as never } });
		projector.project({ type: "tool_execution_start", toolCallId: "call-1", toolName: "demo", args: { value: 1 } });
		projector.project({ type: "tool_execution_end", toolCallId: "call-1", toolName: "demo", result: { ok: true }, isError: false });
		projector.project({ type: "agent_end", messages: [] });

		expect(events.map((event) => event.type)).toEqual([
			"run.started",
			"assistant.text_delta",
			"tool.started",
			"tool.completed",
			"run.completed",
		]);
	});

	test("Pi executes a deterministic model with no implicit tools", async () => {
		await withTempRun(async (root) => {
			const faux = fauxProvider();
			faux.setResponses([fauxAssistantMessage("hello from Pi")]);
			const events: SubpolarPiEvent[] = [];
			const runtime = await createSubpolarPiRuntime({
				...run,
				cwd: root,
				agentDir: join(root, "agent"),
				model: faux.getModel(),
				nativeProviders: [faux.provider],
				systemPrompt: "Only use Subpolar-provided resources.",
				onEvent: (event) => events.push(event),
			});

			await runtime.prompt("say hello");
			runtime.close();

			expect(runtime.session.state.messages.at(-1)).toMatchObject({ role: "assistant" });
			expect(events.some((event) => event.type === "assistant.text_delta" && event.delta.includes("hello"))).toBe(true);
			expect(events.at(-1)).toEqual({ type: "run.completed", runId: "run-1" });
		});
	});

	test("denied custom tools cannot reach the execution callback", async () => {
		let executions = 0;
		const tool: SubpolarPiTool = {
			name: "dangerous.demo",
			label: "Dangerous demo",
			description: "A test capability",
			parameters: Type.Object({ value: Type.String() }),
			authorize: async () => "deny",
			execute: async () => {
				executions += 1;
				return { content: [{ type: "text", text: "executed" }] };
			},
		};

		const result = await toPiToolDefinition(tool, run).execute("call-1", { value: "x" }, undefined, undefined, undefined as never);
		expect(executions).toBe(0);
		expect(result.details).toEqual({ denied: true });
		expect(result.content).toEqual([{ type: "text", text: "Permission denied for tool dangerous.demo." }]);
	});

	test("resolved Tool Resolver descriptors stay behind the injected runtime", async () => {
		const [descriptor] = resolveToolDescriptors([
			{
				name: "files.read",
				description: "Read a file",
				inputSchema: { type: "object", properties: {} },
				source: "filesystem",
				executable: { reference: "filesystem.read" },
			},
		], [{ toolName: "files.read", policy: "allow" }]);
		if (!descriptor) throw new Error("expected a resolved descriptor");
		let executed = false;
		const piTool = toPiResolvedTool(descriptor, run, async (resolved, request) => {
			executed = resolved.capabilityId === "files.read" && request.params !== undefined;
			return { content: [{ type: "text", text: "ok" }] };
		});

		const result = await piTool.execute("call-1", {}, undefined, undefined, undefined as never);
		expect(executed).toBe(true);
		expect(result.content).toEqual([{ type: "text", text: "ok" }]);
	});

	test("message hydration keeps system policy out of the transcript and preserves tool calls", () => {
		const faux = fauxProvider();
		const model = faux.getModel();
		const messages = toPiMessages([
			{ role: "system", content: "server policy" },
			{ role: "user", content: "read the file" },
			{
				role: "assistant",
				content: "I will inspect it",
				toolCalls: [{ id: "call-1", name: "filesystem.read", arguments: '{"path":"a.txt"}' }],
			},
			{ role: "tool", toolCallId: "call-1", name: "filesystem.read", content: "contents" },
		], model);

		expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "toolResult"]);
		expect(messages[1]).toMatchObject({ content: [{ type: "text", text: "I will inspect it" }, { type: "toolCall", id: "call-1" }] });
		expect(messages[2]).toMatchObject({ toolCallId: "call-1", toolName: "filesystem.read" });
		const session = { messages: [] as typeof messages } as never;
		hydratePiSession(session, [{ role: "user", content: "hello" }], model);
		expect(session.messages).toHaveLength(1);
	});

	test("credential access is delegated to Subpolar storage", async () => {
		let reads = 0;
		const store = new SubpolarPiCredentialStore({
			read: async () => {
				reads += 1;
				return undefined;
			},
			list: async () => [],
			modify: async (_providerId, fn) => fn(undefined),
			delete: async () => {},
		});

		await store.read("openai");
		expect(reads).toBe(1);
	});
});
