import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { Type, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import {
	executeSubpolarPiChildRun,
	type HarnessPersistencePort,
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
	const root = await mkdtemp(join(tmpdir(), "hermes-subpolar-child-"));
	try {
		return await fn(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

function waitFor(promise: Promise<void>, timeoutMs = 2_000): Promise<void> {
	return Promise.race([
		promise,
		new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for child Pi run")), timeoutMs)),
	]);
}

describe("Subpolar child Pi session", () => {
	test("correlates child result and every projected event to the parent run", async () => {
		await withTempRun(async (root) => {
			const faux = fauxProvider();
			faux.setResponses([fauxAssistantMessage("child complete")]);
			const observed: SubpolarPiChildEvent[] = [];
			const result = await executeSubpolarPiChildRun({
				parent,
				childAgentId: "researcher",
				childRunId: "child-run-1",
				model: faux.getModel(),
				instructions: "Return the child result.",
				cwd: root,
				tools: [],
				nativeProviders: [faux.provider],
				onEvent: (event) => observed.push(event),
			});

			expect(result).toMatchObject({ parentRunId: "parent-run", childRunId: "child-run-1", childAgentId: "researcher" });
			expect(result.message).toMatchObject({ role: "assistant" });
			expect(result.events.length).toBeGreaterThan(0);
			expect(result.events).toEqual(observed);
			expect(result.events.every((event) => event.parentRunId === "parent-run" && event.childRunId === "child-run-1" && event.runId === "child-run-1")).toBe(true);
		});
	});

	test("persists child session lineage and tool checkpoints through the application adapter", async () => {
		await withTempRun(async (root) => {
			const faux = fauxProvider();
			faux.setResponses([
				fauxAssistantMessage(fauxToolCall("lookup", { query: "status" }), { stopReason: "toolUse" }),
				fauxAssistantMessage("child persisted"),
			]);
			const setups: NonNullable<Parameters<NonNullable<HarnessPersistencePort["ensureSession"]>>[1]>[] = [];
			const checkpoints: NonNullable<Parameters<NonNullable<HarnessPersistencePort["checkpoint"]>>[0]>[] = [];
			const persistence: HarnessPersistencePort = {
				ensureSession: async (_sessionId, setup) => { if (setup !== undefined) setups.push(setup); },
				checkpoint: async checkpoint => { checkpoints.push(checkpoint); },
			};
			const lookup: SubpolarPiTool = {
				name: "lookup",
				label: "Lookup",
				description: "Return a child-scoped value",
				parameters: Type.Object({ query: Type.String() }),
				execute: async () => ({ content: [{ type: "text", text: "ready" }] }),
			};

			const result = await executeSubpolarPiChildRun({
				parent,
				childAgentId: "persisted-worker",
				childRunId: "child-persisted",
				model: faux.getModel(),
				instructions: "Use the lookup tool.",
				cwd: root,
				tools: [lookup],
				nativeProviders: [faux.provider],
				persistence,
			});

			expect(result.childRunId).toBe("child-persisted");
			expect(setups).toHaveLength(1);
			expect(setups[0]).toMatchObject({
				sessionId: "session-1.child-persisted",
				runtime: { runtimeVersion: "pi-child" },
				metadata: {
					role: "child",
					parentRunId: "parent-run",
					childRunId: "child-persisted",
					childAgentId: "persisted-worker",
				},
			});
			expect(checkpoints.map(checkpoint => checkpoint.phase)).toEqual(["before-tool", "tool-completed"]);
			expect(checkpoints.every(checkpoint => checkpoint.sessionId === "session-1.child-persisted" && checkpoint.requestId === "child-persisted")).toBe(true);
			expect(checkpoints[0]?.call).toMatchObject({ id: expect.any(String), name: "lookup" });
			expect(checkpoints[1]?.result).toMatchObject({ content: expect.stringContaining("ready") });
		});
	});

	test("propagates AbortSignal cancellation into the child session", async () => {
		await withTempRun(async (root) => {
			const faux = fauxProvider();
			faux.setResponses([fauxAssistantMessage(fauxToolCall("wait", {}), { stopReason: "toolUse" })]);
			const controller = new AbortController();
			let started: (() => void) | undefined;
			let signalAborted = false;
			const startedPromise = new Promise<void>((resolve) => { started = resolve; });
			const wait: SubpolarPiTool = {
				name: "wait",
				label: "Wait",
				description: "Wait for cancellation",
				parameters: Type.Object({}),
				execute: async ({ signal }) => {
					started?.();
					if (!signal) throw new Error("child tool did not receive an AbortSignal");
					await new Promise<never>((_, reject) => signal.addEventListener("abort", () => {
						signalAborted = true;
						reject(new Error("child aborted"));
					}, { once: true }));
				},
			};
			const execution = executeSubpolarPiChildRun({
				parent,
				childAgentId: "worker",
				childRunId: "child-cancelled",
				model: faux.getModel(),
				instructions: "Wait for cancellation.",
				cwd: root,
				tools: [wait],
				nativeProviders: [faux.provider],
				signal: controller.signal,
			});

			await waitFor(startedPromise);
			controller.abort(new Error("parent cancelled"));
			await expect(execution).rejects.toThrow();
			expect(signalAborted).toBe(true);
		});
	});

	test("passes only the restricted child tool set to Pi", async () => {
		await withTempRun(async (root) => {
			const faux = fauxProvider();
			const seenTools: string[][] = [];
			faux.setResponses([
				(context) => {
					seenTools.push(context.tools?.map((tool) => tool.name) ?? []);
					return fauxAssistantMessage(fauxToolCall("safe", {}), { stopReason: "toolUse" });
				},
				fauxAssistantMessage("safe complete"),
			]);
			let safeExecutions = 0;
			const safe: SubpolarPiTool = {
				name: "safe",
				label: "Safe",
				description: "Allowed child capability",
				parameters: Type.Object({}),
				execute: async () => {
					safeExecutions += 1;
					return { content: [{ type: "text", text: "safe" }] };
				},
			};

			const result = await executeSubpolarPiChildRun({
				parent,
				childAgentId: "restricted-worker",
				childRunId: "child-restricted",
				model: faux.getModel(),
				instructions: "Use only the safe capability.",
				cwd: root,
				tools: [safe],
				nativeProviders: [faux.provider],
			});

			expect(seenTools).toEqual([["safe"]]);
			expect(safeExecutions).toBe(1);
			expect(result.events.some((event) => event.type === "tool.started" && event.toolName === "safe")).toBe(true);
		});
	});

	test("a child model cannot invoke a parent-only capability", async () => {
		await withTempRun(async (root) => {
			const faux = fauxProvider();
			let parentOnlyExecutions = 0;
			faux.setResponses([
				fauxAssistantMessage(fauxToolCall("parent-only", {}), { stopReason: "toolUse" }),
				fauxAssistantMessage("child completed without escalation"),
			]);
			const safe: SubpolarPiTool = {
				name: "safe",
				label: "Safe",
				description: "The only child capability",
				parameters: Type.Object({}),
				execute: async () => ({ content: [{ type: "text", text: "safe" }] }),
			};
			const parentOnly: SubpolarPiTool = {
				name: "parent-only",
				label: "Parent only",
				description: "Must never be inherited",
				parameters: Type.Object({}),
				execute: async () => {
					parentOnlyExecutions += 1;
					return { content: [{ type: "text", text: "escalated" }] };
				},
			};

			const result = await executeSubpolarPiChildRun({
				parent,
				childAgentId: "restricted-worker",
				childRunId: "child-no-escalation",
				model: faux.getModel(),
				instructions: "Do not access parent capabilities.",
				cwd: root,
				tools: [safe],
				nativeProviders: [faux.provider],
			});

			expect(parentOnlyExecutions).toBe(0);
			expect(result.message).toMatchObject({ role: "assistant" });
			expect(result.events.some((event) => event.type === "tool.completed" && event.toolName === "parent-only" && event.isError)).toBe(true);
		});
	});
});
