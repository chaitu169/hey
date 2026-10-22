/**
 * Ephemeral WebRTC signaling only — stores SDP handshakes by 6-digit code.
 * Chat payloads never hit this process.
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..')
const DIST = join(ROOT, 'dist')
const PORT = Number(process.env.PORT) || 8787
const ROOM_TTL_MS = 15 * 60 * 1000
/** @type {Map<string, { offerSdp: string, answerSdp?: string, createdAt: number }>} */
const rooms = new Map()

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function purgeExpired() {
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL_MS) rooms.delete(code)
  }
}

function randomCode() {
  for (let i = 0; i < 40; i++) {
    const code = String(Math.floor(100_000 + Math.random() * 900_000))
    if (!rooms.has(code)) return code
  }
  throw new Error('No room codes available')
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

function serveStatic(req, res) {
  if (!existsSync(DIST)) {
    res.writeHead(404)
    res.end('Build the app first: npm run build')
    return
  }
  let path = req.url === '/' ? '/index.html' : req.url.split('?')[0]
  const file = join(DIST, path)
  if (!file.startsWith(DIST)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  if (!existsSync(file) || extname(file) === '') {
    const fallback = join(DIST, 'index.html')
    if (existsSync(fallback)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(readFileSync(fallback))
      return
    }
    res.writeHead(404)
    res.end('Not found')
    return
  }
  const ext = extname(file)
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
}

const server = createServer(async (req, res) => {
  purgeExpired()
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

  if (url.pathname === '/api/health' && req.method === 'GET') {
    json(res, 200, { ok: true })
    return
  }

  if (url.pathname === '/api/rooms' && req.method === 'POST') {
    try {
      const raw = await readBody(req)
      const { sdp } = JSON.parse(raw)
      if (typeof sdp !== 'string' || sdp.length < 20) {
        json(res, 400, { error: 'Invalid offer.' })
        return
      }
      const code = randomCode()
      rooms.set(code, { offerSdp: sdp, createdAt: Date.now() })
      json(res, 201, { code })
    } catch {
      json(res, 400, { error: 'Bad request.' })
    }
    return
  }

  const roomMatch = url.pathname.match(/^\/api\/rooms\/(\d{6})$/)
  if (roomMatch && req.method === 'GET') {
    const code = roomMatch[1]
    const room = rooms.get(code)
    if (!room) {
      json(res, 404, { error: 'Code not found or expired.' })
      return
    }
    json(res, 200, {
      sdp: room.offerSdp,
      answer: room.answerSdp ?? null,
    })
    return
  }

  const answerMatch = url.pathname.match(/^\/api\/rooms\/(\d{6})\/answer$/)
  if (answerMatch && req.method === 'POST') {
    const code = answerMatch[1]
    const room = rooms.get(code)
    if (!room) {
      json(res, 404, { error: 'Code not found or expired.' })
      return
    }
    if (room.answerSdp) {
      json(res, 409, { error: 'This code already has a guest.' })
      return
    }
    try {
      const raw = await readBody(req)
      const { sdp } = JSON.parse(raw)
      if (typeof sdp !== 'string' || sdp.length < 20) {
        json(res, 400, { error: 'Invalid answer.' })
        return
      }
      room.answerSdp = sdp
      json(res, 200, { ok: true })
    } catch {
      json(res, 400, { error: 'Bad request.' })
    }
    return
  }

  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    serveStatic(req, res)
    return
  }

  json(res, 404, { error: 'Not found.' })
})

server.listen(PORT, () => {
  console.log(`hey signaling on http://localhost:${PORT}`)
})
