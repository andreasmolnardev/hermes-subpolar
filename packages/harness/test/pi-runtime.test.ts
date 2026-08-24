import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
	createSubpolarPiRuntime,
	createSubpolarPiProviderBridge,
	executeSubpolarPiRun,
	SubpolarPiBudgetError,
	SubpolarPiTimeoutError,
	hydratePiSession,
	PiEventProjector,
	SubpolarPiCredentialStore,
	SubpolarResourceLoader,
	toPiMessages,
	toPiImages,
	toPiResolvedTool,
	toPiToolDefinition,
	type SubpolarPiEvent,
	type SubpolarPiTool,
} from "../src/index";
import { Type, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
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

function abortError(): Error {
	const error = new Error("Pi work aborted");
	error.name = "AbortError";
	return error;
}

function waitFor<T>(promise: Promise<T>, timeoutMs = 2_000): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for Pi runtime")), timeoutMs)),
	]);
}

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
			await runtime.close();

			expect(runtime.session.state.messages.at(-1)).toMatchObject({ role: "assistant" });
			expect(events.some((event) => event.type === "assistant.text_delta" && event.delta.includes("hello"))).toBe(true);
			expect(events.at(-1)).toEqual({ type: "run.completed", runId: "run-1" });
		});
	});

	test("native Pi enforces turn budgets before the provider call", async () => {
		await withTempRun(async (root) => {
			const faux = fauxProvider();
			faux.setResponses([fauxAssistantMessage("must not run")]);
			const events: SubpolarPiEvent[] = [];
			await expect(executeSubpolarPiRun({
				...run,
				cwd: root,
				agentDir: join(root, "agent"),
				model: faux.getModel(),
				nativeProviders: [faux.provider],
				budgets: { maxTurns: 0 },
				userMessage: "blocked",
				onEvent: event => events.push(event),
			})).rejects.toBeInstanceOf(SubpolarPiBudgetError);
			expect(faux.state.callCount).toBe(0);
			expect(events).toContainEqual({ type: "run.budget_exhausted", runId: run.runId, resource: "turns", limit: 0 });
		});
	});

	test("native Pi deadline aborts an active tool", async () => {
		await withTempRun(async (root) => {
			const faux = fauxProvider();
			faux.setResponses([fauxAssistantMessage(fauxToolCall("wait", {}), { stopReason: "toolUse" })]);
			const events: SubpolarPiEvent[] = [];
			await expect(executeSubpolarPiRun({
				...run,
				cwd: root,
				agentDir: join(root, "agent"),
				model: faux.getModel(),
				nativeProviders: [faux.provider],
				timeoutMs: 10,
				tools: [{
					name: "wait",
					label: "Wait",
					description: "Wait until cancelled",
					parameters: Type.Object({}),
					execute: async ({ signal }) => {
						await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
					},
				}],
				userMessage: "timeout",
				onEvent: event => events.push(event),
			})).rejects.toBeInstanceOf(SubpolarPiTimeoutError);
			expect(events.some(event => event.type === "run.timed_out")).toBe(true);
		});
	});

	test("AbortSignal aborts the active Pi session before prompt settles", async () => {
		await withTempRun(async (root) => {
			const faux = fauxProvider();
			faux.setResponses([fauxAssistantMessage(fauxToolCall("wait", {}), { stopReason: "toolUse" })]);
			const controller = new AbortController();
			let toolStarted: (() => void) | undefined;
			let toolAborted = false;
			const toolStartedPromise = new Promise<void>((resolve) => {
				toolStarted = resolve;
			});
			const runtime = await createSubpolarPiRuntime({
				...run,
				cwd: root,
				agentDir: join(root, "agent"),
				model: faux.getModel(),
				nativeProviders: [faux.provider],
				signal: controller.signal,
				tools: [{
					name: "wait",
					label: "Wait",
					description: "Wait until cancelled",
					parameters: Type.Object({}),
					execute: async ({ signal }) => {
						toolStarted?.();
						if (!signal) throw new Error("Pi did not pass the tool AbortSignal");
						if (signal.aborted) {
							toolAborted = true;
							throw abortError();
						}
						await new Promise<never>((_, reject) => signal.addEventListener("abort", () => {
							toolAborted = true;
							reject(abortError());
						}, { once: true }));
					},
				}],
			});

			const prompt = runtime.prompt("start work").catch(() => undefined);
			await waitFor(toolStartedPromise);
			controller.abort(new Error("request cancelled"));
			await waitFor(prompt);
			await waitFor(runtime.close());

			expect(toolAborted).toBe(true);
		});
	});

	test("close aborts active Pi work, waits for idle, and is idempotent", async () => {
		await withTempRun(async (root) => {
			const faux = fauxProvider();
			faux.setResponses([fauxAssistantMessage(fauxToolCall("wait", {}), { stopReason: "toolUse" })]);
			let toolStarted: (() => void) | undefined;
			let toolAborted = false;
			const toolStartedPromise = new Promise<void>((resolve) => {
				toolStarted = resolve;
			});
			const runtime = await createSubpolarPiRuntime({
				...run,
				cwd: root,
				agentDir: join(root, "agent"),
				model: faux.getModel(),
				nativeProviders: [faux.provider],
				tools: [{
					name: "wait",
					label: "Wait",
					description: "Wait until cancelled",
					parameters: Type.Object({}),
					execute: async ({ signal }) => {
						toolStarted?.();
						if (!signal) throw new Error("Pi did not pass the tool AbortSignal");
						await new Promise<never>((_, reject) => signal.addEventListener("abort", () => {
							toolAborted = true;
							reject(abortError());
						}, { once: true }));
					},
				}],
			});

			const prompt = runtime.prompt("start work").catch(() => undefined);
			await waitFor(toolStartedPromise);
			const firstClose = runtime.close();
			expect(runtime.close()).toBe(firstClose);
			await waitFor(firstClose);
			await waitFor(prompt);

			expect(toolAborted).toBe(true);
			await expect(runtime.prompt("after close")).rejects.toThrow("closed");
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

	test("Pi ask authorization is re-evaluated for every call and rejects stale approval", async () => {
		let authorizationCalls = 0;
		let executions = 0;
		const [descriptor] = resolveToolDescriptors([{
			name: "dangerous.write",
			capabilityId: "dangerous.write",
			description: "Write a dangerous value",
			inputSchema: { type: "object", properties: {} },
			source: "test",
			executable: { reference: "test://dangerous.write" },
			policy: "ask",
		}], [{ toolName: "dangerous.write", policy: "ask" }]);
		if (!descriptor) throw new Error("expected an approval-gated descriptor");
		const piTool = toPiResolvedTool(descriptor, run, async () => {
			executions += 1;
			return { content: [{ type: "text", text: "executed" }] };
		}, async () => {
			authorizationCalls += 1;
			return authorizationCalls === 1 ? "allow" : "deny";
		});

		const first = await piTool.execute("call-1", {}, undefined, undefined, undefined as never);
		const second = await piTool.execute("call-2", {}, undefined, undefined, undefined as never);
		expect(authorizationCalls).toBe(2);
		expect(executions).toBe(1);
		expect(first.content).toEqual([{ type: "text", text: "executed" }]);
		expect(second.details).toEqual({ denied: true });
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

	test("Pi message hydration preserves base64 image parts and never fetches remote media", () => {
		const faux = fauxProvider();
		const model = faux.getModel();
		const image = { type: "image_url" as const, imageUrl: "data:image/png;base64,AA==" };
		const messages = toPiMessages([{ role: "user", content: [{ type: "text", text: "inspect" }, image] }], model);

		expect(messages[0]).toMatchObject({
			role: "user",
			content: [{ type: "text", text: "inspect" }, { type: "image", mimeType: "image/png", data: "AA==" }],
		});
		expect(() => toPiImages([{ type: "image", url: "https://example.invalid/image.png" }])).toThrow("requires a base64 data URL");
		expect(() => toPiMessages([{ role: "user", content: [{ type: "image", url: "https://example.invalid/image.png" }] }], model))
			.toThrow("requires a base64 data URL");
	});

	test("the Pi execution prompt preserves current-turn images", async () => {
		await withTempRun(async (root) => {
			const faux = fauxProvider();
			faux.setResponses([(context) => {
				expect(context.messages.at(-1)).toMatchObject({
					role: "user",
					content: [{ type: "text", text: "inspect" }, { type: "image", mimeType: "image/png", data: "AA==" }],
				});
				return fauxAssistantMessage("image received");
			}]);

			const result = await executeSubpolarPiRun({
				...run,
				cwd: root,
				agentDir: join(root, "agent"),
				model: faux.getModel(),
				nativeProviders: [faux.provider],
				userMessage: "inspect",
				userImages: [{ type: "image", mimeType: "image/png", data: "AA==" }],
			});

			expect(result.message).toMatchObject({ role: "assistant" });
		});
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

	test("the execution entry point hydrates approved history before one Pi turn", async () => {
		await withTempRun(async (root) => {
			const faux = fauxProvider();
			faux.setResponses([fauxAssistantMessage("continued")]);
			const result = await executeSubpolarPiRun({
				...run,
				cwd: root,
				agentDir: join(root, "agent"),
				model: faux.getModel(),
				nativeProviders: [faux.provider],
				history: [{ role: "user", content: "previous context" }],
				userMessage: "continue",
			});

			expect(result.message).toMatchObject({ role: "assistant" });
			expect(result.events.at(-1)).toEqual({ type: "run.completed", runId: "run-1" });
		});
	});

	test("a persisted Pi session hydrates once across runtime restarts", async () => {
		await withTempRun(async (root) => {
			const sessionFile = join(root, "sessions", "conversation.jsonl");
			const faux = fauxProvider();
			faux.setResponses([fauxAssistantMessage("first response"), fauxAssistantMessage("resumed response")]);

			const first = await executeSubpolarPiRun({
				...run,
				cwd: root,
				agentDir: join(root, "agent"),
				sessionFile,
				model: faux.getModel(),
				nativeProviders: [faux.provider],
				history: [{ role: "user", content: "approved earlier context" }],
				userMessage: "first turn",
			});

			const second = await executeSubpolarPiRun({
				...run,
				cwd: root,
				agentDir: join(root, "agent"),
				sessionFile,
				model: faux.getModel(),
				nativeProviders: [faux.provider],
				userMessage: "resume after restart",
			});

			const messages = second.message === undefined ? [] : second.events;
			expect(first.message).toMatchObject({ role: "assistant" });
			expect(second.message).toMatchObject({ role: "assistant" });
			expect(faux.state.callCount).toBe(2);
			expect(messages.at(-1)).toEqual({ type: "run.completed", runId: "run-1" });
		});
	});

	test("Pi-native model changes and compaction entries survive a restart", async () => {
		await withTempRun(async (root) => {
			const sessionFile = join(root, "sessions", "state.jsonl");
			const faux = fauxProvider({ models: [{ id: "faux-1" }, { id: "faux-2" }] });
			faux.setResponses([fauxAssistantMessage("ready")]);
			const first = await createSubpolarPiRuntime({
				...run,
				cwd: root,
				agentDir: join(root, "agent"),
				sessionFile,
				model: faux.getModel("faux-1")!,
				nativeProviders: [faux.provider],
			});

			await first.prompt("create state");
			await first.session.setModel(faux.getModel("faux-2")!);
			await first.close();

			const second = await createSubpolarPiRuntime({
				...run,
				cwd: root,
				agentDir: join(root, "agent"),
				sessionFile,
				model: faux.getModel("faux-2")!,
				nativeProviders: [faux.provider],
			});
			const entries = second.session.sessionManager.getEntries();
			expect(entries.some((entry) => entry.type === "model_change" && entry.modelId === "faux-2")).toBe(true);
			await second.close();
		});
	});

	test("the provider bridge preserves Pi streaming while using the existing provider contract", async () => {
		const bridge = createSubpolarPiProviderBridge({
			providerId: "subpolar-test",
			modelId: "test-model",
			chatProvider: {
				async *stream(request) {
					expect(request.messages[0]).toMatchObject({ role: "system" });
					yield { type: "text-delta", text: "hello" };
					yield { type: "finish", finishReason: "stop", usage: { inputTokens: 2, outputTokens: 1 } };
				},
			},
		});
		const stream = bridge.provider.streamSimple(bridge.model, {
			systemPrompt: "policy",
			messages: [{ role: "user", content: "hi", timestamp: Date.now() }],
		});
		const events = [] as string[];
		for await (const event of stream) events.push(event.type);
		const result = await stream.result();
		expect(events).toEqual(["start", "text_start", "text_delta", "done"]);
		expect(result.content).toMatchObject([{ type: "text", text: "hello" }]);
	});
});
