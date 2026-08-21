import type { SubpolarPromptCommand } from '@/lib/subpolar-api'

export function promptCommandOptions(draft: string, commands: readonly SubpolarPromptCommand[]): readonly SubpolarPromptCommand[] {
  const match = /^\/([a-z0-9_-]*)$/i.exec(draft)
  if (match === null) return []
  const query = match[1]!.toLowerCase()
  return commands.filter(command => command.enabled && command.name.startsWith(query))
}
