import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { Type, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import {
	createSubpolarPiSpawnAgentTool,
	createSubpolarPiRuntime,
	toPiToolDefinition,
	type SubpolarPiChildEvent,
	type SubpolarPiTool,
} from "../src/index";

const parent = Object.freeze({
	runId: "parent-run",
	conversationId: "conversation-1",
	sessionId: "session-1",
	cwd: "/parent/project",
	agentDir: "/parent/agent",
});

async function withTempRun<T>(fn: (root: string) => Promise<T>): Promise<T> {
	const root = await mkdtemp(join(tmpdir(), "hermes-subpolar-spawn-"));
	try {
		return await fn(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

function waitFor(promise: Promise<void>, timeoutMs = 2_000): Promise<void> {
	return Promise.race([
		promise,
		new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for spawn_agent")), timeoutMs)),
	]);
}

function hangingTool(onStart: () => void): SubpolarPiTool {
	return {
		name: "wait",
		label: "Wait",
		description: "Wait until cancelled",
		parameters: Type.Object({}),
		execute: async ({ signal }) => {
			onStart();
			if (!signal) throw new Error("missing child signal");
			await new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason ?? new Error("cancelled")), { once: true }));
		},
	};
}

describe("Subpolar spawn_agent Pi custom tool", () => {
	test("executes through Pi, correlates child events, and strips recursive privilege", async () => {
		await withTempRun(async (root) => {
			const parentFaux = fauxProvider();
			parentFaux.setResponses([
				fauxAssistantMessage(fauxToolCall("spawn_agent", { agentId: "researcher", task: "Find the answer." }), { stopReason: "toolUse" }),
				fauxAssistantMessage("child result returned"),
			]);
			const childFaux = fauxProvider();
			childFaux.setResponses([fauxAssistantMessage("answer from child")]);
			const safe: SubpolarPiTool = {
				name: "safe_lookup",
				label: "Safe lookup",
				description: "A restricted capability",
				parameters: Type.Object({}),
				execute: async () => ({ content: [{ type: "text", text: "safe" }] }),
			};
			const recursive = createSubpolarPiSpawnAgentTool({ resolveAgent: async () => {
				throw new Error("recursive resolution should not be reached");
			} });
			const childEvents: SubpolarPiChildEvent[] = [];
			const spawn = createSubpolarPiSpawnAgentTool({
				onChildEvent: event => childEvents.push(event),
				resolveAgent: async request => {
					expect(request.parent.runId).toBe("parent-run");
					expect(request.requestedAgentId).toBe("researcher");
					expect(request.task).toBe("Find the answer.");
					return {
						childAgentId: "researcher",
						model: childFaux.getModel(),
						instructions: "Answer carefully.",
						cwd: root,
						tools: [safe, recursive],
						nativeProviders: [childFaux.provider],
					};
				},
			});
			const runtime = await createSubpolarPiRuntime({
				...parent,
				model: parentFaux.getModel(),
				nativeProviders: [parentFaux.provider],
				tools: [spawn],
			});
			try {
				await runtime.prompt("Start a child.");
			} finally {
				await runtime.close();
			}
			expect(childEvents.length).toBeGreaterThan(0);
			expect(childEvents.every(event => event.parentRunId === "parent-run" && event.childRunId.startsWith("parent-run:child:"))).toBe(true);
		});
	});

	test("clamps a child deadline and returns a bounded tool error", async () => {
		await withTempRun(async (root) => {
			const childFaux = fauxProvider();
			childFaux.setResponses([fauxAssistantMessage(fauxToolCall("wait", {}), { stopReason: "toolUse" })]);
			let resolveStarted: (() => void) | undefined;
			const startedPromise = new Promise<void>(resolve => { resolveStarted = resolve; });
			const spawn = createSubpolarPiSpawnAgentTool({
				maxDeadlineMs: 25,
				resolveAgent: async () => ({
					childAgentId: "deadline-worker",
					model: childFaux.getModel(),
					instructions: "Wait.",
					cwd: root,
					tools: [hangingTool(() => resolveStarted?.())],
					nativeProviders: [childFaux.provider],
				}),
			});
			const piTool = toPiToolDefinition(spawn, parent);
			const execution = piTool.execute("spawn-1", { agentId: "deadline-worker", task: "Wait forever.", deadlineMs: 10_000 }, undefined, undefined);
			await waitFor(startedPromise);
			const result = await execution;
			expect(result.isError).toBe(true);
			expect(result.details).toEqual({ deadlineExceeded: true });
		});
	});

	test("propagates parent cancellation and denies privilege before child resolution", async () => {
		await withTempRun(async (root) => {
			const childFaux = fauxProvider();
			childFaux.setResponses([fauxAssistantMessage(fauxToolCall("wait", {}), { stopReason: "toolUse" })]);
			const controller = new AbortController();
			let resolveCalled = false;
			let resolveStarted: (() => void) | undefined;
			const started = new Promise<void>(resolve => { resolveStarted = resolve; });
			const spawn = createSubpolarPiSpawnAgentTool({
				resolveAgent: async () => {
					resolveCalled = true;
					return {
						childAgentId: "cancel-worker",
						model: childFaux.getModel(),
						instructions: "Wait.",
						cwd: root,
						tools: [hangingTool(() => resolveStarted?.())],
						nativeProviders: [childFaux.provider],
					};
				},
			});
			const piTool = toPiToolDefinition(spawn, parent);
			const execution = piTool.execute("spawn-2", { agentId: "cancel-worker", task: "Wait." }, controller.signal, undefined);
			await waitFor(started);
			controller.abort(new Error("parent cancelled"));
			await expect(execution).rejects.toThrow("parent cancelled");

			let deniedResolverCalled = false;
			const denied = createSubpolarPiSpawnAgentTool({
				authorize: async () => "deny",
				resolveAgent: async () => {
					deniedResolverCalled = true;
					throw new Error("denied request was resolved");
				},
			});
			const deniedResult = await toPiToolDefinition(denied, parent).execute("spawn-3", { agentId: "admin", task: "Escalate." }, undefined, undefined);
			expect(deniedResult.details).toEqual({ denied: true });
			expect(deniedResolverCalled).toBe(false);
			expect(resolveCalled).toBe(true);
		});
	});
});
