import "./style.css"
import { DiscordSDK } from "@discord/embedded-app-sdk"

console.log("MAIN.JS VERSION = BOARD_V3_RELOAD_GETBOARD_RESET_FULLRELOAD", new Date().toISOString())

const GATEWAY_BASE = "https://1224715390362324992.discordsays.com/gcp"

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function showFatal(err) {
  const msg = (err && (err.stack || err.message)) ? String(err.stack || err.message) : String(err)
  const root = document.querySelector("#app") || document.body
  root.innerHTML = `
    <div class="shell">
      <div class="topbar">
        <div class="brand">
          <div class="badge"></div>
          <div class="brandTitle">r/place viewer</div>
        </div>
      </div>
      <div class="fatal">
        <div class="fatalTitle">Activity crashed</div>
        <pre class="fatalPre">${escapeHtml(msg)}</pre>
      </div>
    </div>
  `
}

window.addEventListener("error", (e) => showFatal(e.error || e.message))
window.addEventListener("unhandledrejection", (e) => showFatal(e.reason))

function isProbablyDiscordActivity() {
  const qp = new URLSearchParams(location.search)
  if (qp.get("frame_id") || qp.get("instance_id")) return true
  if (window?.DiscordNative) return true
  return false
}

function avatarUrl(user) {
  if (!user) return ""
  if (user.avatar_url) return user.avatar_url
  if (user.avatar && user.id) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
  return ""
}

function getDiscordClientIdFromDom() {
  const meta = document.querySelector('meta[name="discord-client-id"]')
  const v = meta?.getAttribute("content")
  return v ? String(v).trim() : ""
}

function getDiscordClientId() {
  const DEFAULT_CLIENT_ID = "1224715390362324992"

  const fromWindow = (window && window.__DISCORD_CLIENT_ID) ? String(window.__DISCORD_CLIENT_ID).trim() : ""
  if (fromWindow) return fromWindow

  const fromEnv = (import.meta && import.meta.env && import.meta.env.VITE_DISCORD_CLIENT_ID != null)
    ? String(import.meta.env.VITE_DISCORD_CLIENT_ID).trim()
    : ""
  if (fromEnv) return fromEnv

  const fromMeta = getDiscordClientIdFromDom()
  if (fromMeta) return fromMeta

  return DEFAULT_CLIENT_ID
}

function setActivityAuth(auth) {
  try { localStorage.setItem("activity_auth", JSON.stringify(auth || {})) } catch { }
}

function getActivityAuth() {
  try {
    const raw = localStorage.getItem("activity_auth")
    if (!raw) return null
    const a = JSON.parse(raw)
    if (!a?.accessToken) return null
    return a
  } catch {
    return null
  }
}

function setActivityUser(u) {
  try { localStorage.setItem("activity_user", JSON.stringify(u || {})) } catch { }
}

