import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Mic, Square } from 'lucide-react'
import { transcribeVoice } from '@/lib/subpolar-api'

export type VoiceInputState = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'error'

export function VoiceInputButton({ draft, setDraft, disabled, configured = true }: { draft: string; setDraft: (value: string) => void; disabled: boolean; configured?: boolean }) {
  const [state, setState] = useState<VoiceInputState>('idle')
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  function releaseStream() {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }

  useEffect(() => () => {
    recorderRef.current?.stop()
    releaseStream()
  }, [])

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not supported in this browser.')
      setState('error')
      return
    }
    setError(null)
    setState('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        releaseStream()
        const chunks = chunksRef.current
        chunksRef.current = []
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        setState('transcribing')
        void transcribeVoice(blob)
          .then(result => {
            if (result.text.trim()) setDraft(draft.trim() ? `${draft.trim()} ${result.text.trim()}` : result.text.trim())
            setState('idle')
          })
          .catch(() => {
            setError('Could not transcribe the recording.')
            setState('error')
          })
      }
      recorder.start()
      setState('recording')
    } catch {
      releaseStream()
      setError('Microphone permission was not granted.')
      setState('error')
    }
  }

  function stop() {
    recorderRef.current?.stop()
    recorderRef.current = null
  }

  const recording = state === 'recording'
  const busy = state === 'requesting' || state === 'transcribing'
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={!configured ? 'Configure speech-to-text in Voice settings' : recording ? 'Stop recording' : busy ? 'Transcribing recording' : 'Record voice message'}
        aria-pressed={recording}
        title={!configured ? 'Configure speech-to-text in User Settings → Voice' : recording ? 'Stop recording' : 'Record voice message'}
        onClick={() => (recording ? stop() : void start())}
        disabled={!configured || disabled || busy}
        className={`rounded-full p-2.5 ${recording ? 'bg-red-500 text-white' : 'text-[var(--color-muted-foreground,var(--midground-base))] hover:bg-white/10'} disabled:opacity-40`}
      >
        {busy ? <LoaderCircle className="animate-spin" size={16} /> : recording ? <Square size={16} /> : <Mic size={16} />}
      </button>
      {state === 'error' && <span role="alert" className="text-xs text-red-300">{error}</span>}
    </div>
  )
}
