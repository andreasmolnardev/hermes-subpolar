import {
	createExtensionRuntime,
	type LoadExtensionsResult,
	type PromptTemplate,
	type ResourceLoader,
	type Skill,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import type { ResourceDiagnostic } from "@earendil-works/pi-coding-agent";

/**
 * Resources supplied by Hermes for one run.
 *
 * This deliberately does not inspect the cwd, ~/.pi, or any other implicit
 * Pi resource location. The application decides what the agent is allowed to
 * see and passes the resulting resources here.
 */
export interface SubpolarPiResourceOptions {
	systemPrompt?: string;
	appendSystemPrompt?: readonly string[];
	skills?: readonly Skill[];
}

export class SubpolarResourceLoader implements ResourceLoader {
	private readonly systemPrompt?: string;
	private readonly appendSystemPrompt: string[];
	private readonly skills: Skill[];

	constructor(options: SubpolarPiResourceOptions = {}) {
		this.systemPrompt = options.systemPrompt;
		this.appendSystemPrompt = [...(options.appendSystemPrompt ?? [])];
		this.skills = [...(options.skills ?? [])];
	}

	getExtensions(): LoadExtensionsResult {
		return { extensions: [], errors: [], runtime: createExtensionRuntime() };
	}

	getSkills(): { skills: Skill[]; diagnostics: ResourceDiagnostic[] } {
		return { skills: [...this.skills], diagnostics: [] };
	}

	getPrompts(): { prompts: PromptTemplate[]; diagnostics: ResourceDiagnostic[] } {
		return { prompts: [], diagnostics: [] };
	}

	getThemes(): { themes: Theme[]; diagnostics: ResourceDiagnostic[] } {
		return { themes: [], diagnostics: [] };
	}

	getAgentsFiles(): { agentsFiles: Array<{ path: string; content: string }> } {
		return { agentsFiles: [] };
	}

	getSystemPrompt(): string | undefined {
		return this.systemPrompt;
	}

	getSystemPromptSource(): { path: string } | undefined {
		return undefined;
	}

	getAppendSystemPrompt(): string[] {
		return [...this.appendSystemPrompt];
	}

	getAppendSystemPromptSources(): Array<{ path: string }> {
		return [];
	}

	extendResources(_paths: Parameters<ResourceLoader["extendResources"]>[0]): void {
		// Subpolar resources are immutable for the lifetime of a run.
	}

	async reload(_options?: Parameters<ResourceLoader["reload"]>[0]): Promise<void> {
		// There is no filesystem-backed resource set to reload.
	}
}
