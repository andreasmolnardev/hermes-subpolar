import { useRef, type KeyboardEvent } from 'react'
import type { SubpolarPromptCommand } from '@/lib/subpolar-api'
import { promptCommandOptions } from '@/lib/prompt-command-options'

export function PromptCommandComposer({
  draft,
  setDraft,
  commands,
  disabled,
  onSubmit,
  className = ''
}: {
  draft: string
  setDraft: (value: string) => void
  commands: readonly SubpolarPromptCommand[]
  disabled: boolean
  onSubmit: () => void
  className?: string
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const options = promptCommandOptions(draft, commands)

  function selectCommand(command: SubpolarPromptCommand) {
    setDraft(command.prompt)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const end = textareaRef.current?.value.length ?? 0
      textareaRef.current?.setSelectionRange(end, end)
    })
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className={className}>
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={keyDown}
        disabled={disabled}
        rows={3}
        placeholder="Ask for follow-up changes or attach images"
        className="min-h-20 w-full resize-none bg-transparent px-1 py-1 text-sm outline-none placeholder:text-[var(--color-muted-foreground,var(--midground-base))]"
      />
      {options.length > 0 && <div role="listbox" aria-label="Prompt Commands" className="mb-2 max-h-44 overflow-y-auto rounded-lg border border-white/10 bg-[#091d1e] p-1">{options.map(command => <button type="button" role="option" key={command.id} onMouseDown={event => event.preventDefault()} onClick={() => selectCommand(command)} className="block w-full rounded px-3 py-2 text-left hover:bg-[#1d4142]"><span className="font-medium">/{command.name}</span><span className="ml-3 text-xs text-[#829b92]">{command.description}</span></button>)}</div>}
    </div>
  )
}
