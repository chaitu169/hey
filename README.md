# hey

**Text that vanishes** — peer-to-peer text chat. No accounts, no message storage. Close the tab and the thread is gone.

## Run locally

```bash
npm install
npm run dev
```

Open the URL in two browser tabs: **Start a chat** in one, **Join with code** in the other.

Production (serves `dist/` + signaling API):

```bash
npm run build
npm start
```

## How users connect

1. **Host** taps **Start a chat** → gets a **6-digit code**.
2. **Guest** enters that code → both sides auto-handshake.
3. Messages flow over a WebRTC **data channel** (peer-to-peer).

### Signaling (not chat)

A 6-digit code cannot carry a WebRTC offer — it only points at a short-lived room on a **tiny relay** (`server/signaling.mjs`). That process holds SDP offer/answer blobs in memory for ~15 minutes, then deletes them. **Message text never touches the server.**

Deploy `npm run build` + `npm start` on any small host (Fly, Railway, a $5 VPS). Static-only hosting alone cannot do short codes.

### After connect

- Payloads: `{ t: 'chat', body, at }` on the data channel only.
- State lives in the tab — no `localStorage` or chat DB.
- **STUN**: `stun:stun.l.google.com:19302`. Strict networks may need TURN (not in v1).

## Stack

- Vite + React + TypeScript
- `RTCPeerConnection` + `RTCDataChannel`
- Minimal Node signaling for 6-digit codes

## License

MIT
