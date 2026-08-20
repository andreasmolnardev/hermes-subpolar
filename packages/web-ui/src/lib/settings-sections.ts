import type { ComponentType } from "react";
import {
  Bell,
  Brain,
  Cpu,
  Info,
  Keyboard,
  MessageCircle,
  Palette,
  Plug,
  Puzzle,
  UserRound,
  Volume2,
  Wrench,
  Terminal,
} from "lucide-react";

export type SettingsScope = "user" | "agent";

export type SettingsSection = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: ComponentType<{ size?: number; className?: string }>;
};

export const SETTINGS_SECTIONS: Record<SettingsScope, readonly SettingsSection[]> = {
  user: [
    { id: "account", label: "Account", description: "Identity, password, sessions, and sign out.", icon: UserRound },
    { id: "appearance", label: "Appearance", description: "Theme and interface preferences.", icon: Palette },
    { id: "chat", label: "Chat", description: "Conversation defaults and behavior.", icon: MessageCircle },
    { id: "prompt-commands", label: "Prompt Commands", description: "Reusable shortcuts for composing user prompts.", icon: Terminal },
    { id: "voice", label: "Voice", description: "Speech, voices, and recording.", icon: Volume2 },
    { id: "notifications", label: "Notifications", description: "Desktop and task notifications.", icon: Bell },
    { id: "keybinds", label: "Keybinds", description: "Keyboard shortcuts.", icon: Keyboard },
    { id: "about", label: "About", description: "Version, build, and system information.", icon: Info },
  ],
  agent: [
    { id: "models", label: "Models", description: "Providers, models, and runtime defaults.", icon: Cpu },
    { id: "tools", label: "Tools", description: "Global capability catalog.", icon: Wrench },
    { id: "skills", label: "Skills", description: "Installed agent skills.", icon: Puzzle },
    { id: "plugins", label: "Plugins", description: "Installed extensions and permissions.", icon: Plug },
    { id: "memory", label: "Memory", description: "Memory providers and retrieval behavior.", icon: Brain },
  ],
};

export function settingsSection(scope: SettingsScope, id: string): SettingsSection | undefined {
  return SETTINGS_SECTIONS[scope].find(section => section.id === id);
}
