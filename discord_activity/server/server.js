import express from "express"
import dotenv from "dotenv"
import crypto from "crypto"

dotenv.config({ path: "../.env" })

const app = express()
const port = Number(process.env.PORT || 3001)

app.use(express.json({ limit: "1mb" }))

function nowIso() { return new Date().toISOString() }
function s(v) { return (v === undefined || v === null) ? "" : String(v) }

function looksSecretKey(k) {
  const t = String(k).toLowerCase()
  return t.includes("secret") || t.includes("token") || t.includes("password") || t.includes("key")
}

function redactValue(v) {
  const x = s(v)
  if (!x) return { present: false, len: 0, last4: "" }
  return { present: true, len: x.length, last4: x.slice(-4) }
}
import zlib from "zlib";

// --- CRC32 minimal ---
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// pixelsIndex: Uint8Array (w*h) contenant des colorId
function encodePngFromIndexed(w, h, pixelsIndex, paletteHex) {
  // PNG signature
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // raw image data: each row starts with filter byte 0
  const stride = 1 + w * 4;
  const raw = Buffer.alloc(stride * h);

  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter type 0
    for (let x = 0; x < w; x++) {
      const idx = pixelsIndex[y * w + x] ?? 1;
      const col = paletteHex[idx] ?? "#ffffff";
      const { r, g, b } = hexToRgb(col);
      const o = y * stride + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }

  const idatData = zlib.deflateSync(raw, { level: 6 });
  const chunks = [
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idatData),
    pngChunk("IEND", Buffer.alloc(0)),
  ];

  return Buffer.concat([sig, ...chunks]);
}

function dumpEnvSnapshot() {
  const keys = Object.keys(process.env).sort()
  const out = {}
  for (const k of keys) {
    const v = process.env[k]
    out[k] = looksSecretKey(k) ? redactValue(v) : s(v)
  }
  return out
}

function headerFirst(req, name) {
  const v = req.headers[name]
  if (Array.isArray(v)) return v[0] ? String(v[0]) : ""
  return v ? String(v) : ""
}

function log(obj) {
  //console.log(JSON.stringify({ t: nowIso(), ...obj }))
}

function getClientId() {
  return s(process.env.DISCORD_CLIENT_ID || process.env.VITE_DISCORD_CLIENT_ID || "").trim()
}

function getClientSecret() {
  return s(process.env.DISCORD_CLIENT_SECRET || "").trim()
}

function getOriginEnv() {
  return s(process.env.ORIGIN || "").trim()
}

function parseOriginLike(v) {
  const x = s(v).trim()
  if (!x) return ""
  try {
    const u = new URL(x)
    if (!u.protocol.startsWith("http")) return ""
    return `${u.protocol}//${u.host}`
  } catch {
    return ""
  }
}

function publicBaseFromHeaders(req) {
  const origin = parseOriginLike(headerFirst(req, "origin"))
  if (origin) return origin

  const referer = headerFirst(req, "referer")
  if (referer) {
    try {
      const u = new URL(referer)
      if (u.protocol.startsWith("http")) return `${u.protocol}//${u.host}`
    } catch {}
  }

  const xfProto = headerFirst(req, "x-forwarded-proto")
  const xfHost = headerFirst(req, "x-forwarded-host")
  if (xfProto && xfHost) return `${xfProto}://${xfHost}`

  return ""
}

function chooseFrontendBase(req) {
  const envOrigin = getOriginEnv()
  if (envOrigin) return envOrigin
  const hdr = publicBaseFromHeaders(req)
  if (hdr) return hdr
  return "http://localhost:5173"
}

function parseCookies(req) {
  const raw = headerFirst(req, "cookie")
  const out = {}
  if (!raw) return out
  const parts = raw.split(";")
  for (const p of parts) {
    const idx = p.indexOf("=")
    if (idx === -1) continue
    const k = p.slice(0, idx).trim()
    const v = p.slice(idx + 1).trim()
    out[k] = decodeURIComponent(v)
  }
  return out
}

