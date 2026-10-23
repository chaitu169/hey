import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { inviteLink, readInviteFromLocation } from './lib/signal'
import { WispSession, type SessionPhase } from './lib/session'

type Screen = 'home' | 'host' | 'join' | 'chat'

type ChatLine = {
  id: string
  body: string
  at: number
  mine: boolean
}

function phaseLabel(phase: SessionPhase): string {
  switch (phase) {
    case 'signaling':
      return 'Waiting for handshake…'
    case 'connecting':
      return 'Connecting…'
    case 'open':
      return 'Connected — nothing is saved'
    case 'failed':
      return 'Connection failed'
    case 'closed':
      return 'Session ended'
    default:
      return ''
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [phase, setPhase] = useState<SessionPhase>('new')
  const [inviteToken, setInviteToken] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [pasteInvite, setPasteInvite] = useState('')
  const [pasteAnswer, setPasteAnswer] = useState('')
  const [answerToken, setAnswerToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<ChatLine[]>([])
  const [draft, setDraft] = useState('')

  const sessionRef = useRef<WispSession | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const handlers = useCallback(
    () => ({
      onPhase: (p: SessionPhase) => {
        setPhase(p)
        if (p === 'open') setScreen('chat')
      },
      onMessage: (body: string, at: number) => {
        setLines((prev) => [
          ...prev,
          { id: crypto.randomUUID(), body, at, mine: false },
        ])
      },
    }),
    [],
  )

  useEffect(() => {
    const fromUrl = readInviteFromLocation()
    if (fromUrl) {
      setPasteInvite(fromUrl)
      setScreen('join')
    }
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [lines])

  useEffect(() => {
    const onUnload = () => sessionRef.current?.close()
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      sessionRef.current?.close()
    }
  }, [])

  const reset = () => {
    sessionRef.current?.close()
    sessionRef.current = null
    setScreen('home')
    setPhase('new')
    setInviteToken('')
    setInviteUrl('')
    setPasteInvite('')
    setPasteAnswer('')
    setAnswerToken('')
    setError(null)
    setLines([])
    setDraft('')
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname)
    }
  }

  const startHost = async () => {
    setError(null)
    try {
      const { session, inviteToken: token } = await WispSession.startHost(handlers())
      sessionRef.current = session
      setInviteToken(token)
      setInviteUrl(inviteLink(token))
      setScreen('host')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start session.')
    }
  }

  const completeHost = async () => {
    if (!sessionRef.current || !pasteAnswer.trim()) return
    setError(null)
    try {
      await sessionRef.current.applyAnswer(pasteAnswer.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid answer code.')
    }
  }

  const joinAsGuest = async () => {
    if (!pasteInvite.trim()) return
    setError(null)
    try {
      const { session, answerToken: ans } = await WispSession.joinGuest(
        pasteInvite.trim(),
        handlers(),
      )
      sessionRef.current = session
      setAnswerToken(ans)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join.')
    }
  }

  const send = () => {
    const text = draft.trim()
    if (!text || !sessionRef.current) return
    sessionRef.current.send(text)
    setLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), body: text, at: Date.now(), mine: true },
    ])
    setDraft('')
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      /* clipboard may be blocked */
    }
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden>◇</span>
          <div>
            <h1>hush</h1>
            <p>Text that vanishes</p>
          </div>
        </div>
        {screen !== 'home' && (
          <button type="button" className="ghost" onClick={reset}>
            Leave
          </button>
        )}
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {phaseLabel(phase) && screen !== 'home' && (
        <p className="phase">{phaseLabel(phase)}</p>
      )}

      {screen === 'home' && (
        <main className="panel home">
          <p className="lede">
            Peer-to-peer text chat. No server, no accounts, no history — refresh and it&apos;s gone.
          </p>
          <div className="actions">
            <button type="button" className="primary" onClick={startHost}>
              Start a chat
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setScreen('join')
                setError(null)
              }}
            >
              Join with invite
            </button>
          </div>
        </main>
      )}

      {screen === 'host' && (
        <main className="panel stack">
          <section>
            <h2>1 — Send this link</h2>
            <p className="hint">Your friend opens it in their browser. Nothing is stored on a server.</p>
            <textarea readOnly value={inviteUrl} rows={3} />
            <div className="row">
              <button type="button" onClick={() => copy(inviteUrl)}>Copy link</button>
              <button type="button" onClick={() => copy(inviteToken)}>Copy invite code</button>
            </div>
          </section>
          <section>
            <h2>2 — Paste their answer</h2>
            <p className="hint">After they join, they get a code — paste it here to connect.</p>
            <textarea
              value={pasteAnswer}
              onChange={(e) => setPasteAnswer(e.target.value)}
              placeholder="Answer code…"
              rows={4}
            />
            <button type="button" className="primary" onClick={completeHost}>
              Connect
            </button>
          </section>
        </main>
      )}

      {screen === 'join' && !answerToken && (
        <main className="panel stack">
          <section>
              <h2>Join hush</h2>
            <p className="hint">Paste the invite link or code from your friend.</p>
            <textarea
              value={pasteInvite}
              onChange={(e) => setPasteInvite(e.target.value)}
              placeholder="Invite link or code…"
              rows={4}
            />
            <button type="button" className="primary" onClick={joinAsGuest}>
              Join
            </button>
          </section>
        </main>
      )}

      {screen === 'join' && answerToken && phase !== 'open' && (
        <main className="panel stack">
          <section>
            <h2>Send this back to your friend</h2>
            <p className="hint">Copy the code — they paste it to finish connecting.</p>
            <textarea readOnly value={answerToken} rows={4} />
            <button type="button" onClick={() => copy(answerToken)}>Copy answer code</button>
          </section>
        </main>
      )}

      {screen === 'chat' && (
        <main className="chat">
          <div className="messages" ref={listRef}>
            {lines.length === 0 && (
              <p className="empty">Say hi. This thread exists only in this tab.</p>
            )}
            {lines.map((line) => (
              <div key={line.id} className={`bubble ${line.mine ? 'mine' : 'theirs'}`}>
                {line.body}
              </div>
            ))}
          </div>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message…"
              autoComplete="off"
              maxLength={4000}
            />
            <button type="submit" className="primary">Send</button>
          </form>
        </main>
      )}

      <footer className="foot">
        WebRTC text only · No backend · Close the tab to disappear
      </footer>
    </div>
  )
}
