import { decodeSignal, encodeSignal, type SignalBundle } from './signal'

const ICE: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

export type SessionPhase = 'new' | 'signaling' | 'connecting' | 'open' | 'closed' | 'failed'

export type ChatPayload = {
  t: 'chat'
  body: string
  at: number
}

export type SessionHandlers = {
  onPhase: (phase: SessionPhase) => void
  onMessage: (body: string, at: number) => void
}

async function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return
  await new Promise<void>((resolve) => {
    const done = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', done)
        resolve()
      }
    }
    pc.addEventListener('icegatheringstatechange', done)
    done()
    window.setTimeout(resolve, 8000)
  })
}

function wireDataChannel(
  dc: RTCDataChannel,
  handlers: SessionHandlers,
  onOpen: () => void,
): void {
  dc.binaryType = 'arraybuffer'
  dc.addEventListener('open', () => {
    handlers.onPhase('open')
    onOpen()
  })
  dc.addEventListener('close', () => handlers.onPhase('closed'))
  dc.addEventListener('message', (ev) => {
    try {
      const data = JSON.parse(String(ev.data)) as ChatPayload
      if (data.t === 'chat' && typeof data.body === 'string') {
        handlers.onMessage(data.body, data.at ?? Date.now())
      }
    } catch {
      /* ignore malformed */
    }
  })
}

export class WispSession {
  private pc: RTCPeerConnection
  private dc: RTCDataChannel | null = null
  private handlers: SessionHandlers

  private constructor(pc: RTCPeerConnection, handlers: SessionHandlers) {
    this.pc = pc
    this.handlers = handlers
    pc.addEventListener('connectionstatechange', () => {
      const s = pc.connectionState
      if (s === 'connected') this.handlers.onPhase('connecting')
      if (s === 'failed') this.handlers.onPhase('failed')
      if (s === 'closed') this.handlers.onPhase('closed')
    })
  }

  static async startHost(handlers: SessionHandlers): Promise<{ session: WispSession; inviteToken: string }> {
    const pc = new RTCPeerConnection(ICE)
    const session = new WispSession(pc, handlers)
    handlers.onPhase('signaling')

    const dc = pc.createDataChannel('wisp', { ordered: true })
    session.dc = dc
    wireDataChannel(dc, handlers, () => {})

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitForIceGathering(pc)

    const sdp = pc.localDescription?.sdp
    if (!sdp) throw new Error('Could not build connection offer.')

    const bundle: SignalBundle = { v: 1, kind: 'offer', sdp }
    return { session, inviteToken: encodeSignal(bundle) }
  }

  static async joinGuest(
    inviteToken: string,
    handlers: SessionHandlers,
  ): Promise<{ session: WispSession; answerToken: string }> {
    const offerBundle = decodeSignal(inviteToken)
    if (offerBundle.kind !== 'offer') {
      throw new Error('Expected a host invite, not an answer code.')
    }

    const pc = new RTCPeerConnection(ICE)
    const session = new WispSession(pc, handlers)
    handlers.onPhase('signaling')

    pc.addEventListener('datachannel', (ev) => {
      session.dc = ev.channel
      wireDataChannel(ev.channel, handlers, () => {})
    })

    await pc.setRemoteDescription({ type: 'offer', sdp: offerBundle.sdp })
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await waitForIceGathering(pc)

    const sdp = pc.localDescription?.sdp
    if (!sdp) throw new Error('Could not build connection answer.')

    const bundle: SignalBundle = { v: 1, kind: 'answer', sdp }
    return { session, answerToken: encodeSignal(bundle) }
  }

  async applyAnswer(answerToken: string): Promise<void> {
    const answerBundle = decodeSignal(answerToken)
    if (answerBundle.kind !== 'answer') {
      throw new Error('Expected an answer code from your guest.')
    }
    this.handlers.onPhase('connecting')
    await this.pc.setRemoteDescription({ type: 'answer', sdp: answerBundle.sdp })
  }

  send(text: string): void {
    if (!this.dc || this.dc.readyState !== 'open') return
    const payload: ChatPayload = { t: 'chat', body: text, at: Date.now() }
    this.dc.send(JSON.stringify(payload))
  }

  close(): void {
    this.dc?.close()
    this.pc.close()
    this.handlers.onPhase('closed')
  }
}
