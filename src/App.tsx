import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import {
  isValidJoinCode,
  normalizeJoinCode,
  relayCreateRoom,
  relayFetchOffer,
  relayPostAnswer,
  relayWaitForAnswer,
} from './lib/relay'
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
      return 'Setting up…'
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
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<ChatLine[]>([])
  const [draft, setDraft] = useState('')
  const [waitingForGuest, setWaitingForGuest] = useState(false)
  const [joining, setJoining] = useState(false)

  const sessionRef = useRef<WispSession | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const handlers = useCallback(
    () => ({
      onPhase: (p: SessionPhase) => {
        setPhase(p)
        if (p === 'open') {
          setWaitingForGuest(false)
          setScreen('chat')
        }
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
    setRoomCode('')
    setJoinCode('')
    setError(null)
    setLines([])
    setDraft('')
    setWaitingForGuest(false)
    setJoining(false)
  }

  const startHost = async () => {
    setError(null)
    setWaitingForGuest(true)
    setScreen('host')
    let code = ''
    try {
      const { session, offerSdp } = await WispSession.startHost(handlers())
      sessionRef.current = session
      code = await relayCreateRoom(offerSdp)
      setRoomCode(code)
      const answerSdp = await relayWaitForAnswer(code)
      await session.applyAnswerSdp(answerSdp)
    } catch (e) {
      setWaitingForGuest(false)
      sessionRef.current?.close()
      sessionRef.current = null
      setError(e instanceof Error ? e.message : 'Could not start session.')
      setScreen(code ? 'host' : 'home')
    }
  }

  const joinWithCode = async () => {
    const code = normalizeJoinCode(joinCode)
    if (!isValidJoinCode(code)) {
      setError('Enter the 6-digit code from your friend.')
      return
    }
    setError(null)
    setJoining(true)
    try {
      const offerSdp = await relayFetchOffer(code)
      const { session, answerSdp } = await WispSession.joinGuestWithOffer(
        offerSdp,
        handlers(),
      )
      sessionRef.current = session
      await relayPostAnswer(code, answerSdp)
    } catch (e) {
      setJoining(false)
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

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      /* clipboard may be blocked */
    }
  }

  const joinDigits = normalizeJoinCode(joinCode)

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden>◇</span>
          <div>
            <h1>hey</h1>
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
            Peer-to-peer text chat. Share a 6-digit code, talk, then close the tab — nothing is saved.
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
                setJoining(false)
                setError(null)
              }}
            >
              Join with code
            </button>
          </div>
        </main>
      )}

      {screen === 'host' && (
        <main className="panel stack">
          <section className="code-card">
            <h2>Your code</h2>
            <p className="hint">Tell your friend this number. It expires in about 15 minutes.</p>
            <p className="room-code" aria-label={`Room code ${roomCode}`}>
              {roomCode || '······'}
            </p>
            {roomCode && (
              <button type="button" onClick={() => copyCode(roomCode)}>Copy code</button>
            )}
            {waitingForGuest && (
              <p className="hint wait">Waiting for them to enter the code…</p>
            )}
          </section>
        </main>
      )}

      {screen === 'join' && phase !== 'open' && (
        <main className="panel stack">
          {joining ? (
            <section>
              <h2>Joining…</h2>
              <p className="hint">Connecting peer-to-peer. This usually takes a few seconds.</p>
            </section>
          ) : (
            <section>
              <h2>Join hey</h2>
              <p className="hint">Enter the 6-digit code your friend gave you.</p>
              <input
                className="code-input"
                value={joinDigits}
                onChange={(e) => setJoinCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
              />
              <button type="button" className="primary" onClick={joinWithCode}>
                Join
              </button>
            </section>
          )}
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
        WebRTC text only · Messages stay peer-to-peer · Close the tab to disappear
      </footer>
    </div>
  )
}