function getActivityUser() {
  try {
    const raw = localStorage.getItem("activity_user")
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function makeReqId() {
  try { return crypto.randomUUID() } catch { return String(Date.now()) + "_" + Math.random().toString(16).slice(2) }
}

function hexToIntColor(colorHex) {
  if (typeof colorHex === "number") return Number(colorHex) >>> 0
  const s = String(colorHex || "").trim()
  if (!s) return 0
  if (s.startsWith("#")) return parseInt(s.slice(1), 16) >>> 0
  if (s.startsWith("0x") || s.startsWith("0X")) return parseInt(s.slice(2), 16) >>> 0
  return parseInt(s, 10) >>> 0
}

function nowIso() {
  return new Date().toISOString()
}

function msNow() {
  try { return performance.now() } catch { return Date.now() }
}

function safeJson(o, maxLen = 4000) {
  let s = ""
  try { s = JSON.stringify(o) } catch { s = String(o) }
  if (s.length > maxLen) s = s.slice(0, maxLen) + `…(trunc ${s.length - maxLen})`
  return s
}

function headersToObj(h) {
  const out = {}
  try {
    if (!h) return out
    h.forEach((v, k) => { out[String(k)] = String(v) })
  } catch { }
  return out
}

function parseMaybeJson(text) {
  if (!text) return null
  try { return JSON.parse(text) } catch { return { raw: text } }
}

async function fetchDebug(url, opts, info) {
  const id = makeReqId()
  const started = msNow()
  const u = typeof url === "string" ? url : String(url?.toString?.() ?? url)
  const method = (opts?.method || "GET").toUpperCase()
  const headers = opts?.headers ? (opts.headers instanceof Headers ? headersToObj(opts.headers) : opts.headers) : {}
  const meta = { id, t: nowIso(), kind: info?.kind || "fetch", method, url: u, headers, info: info || null }

  console.groupCollapsed(`[${meta.kind}] -> ${method} ${u}`)
  console.log("meta", meta)

  let res
  let text = ""
  try {
    res = await fetch(url, opts)
    const ended = msNow()
    meta.status = res.status
    meta.ok = res.ok
    meta.ms = Math.round(ended - started)
    meta.resHeaders = headersToObj(res.headers)
    console.log("response_meta", { status: meta.status, ok: meta.ok, ms: meta.ms, headers: meta.resHeaders })

    text = await res.text().catch(() => "")
    meta.bodyLen = text.length
    const preview = text.length > 1200 ? text.slice(0, 1200) + `…(trunc ${text.length - 1200})` : text
    console.log("response_text_preview", preview)

    const parsed = parseMaybeJson(text)
    if (parsed && parsed.raw === undefined) console.log("response_json", parsed)
    console.groupEnd()

    return { id, res, text, data: parsed, meta }
  } catch (err) {
    const ended = msNow()
    meta.ms = Math.round(ended - started)
    meta.error = { message: String(err?.message || err), stack: err?.stack || null }
    console.error("fetch_error", meta)
    console.groupEnd()
    throw err
  }
}

async function exchangeCodeForTokenViaApi(code, state) {
  const res = await fetch(`${GATEWAY_BASE}/oauth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, state }),
  });

  const text = await res.text().catch(() => "");
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!res.ok || !data?.access_token) {
    throw new Error(`token_exchange_failed ${res.status} ${JSON.stringify(data)}`);
  }

  return String(data.access_token);
}

async function loginDiscordActivity() {
  const clientId = getDiscordClientId()
  if (!clientId) throw new Error("missing_client_id")

  const discordSdk = new DiscordSDK(clientId)
  await discordSdk.ready()

  const state = makeReqId();
  try { sessionStorage.setItem("oauth_state", state); } catch {}

  const redirectUri = `https://1224715390362324992.discordsays.com/oauth/callback`

  const { code } = await discordSdk.commands.authorize({
    client_id: clientId,
    response_type: "code",
    state: "",
    prompt: "none",
    redirect_uri: redirectUri,
    scope: ["identify", "guilds.members.read"]
  })

  const access_token = await exchangeCodeForTokenViaApi(code, state)

  const auth = await discordSdk.commands.authenticate({ access_token })
  if (!auth?.user) throw new Error("authenticate_failed")

  const u = {
    id: auth.user.id,
    username: auth.user.global_name || auth.user.username,
    avatar: auth.user.avatar,
    avatar_url: auth.user.avatar ? `https://cdn.discordapp.com/avatars/${auth.user.id}/${auth.user.avatar}.png?size=128` : ""
  }

  const guildId = discordSdk.guildId ? String(discordSdk.guildId) : ""
  const channelId = discordSdk.channelId ? String(discordSdk.channelId) : ""

  setActivityUser(u)
  setActivityAuth({
    accessToken: access_token,
    guildId,
    channelId,
    clientId,
    at: nowIso()
  })

  return u
}

async function getUserForPayload(inDiscord) {
  if (!inDiscord) return null
  const u = getActivityUser()
  if (!u?.id) return null
  return { id: u.id, username: u.username || "", avatar: u.avatar || "" }
}

async function getUserIdForAction(inDiscord) {
  if (!inDiscord) return null
  const u = getActivityUser()
  return u?.id ? String(u.id) : null
}

async function requireAuthForWorker(inDiscord) {
  if (!inDiscord) return { accessToken: null, guildId: null }
  const a = getActivityAuth()
  if (!a?.accessToken) throw new Error("missing_activity_access_token")
  const guildId = a?.guildId ? String(a.guildId) : ""
  return { accessToken: String(a.accessToken), guildId: guildId || null }
}

async function pingBackend(inDiscord) {
  const reqId = makeReqId()
  const user = await getUserForPayload(inDiscord)

  const payload = {
    type: "PING",
    payload: {
      from: "activity",
      at: nowIso(),
      reqId,
      user
    }
  }

  const { res, data, meta } = await fetchDebug(
    `${GATEWAY_BASE}/proxy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    },
    { kind: "proxy_ping", payloadPreview: payload }
  )

  if (!res.ok) throw new Error(`PING failed: ${meta.status} ${safeJson(data)}`)
  return data
}

async function sessionStartBackend(inDiscord) {
  const reqId = makeReqId()
  const userId = await getUserIdForAction(inDiscord)
  const auth = await requireAuthForWorker(inDiscord)

  const payload = {
    type: "SESSION_START",
    payload: {
      from: "activity",
      at: nowIso(),
      reqId,
      userId: userId || null,
      accessToken: auth.accessToken,
      guildId: auth.guildId
    }
  }

  const { res, data, meta } = await fetchDebug(
    `${GATEWAY_BASE}/proxy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    },
    { kind: "proxy_session_start", payloadPreview: payload }
  )

  if (!res.ok) throw new Error(`SESSION_START failed: ${meta.status} ${safeJson(data)}`)
  return data
}

async function sessionPauseBackend(inDiscord) {
  const reqId = makeReqId()
  const userId = await getUserIdForAction(inDiscord)
  const auth = await requireAuthForWorker(inDiscord)

  const payload = {
    type: "SESSION_PAUSE",
    payload: {
      from: "activity",
      at: nowIso(),
      reqId,
      userId: userId || null,
      accessToken: auth.accessToken,
      guildId: auth.guildId
    }
  }

  const { res, data, meta } = await fetchDebug(
    `${GATEWAY_BASE}/proxy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    },
    { kind: "proxy_session_pause", payloadPreview: payload }
  )

  if (!res.ok) throw new Error(`SESSION_PAUSE failed: ${meta.status} ${safeJson(data)}`)
  return data
}

async function resetBoardBackend(inDiscord) {
  const reqId = makeReqId()
  const userId = await getUserIdForAction(inDiscord)
  const auth = await requireAuthForWorker(inDiscord)

  const payload = {
    type: "RESET_BOARD",
    payload: {
      from: "activity",
      at: nowIso(),
      reqId,
      userId,
      accessToken: auth.accessToken,
      guildId: auth.guildId
    }
  }

  const { res, data, meta } = await fetchDebug(
    `${GATEWAY_BASE}/proxy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    },
    { kind: "proxy_reset_board", payloadPreview: payload }
  )

  if (!res.ok) throw new Error(`RESET_BOARD failed: ${meta.status} ${safeJson(data)}`)
  return data
}

async function snapshotBackend(inDiscord, region = null) {
  const reqId = makeReqId()
  const userId = await getUserIdForAction(inDiscord)
  const auth = await requireAuthForWorker(inDiscord)

  const payload = {
    type: "SNAPSHOT_CREATE",
    payload: {
      from: "activity",
      at: nowIso(),
      reqId,
      userId,
      region: region || null,
      accessToken: auth.accessToken,
      guildId: auth.guildId
    }
  }

  const { res, data, meta } = await fetchDebug(
    `${GATEWAY_BASE}/proxy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    },
    { kind: "proxy_snapshot_create", payloadPreview: payload }
  )

  if (!res.ok) throw new Error(`SNAPSHOT_CREATE failed: ${meta.status} ${safeJson(data)}`)
  return data
}

async function placePixelBackend(inDiscord, x, y, colorHexOrInt) {
  const reqId = makeReqId()
  const user = await getUserForPayload(inDiscord)
  const color = hexToIntColor(colorHexOrInt)

  const payload = {
    type: "PLACE_PIXEL",
    payload: {
      from: "activity",
      at: nowIso(),
      reqId,
      userId: user?.id,
      username: user?.username ?? user?.global_name ?? user?.displayName ?? null,
      x,
      y,
      color
    }
  }

  const { res, data, meta } = await fetchDebug(
    `${GATEWAY_BASE}/proxy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    },
    { kind: "proxy_place_pixel", payloadPreview: payload }
  )

  if (!res.ok) throw new Error(`PLACE_PIXEL failed: ${meta.status} ${safeJson(data)}`)
  return data
}

