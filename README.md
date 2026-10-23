# hush

**Text that vanishes** — static, peer-to-peer text chat. No chat backend, no accounts, no message storage.

## Run locally

```bash
npm install
npm run dev
```

Deploy `dist/` to any static host (Vercel, Netlify, GitHub Pages, Cloudflare Pages).

## How users connect

No signaling server. WebRTC needs a one-time exchange of SDP (offer/answer + ICE) **out of band** — link or copy/paste.

1. **Host** starts a session → shares **invite link** or code  
2. **Guest** opens invite → copies **answer** code  
3. **Host** pastes answer → connected  

Messages use a WebRTC **data channel** only. STUN: `stun:stun.l.google.com:19302`.

## Stack

Vite + React + TypeScript · `RTCPeerConnection` + `RTCDataChannel` · `lz-string` for compact invite tokens

## License

MIT
