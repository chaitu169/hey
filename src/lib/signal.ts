import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

export type SignalBundle = {
  v: 1
  kind: 'offer' | 'answer'
  sdp: string
}

export function encodeSignal(bundle: SignalBundle): string {
  return compressToEncodedURIComponent(JSON.stringify(bundle))
}

export function decodeSignal(token: string): SignalBundle {
  const trimmed = token.trim().replace(/^#join=/, '').replace(/^join=/, '')
  const json = decompressFromEncodedURIComponent(trimmed)
  if (!json) {
    throw new Error('Invalid invite code — could not decode.')
  }
  const bundle = JSON.parse(json) as SignalBundle
  if (bundle.v !== 1 || !bundle.sdp || (bundle.kind !== 'offer' && bundle.kind !== 'answer')) {
    throw new Error('Unsupported invite format.')
  }
  return bundle
}

export function inviteLink(token: string): string {
  const base = `${window.location.origin}${window.location.pathname}`
  return `${base}#join=${token}`
}

export function readInviteFromLocation(): string | null {
  const hash = window.location.hash
  if (hash.startsWith('#join=')) {
    return hash.slice('#join='.length)
  }
  return null
}