function setCookie(res, name, value, opts = {}) {
  const parts = []
  parts.push(`${name}=${encodeURIComponent(value)}`)
  parts.push(`Path=${opts.path || "/"}`)
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`)
  if (opts.httpOnly) parts.push("HttpOnly")
  if (opts.secure) parts.push("Secure")
  parts.push(`SameSite=${opts.sameSite || "Lax"}`)
  res.append("Set-Cookie", parts.join("; "))
}

function clearCookie(res, name) {
  res.append("Set-Cookie", `${name}=; Path=/; Max-Age=0; SameSite=Lax`)
}

function b64urlEncode(buf) {
  return Buffer.from(buf).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function b64urlDecode(str) {
  const s2 = String(str).replaceAll("-", "+").replaceAll("_", "/")
  const pad = s2.length % 4 === 2 ? "==" : s2.length % 4 === 3 ? "=" : s2.length % 4 === 1 ? "===" : ""
  return Buffer.from(s2 + pad, "base64")
}

function sign(payload) {
  const secret = s(process.env.SESSION_SECRET || "").trim()
  if (!secret) return ""
  const h = crypto.createHmac("sha256", secret).update(payload).digest()
  return b64urlEncode(h)
}

function makeSignedToken(obj) {
  const payload = b64urlEncode(Buffer.from(JSON.stringify(obj)))
  const sig = sign(payload)
  return `${payload}.${sig}`
}

function readSignedToken(token) {
  const t = s(token)
  const idx = t.lastIndexOf(".")
  if (idx === -1) return null
  const payload = t.slice(0, idx)
  const sig = t.slice(idx + 1)
  const expected = sign(payload)
  if (!expected || sig !== expected) return null
  try {
    const json = b64urlDecode(payload).toString("utf8")
    return JSON.parse(json)
  } catch {
    return null
  }
}
const ADMIN_ID = "709708523763925046" // <-- replace with your Discord user ID for admin access

const session = {
  status: "running",
  startedAt: Date.now(),
  updatedAt: Date.now(),
}

function isAdminReq(req) {
  const uidHeader = String(req.get("x-user-id") || "").trim()

  const cookies = parseCookies(req)
  const tok = String(cookies.web_user || "").trim()
  const parsed = tok ? readSignedToken(tok) : null

  console.log("isAdminReq:", {
    path: req.path,
    uidHeader,
    cookieUserId: parsed?.user?.id || null,
  })

  if (parsed?.user?.id === ADMIN_ID) return true
  if (uidHeader === ADMIN_ID) return true
  return false
}



function requireAdmin(req, res) {
  if (!isAdminReq(req)) {
    res.status(403).json({ error: "admin_only" })
    return false
  }
  return true
}

const webStates = new Map()

function createState() {
  return b64urlEncode(crypto.randomBytes(24))
}

app.use((req, res, next) => {
  const start = Date.now()
  log({
    event: "http_in",
    method: req.method,
    path: req.path,
    url: req.originalUrl,
    host: headerFirst(req, "host"),
    origin: headerFirst(req, "origin"),
    referer: headerFirst(req, "referer"),
    x_forwarded_host: headerFirst(req, "x-forwarded-host"),
    x_forwarded_proto: headerFirst(req, "x-forwarded-proto"),
    x_forwarded_for: headerFirst(req, "x-forwarded-for"),
    ua: headerFirst(req, "user-agent")
  })
  res.on("finish", () => {
    log({ event: "http_out", method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start })
  })
  next()
})

log({
  event: "boot",
  port,
  node: process.version,
  cwd: process.cwd(),
  env_snapshot: dumpEnvSnapshot(),
  derived: {
    client_id: getClientId(),
    client_id_len: s(getClientId()).length,
    client_secret: redactValue(getClientSecret()),
    origin_env: getOriginEnv()
  }
})

app.get("/api/debug/env", (req, res) => {
  res.json({
    env_snapshot: dumpEnvSnapshot(),
    derived: {
      client_id: getClientId(),
      client_id_len: s(getClientId()).length,
      client_secret: redactValue(getClientSecret()),
      origin_env: getOriginEnv(),
      public_base_from_headers: publicBaseFromHeaders(req),
      frontend_base_used: chooseFrontendBase(req)
    }
  })
})

app.get("/api/auth/config", (req, res) => {
  const clientId = getClientId()
  log({ event: "auth_config", client_id: clientId, client_id_len: s(clientId).length })
  if (!clientId) return res.status(500).json({ error: "missing_client_id" })
  res.json({ clientId })
})

app.post("/api/token", async (req, res) => {
  try {
    const client_id = getClientId()
    const client_secret = getClientSecret()
    const code = s(req.body?.code).trim()

    log({
      event: "token_request",
      inputs: {
        client_id,
        client_id_len: s(client_id).length,
        client_secret: redactValue(client_secret),
        code_present: Boolean(code),
        code_len: s(code).length
      },
      note: "Activity token exchange (no redirect_uri)"
    })

    if (!client_id) return res.status(500).json({ error: "missing_client_id" })
    if (!client_secret) return res.status(500).json({ error: "missing_client_secret" })
    if (!code) return res.status(400).json({ error: "missing_code" })

    const form = new URLSearchParams({
      client_id,
      client_secret,
      grant_type: "authorization_code",
      code
    })

    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form
    })

    const raw = await response.text().catch(() => "")
    let data = {}
    try { data = raw ? JSON.parse(raw) : {} } catch { data = { raw } }

    log({ event: "token_exchange_response", status: response.status, ok: response.ok, body: data })

    if (!response.ok) {
      return res.status(response.status).json({
        error: "token_exchange_failed",
        status: response.status,
        details: data,
        meta: { client_id }
      })
    }

    if (!data?.access_token) {
      return res.status(500).json({ error: "token_exchange_failed", status: 500, details: data, meta: { client_id } })
    }

    res.json({ access_token: data.access_token })
  } catch (e) {
    log({ event: "token_exchange_exception", message: String(e?.message || e), stack: String(e?.stack || "") })
    res.status(500).json({ error: "server_error", details: String(e?.message || e) })
  }
})

app.get("/api/web/login", (req, res) => {
  const client_id = getClientId()
  if (!client_id) return res.status(500).send("missing_client_id")

  const redirect_uri = "http://localhost:5173/api/web/callback"

  const state = createState()
  const returnToRaw = s(req.query?.returnTo || "/")
  const returnTo = returnToRaw.startsWith("/") ? returnToRaw : "/"

  webStates.set(state, { createdAt: Date.now(), returnTo })

  const u = new URL("https://discord.com/api/oauth2/authorize")
  u.searchParams.set("client_id", client_id)
  u.searchParams.set("redirect_uri", redirect_uri)
  u.searchParams.set("response_type", "code")
  u.searchParams.set("scope", "identify")
  u.searchParams.set("prompt", "consent")
  u.searchParams.set("state", state)

  res.redirect(302, u.toString())
})

app.get("/api/web/callback", async (req, res) => {
  const client_id = getClientId()
  const client_secret = getClientSecret()
  const base = chooseFrontendBase(req)
  const redirect_uri = "http://localhost:5173/api/web/callback"

  const code = s(req.query?.code).trim()
  const state = s(req.query?.state).trim()
  const st = webStates.get(state)

  log({
    event: "web_callback_in",
    code_present: Boolean(code),
    code_len: s(code).length,
    state_present: Boolean(state),
    state_known: Boolean(st),
    redirect_uri,
    base_used: base
  })

  if (!code || !state || !st) {
    return res.status(400).send("invalid_state")
  }

  webStates.delete(state)

  if (!client_id) return res.status(500).send("missing_client_id")
  if (!client_secret) return res.status(500).send("missing_client_secret")

  const form = new URLSearchParams({
    client_id,
    client_secret,
    grant_type: "authorization_code",
    code,
    redirect_uri
  })

  const tokenResp = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form
  })

  const tokenRaw = await tokenResp.text().catch(() => "")
  let tokenData = {}
  try { tokenData = tokenRaw ? JSON.parse(tokenRaw) : {} } catch { tokenData = { raw: tokenRaw } }

  log({ event: "web_token_exchange", status: tokenResp.status, ok: tokenResp.ok, body: tokenData })

  if (!tokenResp.ok || !tokenData?.access_token) {
    return res.status(401).send("token_exchange_failed")
  }

  const meResp = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  })

  const meRaw = await meResp.text().catch(() => "")
  let me = {}
  try { me = meRaw ? JSON.parse(meRaw) : {} } catch { me = { raw: meRaw } }

  log({ event: "web_me_fetch", status: meResp.status, ok: meResp.ok, body: me })

  if (!meResp.ok || !me?.id) {
    return res.status(401).send("me_fetch_failed")
  }

  const user = {
    id: me.id,
    username: me.global_name || me.username || "Unknown",
    avatar: me.avatar || "",
    avatar_url: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : ""
  }

  const signed = makeSignedToken({ v: 1, user, iat: Date.now() })
  setCookie(res, "web_user", signed, { httpOnly: true, secure: base.startsWith("https://"), sameSite: "Lax", path: "/" })

  const userPayload = b64urlEncode(Buffer.from(JSON.stringify(user)))
  const dest = st?.returnTo || "/"
  const join = dest.includes("?") ? "&" : "?"
  res.redirect(302, `${base}${dest}${join}web_user=${encodeURIComponent(userPayload)}`)
})

app.post("/api/web/logout", (req, res) => {
  clearCookie(res, "web_user")
  res.json({ ok: true })
})

app.get("/api/web/me", (req, res) => {
  const cookies = parseCookies(req)
  const tok = s(cookies.web_user).trim()
  const parsed = tok ? readSignedToken(tok) : null
  if (!parsed?.user?.id) return res.status(401).json({ error: "not_authenticated" })
  res.json({ user: parsed.user })
})

const BOARD_W = 100
const BOARD_H = 100
const COLORS = 16
const COOLDOWN_MS = 10000
const DEFAULT_COLOR = 1

const board = { w: BOARD_W, h: BOARD_H, colors: COLORS, cooldownMs: COOLDOWN_MS, pixels: new Uint8Array(BOARD_W * BOARD_H) }
board.pixels.fill(DEFAULT_COLOR)

const lastPlaceByKey = new Map()

function clampInt(n, a, b) {
  const x = Number(n)
  if (!Number.isFinite(x)) return null
  const i = Math.trunc(x)
  if (i < a || i > b) return null
  return i
}

function clientKey(req) {
  const xff = headerFirst(req, "x-forwarded-for")
  const ip = xff ? String(xff).split(",")[0].trim() : (req.socket.remoteAddress || "unknown")
  return ip || "unknown"
}

app.get("/api/board", (req, res) => {
  res.json({ w: board.w, h: board.h, colors: board.colors, cooldownMs: board.cooldownMs, pixels: Array.from(board.pixels) })
})
app.get("/api/session", (req, res) => {
  res.json({
    status: session.status,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
  });
});

app.post("/api/session/start", (req, res) => {
  if (!requireAdmin(req, res)) return;
  session.status = "running";
  session.updatedAt = Date.now();
  res.json({ ok: true, status: session.status });
});

app.post("/api/session/pause", (req, res) => {
  if (!requireAdmin(req, res)) return;
  session.status = "paused";
  session.updatedAt = Date.now();
  res.json({ ok: true, status: session.status });
});

app.post("/api/session/reset", (req, res) => {
  if (!requireAdmin(req, res)) return
  board.pixels.fill(DEFAULT_COLOR)
  lastPlaceByKey.clear()
  session.updatedAt = Date.now()
  res.json({ ok: true })
})

app.post("/api/snapshot", (req, res) => {
  if (!requireAdmin(req, res)) return

  const palette = [
    "#000000","#ffffff","#ff0000","#00ff00","#0000ff","#ffff00","#ff00ff","#00ffff",
    "#888888","#ff8800","#8844ff","#44ff88","#ff4444","#4444ff","#222222","#cccccc",
  ]

  const png = encodePngFromIndexed(board.w, board.h, board.pixels, palette)
  const b64 = png.toString("base64")

  res.json({
    ok: true,
    mime: "image/png",
    dataUrl: `data:image/png;base64,${b64}`,
    w: board.w,
    h: board.h,
    createdAt: Date.now(),
  })
})

app.get("/api/user/isAdmin", (req, res) => {
  const isAdmin = isAdminReq(req)
  console.log("GET /api/user/isAdmin ->", isAdmin)
  res.json({ isAdmin })
})

app.post("/api/pixel", (req, res) => {
  if (session.status === "paused") {
    return res.status(423).json({ error: "session_paused" })
  }
  const x = clampInt(req.body?.x, 0, board.w - 1)
  const y = clampInt(req.body?.y, 0, board.h - 1)
  const color = clampInt(req.body?.color, 0, board.colors - 1)
  if (x === null || y === null || color === null) return res.status(400).json({ error: "bad_request" })

  const key = clientKey(req)
  const now = Date.now()
  const last = lastPlaceByKey.get(key) || 0
  const wait = board.cooldownMs - (now - last)
  if (wait > 0) return res.status(429).json({ error: "cooldown", retryAfterMs: wait })

  board.pixels[y * board.w + x] = color
  lastPlaceByKey.set(key, now)
  res.json({ ok: true })
})

app.listen(port, () => log({ event: "listening", port }))
