export type SettingsScope = "user" | "agent";

export type SettingsSection = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
};

export const SETTINGS_SECTIONS: Record<SettingsScope, readonly SettingsSection[]> = {
  user: [
    { id: "account", label: "Account", description: "Identity, password, sessions, and sign out." },
    { id: "appearance", label: "Appearance", description: "Theme and interface preferences." },
    { id: "chat", label: "Chat", description: "Conversation defaults and behavior." },
    { id: "voice", label: "Voice", description: "Speech, voices, and recording." },
    { id: "notifications", label: "Notifications", description: "Desktop and task notifications." },
    { id: "keybinds", label: "Keybinds", description: "Keyboard shortcuts." },
    { id: "about", label: "About", description: "Version, build, and system information." },
  ],
  agent: [
    { id: "models", label: "Models", description: "Providers, models, and runtime defaults." },
    { id: "integrations", label: "Integrations", description: "External capability providers." },
    { id: "tools", label: "Tools", description: "Global capability catalog." },
    { id: "skills", label: "Skills", description: "Installed agent skills." },
    { id: "plugins", label: "Plugins", description: "Installed extensions and permissions." },
    { id: "memory", label: "Memory", description: "Memory providers and retrieval behavior." },
    { id: "runtime", label: "Runtime", description: "Execution limits, backends, and concurrency." },
    { id: "safety", label: "Safety", description: "System-wide guardrails and permission modes." },
  ],
};

export function settingsSection(scope: SettingsScope, id: string): SettingsSection | undefined {
  return SETTINGS_SECTIONS[scope].find(section => section.id === id);
}
