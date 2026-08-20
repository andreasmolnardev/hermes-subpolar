import type { SubpolarSkill } from '@/lib/subpolar-api'

export function AgentSkillPicker({
  skills,
  assignedIds,
  onChange
}: {
  skills: readonly SubpolarSkill[]
  assignedIds: readonly string[]
  onChange: (skillIds: readonly string[]) => void
}) {
  const assigned = new Set(assignedIds)
  return (
    <section className="rounded-xl border border-white/10 bg-[#102627] p-5">
      <h2 className="mb-2 text-xs uppercase tracking-widest text-[#70d7cc]">Skills</h2>
      <p className="mb-4 text-xs text-[#829b92]">Assigned enabled Skills augment this Agent at runtime. Disabled Skills remain assigned but are inactive.</p>
      <div className="grid gap-2">
        {skills.map(skill => {
          const isAssigned = assigned.has(skill.id)
          return <label key={skill.id} className={`flex items-start gap-3 rounded-lg border border-white/10 p-3 ${skill.enabled ? '' : 'opacity-60'}`}><input aria-label={skill.name} type="checkbox" checked={isAssigned} onChange={event => onChange(event.target.checked ? [...assignedIds, skill.id] : assignedIds.filter(id => id !== skill.id))} /><span><span className="block text-sm">{skill.name} {!skill.enabled && <span className="text-xs text-[#829b92]">(Disabled)</span>}</span><span className="mt-1 block text-xs text-[#829b92]">{skill.description || 'No description'}</span></span></label>
        })}
      </div>
      {skills.length === 0 && <p className="rounded-lg border border-dashed border-white/15 p-3 text-sm text-[#829b92]">Create Skills in Agent Settings → Skills.</p>}
    </section>
  )
}
