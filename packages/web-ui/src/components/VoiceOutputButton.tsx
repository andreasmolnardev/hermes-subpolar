import { useCallback, useEffect, useRef, useState } from 'react'
import { LoaderCircle, Volume2 } from 'lucide-react'
import { synthesizeVoice, type SubpolarVoiceSettings } from '@/lib/subpolar-api'

export function VoiceOutputButton({ text, settings, ready }: { text: string; settings: SubpolarVoiceSettings['tts']; ready: boolean }) {
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const speak = useCallback(async () => {
    if (!settings.configured || !text.trim()) return
    setError(null)
    setSpeaking(true)
    try {
      const blob = await synthesizeVoice(text)
      if (urlRef.current !== null) URL.revokeObjectURL(urlRef.current)
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => setSpeaking(false)
      audio.onerror = () => {
        setSpeaking(false)
        setError('Could not play the response.')
      }
      await audio.play()
    } catch {
      setSpeaking(false)
      setError('Could not read the response aloud.')
    }
  }, [settings.configured, text])

  useEffect(() => {
    if (settings.autoPlay && ready) void speak()
  }, [ready, settings.autoPlay, speak])

  useEffect(() => () => {
    audioRef.current?.pause()
    if (urlRef.current !== null) URL.revokeObjectURL(urlRef.current)
  }, [])

  if (!settings.configured) return null
  return (
    <span className="mt-2 flex items-center gap-2">
      <button type="button" aria-label="Read response aloud" onClick={() => void speak()} disabled={speaking} className="inline-flex items-center gap-1 text-xs opacity-70 hover:opacity-100 disabled:opacity-40">
        {speaking ? <LoaderCircle className="animate-spin" size={13} /> : <Volume2 size={13} />}
        {speaking ? 'Reading' : 'Read aloud'}
      </button>
      {error !== null && <span role="alert" className="text-xs text-red-300">{error}</span>}
    </span>
  )
}