async function resolveUserHashBackend(userHash) {
  const reqId = makeReqId()

  const payload = {
    type: "RESOLVE_USERHASH",
    payload: {
      from: "activity",
      at: nowIso(),
      reqId,
      userHash: String(userHash)
    }
  }

  const { res, data, meta } = await fetchDebug(
    `${GATEWAY_BASE}/proxy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    },
    { kind: "proxy_resolve_userhash", payloadPreview: payload }
  )

  if (!res.ok) throw new Error(`RESOLVE_USERHASH failed: ${meta.status} ${safeJson(data)}`)
  return data
}

async function getBoardBackend(inDiscord, since, limit = 200, pageToken = null, extra = {}) {
  const url = new URL(`${GATEWAY_BASE}/board`)
  if (since != null) url.searchParams.set("since", String(since))
  if (limit != null) url.searchParams.set("limit", String(limit))
  if (pageToken) url.searchParams.set("pageToken", String(pageToken))

  for (const [k, v] of Object.entries(extra || {})) {
    if (v === undefined || v === null) continue
    url.searchParams.set(k, String(v))
  }

  const { res, data, meta } = await fetchDebug(
    url.toString(),
    {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      redirect: "follow"
    },
    { kind: "get_board", inDiscord, since: since ?? null, limit, pageToken: pageToken || null, extra }
  )

  if (!res.ok) throw new Error(`GET_BOARD failed: ${meta.status} ${safeJson(data)}`)
  return data
}

function setUserSlotState(state) {
  const slot = document.getElementById("userSlot")
  if (!slot) return
  slot.innerHTML = ""

  if (state?.type === "user") {
    const user = state.user
    const wrap = document.createElement("div")
    wrap.className = "userSlot"

    const card = document.createElement("div")
    card.className = "userCard"

    const av = document.createElement("img")
    av.className = "userAvatar"
    av.alt = "avatar"
    av.referrerPolicy = "no-referrer"
    av.src = avatarUrl(user)

    const txt = document.createElement("div")
    txt.className = "userText"

    const name = document.createElement("div")
    name.className = "userName"
    name.textContent = user.username || "Unknown"

    const id = document.createElement("div")
    id.className = "userId"
    id.textContent = user.id ? String(user.id) : "-"

    txt.appendChild(name)
    txt.appendChild(id)

    card.appendChild(av)
    card.appendChild(txt)
    wrap.appendChild(card)
    slot.appendChild(wrap)
    return
  }

  if (state?.type === "error") {
    const wrap = document.createElement("div")
    wrap.className = "userSlot"

    const msg = document.createElement("div")
    msg.className = "mini"
    msg.style.opacity = "0.9"
    msg.textContent = "Login failed"

    const b = document.createElement("button")
    b.className = "btn"
    b.textContent = "Retry"
    b.onclick = state.onRetry

    wrap.appendChild(msg)
    wrap.appendChild(b)
    slot.appendChild(wrap)
    return
  }

  const wrap = document.createElement("div")
  wrap.className = "userSlot"

  const msg = document.createElement("div")
  msg.className = "mini"
  msg.style.opacity = "0.9"
  msg.textContent = "Authenticating…"

  wrap.appendChild(msg)
  slot.appendChild(wrap)
}

function b64ToBytes(b64) {
  const bin = atob(String(b64 || ""))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function gunzipBytes(bytes) {
  if (!bytes || !bytes.length) return new Uint8Array(0)
  if (typeof DecompressionStream === "undefined") throw new Error("gzip_not_supported")
  const ds = new DecompressionStream("gzip")
  const stream = new Blob([bytes]).stream().pipeThrough(ds)
  const ab = await new Response(stream).arrayBuffer()
  return new Uint8Array(ab)
}

function guessSquareSize(n) {
  const s = Math.floor(Math.sqrt(Math.max(0, n)))
  if (s * s === n) return s
  return null
}

async function run() {
  const app = document.querySelector("#app")
  if (!app) throw new Error("Missing #app root element")

  app.innerHTML = `
    <div class="shell">
      <div class="topbar">
        <div class="brand">
          <div class="badge"></div>
          <div class="brandTitle">r/place AI ULYSSE viewer</div>
        </div>
        <div id="userSlot"></div>
      </div>

      <div class="mainRow">
        <div class="leftPanel">
          <h3 style="margin:0;">r/place viewer</h3>

          <div class="mini">
            <div>Board: <span id="boardSize"></span></div>
            <div>Zoom: <span id="zoomVal"></span></div>
            <div>Pan: <span id="panVal"></span></div>
            <div>Hover pixel: <span id="hoverVal"></span></div>
            <div>Selected color: <span id="colorVal"></span></div>
            <div>Placed by: <span id="hoverBy"></span></div>
            <div>Discord ID: <span id="hoverId"></span></div>
            <div style="margin-top:6px; opacity:.7;">
              - Molette: zoom<br/>
              - Drag: pan<br/>
              - Click: place pixel
            </div>
          </div>

          <div class="sep"></div>

          <div>
            <div class="mini" style="margin-bottom:6px;">Palette</div>
            <div id="palette" class="palWrap"></div>
          </div>

          <div class="row">
            <button class="btn" id="fit">Fit</button>
            <button class="btn" id="reset">Reset</button>
          </div>

          <div class="row">
            <button class="btn" id="reload">Reload board</button>
            <button class="btn" id="clear">Clear local</button>
            <button class="btn" id="ping-btn" type="button">Ping Backend</button>
            <pre id="ping-output" style="white-space: pre-wrap;"></pre>
          </div>

          <div class="row">
            <button class="btn" id="start">Start</button>
            <button class="btn" id="pause">Pause</button>
            <button class="btn" id="resetSession">Reset</button>
          </div>

          <div class="row">
            <button class="btn" id="snapshot">Take snapshot</button>
          </div>

          <div id="status" class="status"></div>
        </div>

        <div class="canvasWrap">
          <canvas id="cv" width="900" height="600"></canvas>
        </div>
      </div>
    </div>
  `

  const inDiscord = isProbablyDiscordActivity()
  const $ = (id) => document.getElementById(id)
  const logLine = (msg) => { $("status").textContent = msg }

  async function attemptLogin() {
    if (!inDiscord) {
      setUserSlotState({ type: "error", onRetry: attemptLogin })
      logLine("Open inside Discord to authenticate.")
      return
    }

    setUserSlotState({})

    try {
      const cached = getActivityUser()
      const cachedAuth = getActivityAuth()
      if (cached?.id && cachedAuth?.accessToken) {
        setUserSlotState({ type: "user", user: cached })
        return
      }
      const u = await loginDiscordActivity()
      setUserSlotState({ type: "user", user: u })
    } catch (e) {
      logLine(String(e?.message || e))
      setUserSlotState({ type: "error", onRetry: attemptLogin })
    }
  }

  await attemptLogin()

  const palette = [
    "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff",
    "#888888", "#ff8800", "#8844ff", "#44ff88", "#ff4444", "#4444ff", "#222222", "#cccccc"
  ]

  const view = { zoom: 6, panX: 0, panY: 0 }
  const state = { selectedColor: 2, hover: null, isDragging: false, dragStart: null, hoverHash: 0, hoverTs: 0 }

  let sessionState = "RUNNING"

  let board = {
    w: 100,
    h: 100,
    pixels: new Uint8Array(100 * 100),
    metaHash: new Uint32Array(100 * 100),
    metaTs: new Uint32Array(100 * 100),
    colors: 16,
    cooldownMs: 10000
  }

  let chunkSize = 10

  const canvas = $("cv")
  const ctx = canvas.getContext("2d", { alpha: false })

  function setSessionState(next) {
    sessionState = String(next || "").toUpperCase() === "PAUSED" ? "PAUSED" : "RUNNING"
    const wrap = canvas?.parentElement
    if (wrap) wrap.style.opacity = sessionState === "PAUSED" ? "0.9" : "1"
    canvas.style.cursor = sessionState === "PAUSED" ? "not-allowed" : "crosshair"
    buildPalette()
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }

  function worldToScreen(x, y) {
    return { x: x * view.zoom + view.panX, y: y * view.zoom + view.panY }
  }

  function screenToWorld(clientX, clientY) {
    const r2 = canvas.getBoundingClientRect()
    const sx = clientX - r2.left
    const sy = clientY - r2.top
    const wx = (sx - view.panX) / view.zoom
    const wy = (sy - view.panY) / view.zoom
    return { x: wx, y: wy }
  }

  function worldPixelFromEvent(e) {
    const w = screenToWorld(e.clientX, e.clientY)
    const x = Math.floor(w.x)
    const y = Math.floor(w.y)
    if (x < 0 || y < 0 || x >= board.w || y >= board.h) return null
    return { x, y }
  }

  function updateHUD() {
    $("boardSize").textContent = `${board.w}×${board.h}`
    $("zoomVal").textContent = view.zoom.toFixed(4)
    $("panVal").textContent = `${Math.round(view.panX)}, ${Math.round(view.panY)}`
    $("colorVal").textContent = `${state.selectedColor}`
    $("hoverVal").textContent = state.hover ? `${state.hover.x}, ${state.hover.y}` : "-"
  }

  function setHoverUserText(username, id) {
    $("hoverBy").textContent = username || "-"
    $("hoverId").textContent = id || "-"
  }

  function hexToRgba(hex, a) {
    const h = hex.replace("#", "")
    const r3 = parseInt(h.slice(0, 2), 16)
    const g3 = parseInt(h.slice(2, 4), 16)
    const b3 = parseInt(h.slice(4, 6), 16)
    return `rgba(${r3},${g3},${b3},${a})`
  }

  function idx(x, y) {
    return y * board.w + x
  }

  function getColorAt(x, y) {
    return board.pixels[idx(x, y)] ?? 1
  }

  function getMetaAt(x, y) {
    const i = idx(x, y)
    return { userHash: board.metaHash[i] >>> 0, ts: board.metaTs[i] >>> 0 }
  }

  function ensureBoardSize(w, h) {
    const W = Math.max(1, Math.floor(Number(w || 0)))
    const H = Math.max(1, Math.floor(Number(h || 0)))
    if (W === board.w && H === board.h && board.pixels?.length === W * H) return
    board.w = W
    board.h = H
    board.pixels = new Uint8Array(W * H)
    board.pixels.fill(1)
    board.metaHash = new Uint32Array(W * H)
    board.metaTs = new Uint32Array(W * H)
  }

  const userHashCache = new Map()
  let hoverResolveToken = 0

  function clearBoardLocal() {
    if (board?.pixels?.length) board.pixels.fill(1)
    if (board?.metaHash?.length) board.metaHash.fill(0)
    if (board?.metaTs?.length) board.metaTs.fill(0)
    userHashCache.clear()
  }

  function applyChunk(cx, cy, bytes, inferredSize) {
    const sz = Math.max(1, Math.floor(Number(inferredSize || chunkSize || 1)))
    const ox = cx * sz
    const oy = cy * sz
    const maxW = board.w
    const w = Math.min(sz, Math.max(0, maxW - ox))
    const h = Math.min(sz, Math.max(0, board.h - oy))
    if (w <= 0 || h <= 0) return
    for (let y = 0; y < h; y++) {
      const srcRow = y * sz
      const dstRow = (oy + y) * maxW + ox
      for (let x = 0; x < w; x++) {
        const v = bytes[srcRow + x]
        const c = (v === undefined ? 1 : v)
        board.pixels[dstRow + x] = c
      }
    }
  }

  async function loadBoardFromServerlessFull() {
    const since = new Date(0).toISOString()
    const limit = 500
    let pageToken = null
    let metaApplied = false
    let any = 0

    while (true) {
      const data = await getBoardBackend(inDiscord, since, limit, pageToken, { includeMeta: "true" })
      const chunks = Array.isArray(data?.chunks) ? data.chunks : []

      for (const c of chunks) {
        if (!metaApplied && c?.metaGzipB64) {
          const metaBytes = await gunzipBytes(b64ToBytes(c.metaGzipB64))
          const metaTxt = new TextDecoder().decode(metaBytes)
          let meta = null
          try { meta = metaTxt ? JSON.parse(metaTxt) : null } catch { meta = null }
          if (meta && (meta.w || meta.h || meta.colors || meta.cooldownMs || meta.chunkSize)) {
            if (meta.w && meta.h) ensureBoardSize(meta.w, meta.h)
            if (meta.colors) board.colors = Number(meta.colors) || board.colors
            if (meta.cooldownMs) board.cooldownMs = Number(meta.cooldownMs) || board.cooldownMs
            if (meta.chunkSize) chunkSize = Number(meta.chunkSize) || chunkSize
            metaApplied = true
          }
        }

        if (c?.dataGzipB64) {
          const bytes = await gunzipBytes(b64ToBytes(c.dataGzipB64))
          let sz = chunkSize
          if (!sz || sz <= 0) {
            const g = guessSquareSize(bytes.length)
            if (g) sz = g
          }
          if (sz && sz > 0) applyChunk(Number(c.cx || 0), Number(c.cy || 0), bytes, sz)
          any++
        }
      }

      pageToken = data?.nextPageToken || null
      if (!pageToken) break
    }

    if (!metaApplied) {
      if (!chunkSize || chunkSize <= 0) chunkSize = 10
      if (!board?.pixels?.length) ensureBoardSize(board.w || 100, board.h || 100)
    }

    return { chunksApplied: any, metaApplied }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const pxSize = view.zoom
    const left = Math.floor((-view.panX) / view.zoom) - 1
    const top = Math.floor((-view.panY) / view.zoom) - 1
    const right = Math.ceil((canvas.width - view.panX) / view.zoom) + 1
    const bottom = Math.ceil((canvas.height - view.panY) / view.zoom) + 1

    const vx0 = clamp(left, 0, board.w - 1)
    const vy0 = clamp(top, 0, board.h - 1)
    const vx1 = clamp(right, 0, board.w - 1)
    const vy1 = clamp(bottom, 0, board.h - 1)

    for (let y = vy0; y <= vy1; y++) {
      for (let x = vx0; x <= vx1; x++) {
        const colorId = getColorAt(x, y)
        const s2 = worldToScreen(x, y)
        ctx.fillStyle = palette[colorId] ?? "#000"
        ctx.fillRect(s2.x, s2.y, pxSize, pxSize)
      }
    }

    if (state.hover) {
      const s2 = worldToScreen(state.hover.x, state.hover.y)
      const size = Math.max(1, pxSize)
      ctx.fillStyle = hexToRgba(palette[state.selectedColor] ?? "#ff00ff", 0.45)
      ctx.fillRect(s2.x, s2.y, size, size)
      ctx.strokeStyle = "rgba(0,0,0,0.7)"
      ctx.lineWidth = 1
      ctx.strokeRect(s2.x + 0.5, s2.y + 0.5, size - 1, size - 1)
    }

    updateHUD()
  }

  async function resolveHoverOwner(p) {
    const token = ++hoverResolveToken
    if (!p) {
      setHoverUserText("-", "-")
      return
    }

    const m = getMetaAt(p.x, p.y)
    state.hoverHash = m.userHash >>> 0
    state.hoverTs = m.ts >>> 0

    if (!m.userHash) {
      setHoverUserText("-", "-")
      return
    }

    const cached = userHashCache.get(m.userHash)
    if (cached) {
      setHoverUserText(cached.username || "-", cached.discordId || "-")
      return
    }

    setHoverUserText("Loading…", "-")

    try {
      const data = await resolveUserHashBackend(m.userHash)
      if (token !== hoverResolveToken) return

      const discordId =
        data?.discordId ||
        data?.userId ||
        data?.id ||
        data?.user?.id ||
        ""

      const username =
        data?.discordUsername ||
        data?.username ||
        data?.user?.username ||
        data?.user?.global_name ||
        data?.user?.name ||
        ""

      const norm = {
        discordId: discordId ? String(discordId) : "",
        username: username ? String(username) : ""
      }

      userHashCache.set(m.userHash, norm)
      setHoverUserText(norm.username || "-", norm.discordId || "-")
    } catch {
      if (token !== hoverResolveToken) return
      setHoverUserText("-", "-")
    }
  }

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault()
    const before = screenToWorld(e.clientX, e.clientY)
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    view.zoom = clamp(view.zoom * factor, 2, 80)
    const after = screenToWorld(e.clientX, e.clientY)
    const dxWorld = after.x - before.x
    const dyWorld = after.y - before.y
    view.panX += dxWorld * view.zoom
    view.panY += dyWorld * view.zoom
    render()
  }, { passive: false })

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId)
    state.isDragging = true
    state.dragStart = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY }
  })

  canvas.addEventListener("pointermove", (e) => {
    const prev = state.hover ? `${state.hover.x},${state.hover.y}` : ""
    state.hover = worldPixelFromEvent(e)
    const next = state.hover ? `${state.hover.x},${state.hover.y}` : ""
    if (state.isDragging) {
      const dx = e.clientX - state.dragStart.x
      const dy = e.clientY - state.dragStart.y
      view.panX = state.dragStart.panX + dx
      view.panY = state.dragStart.panY + dy
    }
    render()
    if (prev !== next) resolveHoverOwner(state.hover)
  })

  canvas.addEventListener("pointerup", () => {
    state.isDragging = false
    state.dragStart = null
  })

  let lastSince = new Date(0).toISOString()
  let polling = false
  let placing = false

  async function applyUpdateChunks(chunks) {
    console.groupCollapsed(`[apply_update_chunks] n=${chunks?.length ?? 0}`)
    console.log("time", nowIso())
    console.log("chunkSize", chunkSize)
    console.groupEnd()

    for (const c of chunks) {
      if (c?.dataGzipB64) {
        const bytes = await gunzipBytes(b64ToBytes(c.dataGzipB64))
        let sz = chunkSize
        if (!sz || sz <= 0) {
          const g = guessSquareSize(bytes.length)
          if (g) sz = g
        }
        if (sz && sz > 0) applyChunk(Number(c.cx || 0), Number(c.cy || 0), bytes, sz)
      }
    }
  }

  async function quickGetBoardOnce(reason = "manual") {
    const started = msNow()
    const since0 = lastSince
    logLine("⏳ Fetching latest chunks...")

    console.groupCollapsed("[quick_get_board_once] start")
    console.log("time", nowIso())
    console.log("reason", reason)
    console.log("since", since0)
    console.log("limit", 500)
    console.log("chunkSize", chunkSize)
    console.groupEnd()

    let pageToken = null
    let maxUpdatedAt = lastSince
    let changed = false
    let pages = 0
    let totalChunks = 0

    do {
      pages++
      const data = await getBoardBackend(inDiscord, lastSince, 500, pageToken, {})
      const chunks = Array.isArray(data?.chunks) ? data.chunks : []
      totalChunks += chunks.length

      console.groupCollapsed(`[quick_get_board_once] page ${pages}`)
      console.log("time", nowIso())
      console.log("since_used", lastSince)
      console.log("sinceEcho", data?.sinceEcho ?? null)
      console.log("returned", data?.returned ?? chunks.length)
      console.log("chunks_len", chunks.length)
      console.log("nextPageToken", data?.nextPageToken || null)
      if (chunks.length) {
        console.log("first_chunk", chunks[0])
        console.log("last_chunk", chunks[chunks.length - 1])
      }
      console.groupEnd()

      if (chunks.length) {
        await applyUpdateChunks(chunks)
        changed = true
      }
      for (const c of chunks) {
        if (c?.updatedAt && String(c.updatedAt) > String(maxUpdatedAt)) maxUpdatedAt = String(c.updatedAt)
      }
      pageToken = data?.nextPageToken || null
    } while (pageToken)

    lastSince = maxUpdatedAt

    const ms = Math.round(msNow() - started)
    console.groupCollapsed("[quick_get_board_once] done")
    console.log("time", nowIso())
    console.log("ms", ms)
    console.log("pages", pages)
    console.log("totalChunks", totalChunks)
    console.log("changed", changed)
    console.log("lastSince_after", lastSince)
    console.groupEnd()

    if (changed) {
      logLine("✅ Updated.")
      render()
      resolveHoverOwner(state.hover)
    } else {
      logLine("✅ No changes.")
    }

    return { changed, totalChunks, pages, ms }
  }

  async function fullReloadFromServerless() {
    logLine("⏳ Reloading board from serverless...")
    console.groupCollapsed("[full_reload_from_serverless] start")
    console.log("time", nowIso())
    console.log("lastSince_before", lastSince)
    console.log("board_before", { w: board.w, h: board.h, chunkSize, colors: board.colors, cooldownMs: board.cooldownMs })
    console.groupEnd()

    clearBoardLocal()
    lastSince = new Date(0).toISOString()
    const r2 = await loadBoardFromServerlessFull()

    console.groupCollapsed("[full_reload_from_serverless] done")
    console.log("time", nowIso())
    console.log("result", r2)
    console.log("board_after", { w: board.w, h: board.h, chunkSize, colors: board.colors, cooldownMs: board.cooldownMs })
    console.log("lastSince_after", lastSince)
    console.groupEnd()

    logLine(`✅ Board reloaded (chunks=${r2.chunksApplied}${r2.metaApplied ? ", meta" : ""}).`)
    $("fit").click()
    render()
    resolveHoverOwner(state.hover)

    await quickGetBoardOnce("post_full_reload_sync")
  }

  canvas.addEventListener("click", async (e) => {
    if (state.isDragging) return
    if (sessionState === "PAUSED") {
      logLine("⏸️ Paused: placing pixels is disabled.")
      return
    }
    if (placing) {
      logLine("⏳ Placing... wait")
      return
    }

    const p = worldPixelFromEvent(e)
    if (!p) return

    placing = true

    const user = await getUserForPayload(inDiscord)
    const picked = palette[state.selectedColor]
    const colorInt = hexToIntColor(picked)
    console.groupCollapsed(`[ui_click_place] ${p.x},${p.y}`)
    console.log("time", nowIso())
    console.log("inDiscord", inDiscord)
    console.log("sessionState", sessionState)
    console.log("selectedColorId", state.selectedColor)
    console.log("selectedColorHex", picked)
    console.log("selectedColorInt", colorInt >>> 0)
    console.log("user", user)
    console.log("board", { w: board.w, h: board.h, chunkSize, colors: board.colors, cooldownMs: board.cooldownMs })
    console.log("view", { ...view })
    console.log("hover", state.hover)
    console.groupEnd()

    try {
      const rr = await placePixelBackend(inDiscord, p.x, p.y, picked)
      console.groupCollapsed(`[place_pixel_result] ${p.x},${p.y}`)
      console.log("time", nowIso())
      console.log("result", rr)
      console.groupEnd()

      logLine(`✅ Place requested @ ${p.x},${p.y}. Syncing from server...`)
      await quickGetBoardOnce("after_place_pixel")
    } catch (err) {
      console.groupCollapsed(`[place_pixel_error] ${p.x},${p.y}`)
      console.log("time", nowIso())
      console.error(err)
      console.groupEnd()
      logLine(String(err?.message || err))
    } finally {
      placing = false
    }

    render()
    resolveHoverOwner(state.hover)
  })

  function buildPalette() {
    const wrap = $("palette")
    wrap.innerHTML = ""
    palette.forEach((col, i) => {
      const b = document.createElement("button")
      b.className = "palBtn"
      b.title = String(i)
      b.style.background = col
      b.style.border = (i === state.selectedColor)
        ? "2px solid rgba(255,255,255,0.95)"
        : "1px solid rgba(255,255,255,0.25)"
      b.disabled = sessionState === "PAUSED"
      b.onclick = () => {
        if (sessionState === "PAUSED") return
        console.groupCollapsed(`[palette_select] ${i}`)
        console.log("time", nowIso())
        console.log("prev", state.selectedColor)
        console.log("next", i)
        console.groupEnd()
        state.selectedColor = i
        buildPalette()
        render()
      }
      wrap.appendChild(b)
    })
  }

  $("fit").onclick = () => {
    const fitZoom = Math.min(canvas.width / board.w, canvas.height / board.h)
    view.zoom = clamp(Math.floor(fitZoom), 2, 80)
    view.panX = (canvas.width - board.w * view.zoom) / 2
    view.panY = (canvas.height - board.h * view.zoom) / 2
    render()
  }

  $("reload").onclick = async () => {
    const b = $("reload")
    const prev = b ? b.textContent : "Reload board"
    if (b) {
      b.disabled = true
      b.textContent = "Reloading..."
    }
    try {
      await quickGetBoardOnce("reload_button")
    } catch (e) {
      console.groupCollapsed("[reload_button_error]")
      console.log("time", nowIso())
      console.error(e)
      console.groupEnd()
      logLine(String(e?.message || e))
    } finally {
      if (b) {
        b.disabled = false
        b.textContent = prev
      }
    }
  }

  $("reset").onclick = async () => {
    const b = $("reset")
    const prev = b ? b.textContent : "Reset"
    if (b) {
      b.disabled = true
      b.textContent = "Resetting..."
    }
    try {
      await fullReloadFromServerless()
    } catch (e) {
      showFatal(e)
    } finally {
      if (b) {
        b.disabled = false
        b.textContent = prev
      }
    }
  }

  const snapBtn = $("snapshot")
  if (snapBtn) {
    snapBtn.onclick = async () => {
      const prev = snapBtn.textContent
      snapBtn.disabled = true
      snapBtn.textContent = "Snapshotting..."

      try {
        logLine("⏳ Creating snapshot...")
        await snapshotBackend(inDiscord, null)
        logLine("✅ Snapshot requested.")
      } catch (e) {
        console.groupCollapsed("[snapshot_error]")
        console.log("time", nowIso())
        console.error(e)
        console.groupEnd()
        logLine(String(e?.message || e))
      } finally {
        snapBtn.disabled = false
        snapBtn.textContent = prev
      }
    }
  }

  $("clear").onclick = () => {
    clearBoardLocal()
    logLine("🧹 Cleared locally.")
    console.groupCollapsed("[clear_local]")
    console.log("time", nowIso())
    console.log("board", { w: board.w, h: board.h, pixels: board.pixels?.length, metaHash: board.metaHash?.length, metaTs: board.metaTs?.length })
    console.groupEnd()
    render()
    resolveHoverOwner(state.hover)
  }

  const resetSessionBtn = $("resetSession")
  if (resetSessionBtn) {
    resetSessionBtn.onclick = async () => {
      const prevText = resetSessionBtn.textContent
      resetSessionBtn.disabled = true
      resetSessionBtn.textContent = "Resetting..."
      try {
        logLine("⏳ Resetting board (deleting ALL chunks)...")
        await resetBoardBackend(inDiscord)
        await fullReloadFromServerless()
        logLine("✅ Board reset.")
      } catch (e) {
        console.groupCollapsed("[reset_board_error]")
        console.log("time", nowIso())
        console.error(e)
        console.groupEnd()
        logLine(String(e?.message || e))
      } finally {
        resetSessionBtn.disabled = false
        resetSessionBtn.textContent = prevText
      }
    }
  }

  const startBtn = $("start")
  if (startBtn) {
    startBtn.onclick = async () => {
      const prevText = startBtn.textContent
      startBtn.disabled = true
      startBtn.textContent = "Starting..."
      try {
        logLine("⏳ Session start...")
        const data = await sessionStartBackend(inDiscord)
        setSessionState("RUNNING")
        console.groupCollapsed("[session_start_result]")
        console.log("time", nowIso())
        console.log("result", data)
        console.groupEnd()
        logLine(`✅ Session started.${data?.ok === false ? " (server returned ok=false)" : ""}`)
      } catch (e) {
        console.groupCollapsed("[session_start_error]")
        console.log("time", nowIso())
        console.error(e)
        console.groupEnd()
        logLine(String(e?.message || e))
      } finally {
        startBtn.disabled = false
        startBtn.textContent = prevText
      }
    }
  }

  const pauseBtn = $("pause")
  if (pauseBtn) {
    pauseBtn.onclick = async () => {
      const prevText = pauseBtn.textContent
      pauseBtn.disabled = true
      pauseBtn.textContent = "Pausing..."
      try {
        logLine("⏳ Session pause...")
        const data = await sessionPauseBackend(inDiscord)
        setSessionState("PAUSED")
        console.groupCollapsed("[session_pause_result]")
        console.log("time", nowIso())
        console.log("result", data)
        console.groupEnd()
        logLine(`✅ Session paused.${data?.ok === false ? " (server returned ok=false)" : ""}`)
      } catch (e) {
        console.groupCollapsed("[session_pause_error]")
        console.log("time", nowIso())
        console.error(e)
        console.groupEnd()
        logLine(String(e?.message || e))
      } finally {
        pauseBtn.disabled = false
        pauseBtn.textContent = prevText
      }
    }
  }

  const pingBtn = document.getElementById("ping-btn")
  const pingOut = document.getElementById("ping-output")

  if (pingBtn && pingOut) {
    pingBtn.addEventListener("click", async () => {
      pingBtn.disabled = true
      pingBtn.textContent = "Ping..."
      pingOut.textContent = ""
      try {
        const data = await pingBackend(inDiscord)
        pingOut.textContent = JSON.stringify(data, null, 2)
      } catch (err) {
        pingOut.textContent = `Erreur: ${err?.message ?? String(err)}`
      } finally {
        pingBtn.disabled = false
        pingBtn.textContent = "Ping Backend"
      }
    })
  }

  setSessionState(sessionState)
  buildPalette()

  ;(async () => {
    try {
      logLine("⏳ Loading board from serverless...")
      console.groupCollapsed("[startup_load_board] start")
      console.log("time", nowIso())
      console.groupEnd()
      await fullReloadFromServerless()
      console.groupCollapsed("[startup_load_board] done")
      console.log("time", nowIso())
      console.groupEnd()
    } catch (e) {
      console.groupCollapsed("[startup_load_board_error]")
      console.log("time", nowIso())
      console.error(e)
      console.groupEnd()
      logLine(String(e?.message || "⚠️ serverless /board unreachable"))
      $("fit").click()
      render()
      resolveHoverOwner(state.hover)
    }
  })()

  async function pollBoard() {
    if (polling) return
    polling = true
    while (polling) {
      try {
        let pageToken = null
        let maxUpdatedAt = lastSince
        let changed = false
        let pages = 0
        let chunksTotal = 0

        const started = msNow()

        do {
          pages++
          const data = await getBoardBackend(inDiscord, lastSince, 200, pageToken, {})
          const chunks = Array.isArray(data?.chunks) ? data.chunks : []
          chunksTotal += chunks.length

          if (chunks.length) {
            await applyUpdateChunks(chunks)
            changed = true
          }
          for (const c of chunks) {
            if (c?.updatedAt && String(c.updatedAt) > String(maxUpdatedAt)) maxUpdatedAt = String(c.updatedAt)
          }
          pageToken = data?.nextPageToken || null
        } while (pageToken)

        lastSince = maxUpdatedAt

        if (changed) {
          const ms = Math.round(msNow() - started)
          console.groupCollapsed("[poll_board_changed]")
          console.log("time", nowIso())
          console.log("ms", ms)
          console.log("pages", pages)
          console.log("chunksTotal", chunksTotal)
          console.log("lastSince", lastSince)
          console.groupEnd()
          render()
          resolveHoverOwner(state.hover)
        }
      } catch (e) {
        console.groupCollapsed("[poll_board_error]")
        console.log("time", nowIso())
        console.error(e)
        console.groupEnd()
      }
      await new Promise((r3) => setTimeout(r3, 1000))
    }
  }

  pollBoard()
}

try {
  run()
} catch (e) {
  showFatal(e)
}
