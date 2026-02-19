import "./style.css"
import { DiscordSDK } from "@discord/embedded-app-sdk"

console.log("MAIN.JS VERSION = BOARD_V3_HOVER_USER", new Date().toISOString())

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
window.addEventListener("unhandledrejection", (e) => {
  const msg = String(e?.reason?.message || e?.reason || "")
  if (msg.includes("session_paused") || msg.includes("admin_only") || msg.includes("cooldown") || msg.includes("rate")) {
    console.warn("Non-fatal rejection:", e.reason)
    return
  }
  showFatal(e.reason)
})

function isProbablyDiscordActivity() {
  const qp = new URLSearchParams(location.search)
  if (qp.get("frame_id") || qp.get("instance_id")) return true
  if (window?.DiscordNative) return true
  return false
}

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, credentials: "include" })
  const text = await res.text().catch(() => "")
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
  console.log(JSON.stringify({ t: new Date().toISOString(), event: "api", path, method: (opts.method || "GET"), status: res.status, ok: res.ok, data }))
  return { res, data }
}

function avatarUrl(user) {
  if (!user) return ""
  if (user.avatar_url) return user.avatar_url
  if (user.avatar && user.id) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
  return ""
}

function b64urlToUtf8(str) {
  const s2 = String(str || "").replaceAll("-", "+").replaceAll("_", "/")
  const pad = s2.length % 4 === 2 ? "==" : s2.length % 4 === 3 ? "=" : s2.length % 4 === 1 ? "===" : ""
  const b64 = s2 + pad
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function readWebUserFromUrl() {
  try {
    const u = new URL(location.href)
    const p = u.searchParams.get("web_user")
    if (!p) return null
    const json = b64urlToUtf8(p)
    const user = JSON.parse(json)
    if (!user?.id) return null
    try { localStorage.setItem("web_user_cache", JSON.stringify(user)) } catch {}
    u.searchParams.delete("web_user")
    history.replaceState(null, "", u.pathname + (u.searchParams.toString() ? `?${u.searchParams.toString()}` : "") + u.hash)
    return user
  } catch {
    return null
  }
}

function getCachedWebUser() {
  try {
    const raw = localStorage.getItem("web_user_cache")
    if (!raw) return null
    const u = JSON.parse(raw)
    if (!u?.id) return null
    return u
  } catch {
    return null
  }
}

async function clearLocalAuth() {
  try { localStorage.removeItem("activity_user") } catch {}
  try { localStorage.removeItem("web_user_cache") } catch {}
}

async function logoutEverywhere() {
  await clearLocalAuth()
  try { await api("/api/web/logout", { method: "POST" }) } catch {}
  location.reload()
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

    const logout = document.createElement("button")
    logout.className = "btn"
    logout.style.marginLeft = "10px"
    logout.textContent = "Logout"
    logout.onclick = logoutEverywhere

    wrap.appendChild(logout)
    slot.appendChild(wrap)
    return
  }

  if (state?.type === "outside") {
    const wrap = document.createElement("div")
    wrap.className = "userSlot"

    const msg = document.createElement("div")
    msg.className = "mini"
    msg.style.opacity = "0.9"
    msg.textContent = "Browser mode"

    const b = document.createElement("button")
    b.className = "btn"
    b.textContent = "Login with Discord"
    b.onclick = () => {
      const returnTo = encodeURIComponent(location.pathname + location.search + location.hash)
      location.href = `/api/web/login?returnTo=${returnTo}`
    }

    wrap.appendChild(msg)
    wrap.appendChild(b)
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

    const out = document.createElement("button")
    out.className = "btn"
    out.style.marginLeft = "10px"
    out.textContent = "Logout"
    out.onclick = logoutEverywhere

    wrap.appendChild(msg)
    wrap.appendChild(b)
    wrap.appendChild(out)
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

async function loginDiscordActivity() {
  const cfg = await api("/api/auth/config")
  if (!cfg.res.ok || !cfg.data?.clientId) throw new Error("missing_client_id")

  const discordSdk = new DiscordSDK(cfg.data.clientId)
  await discordSdk.ready()

  const authz = await discordSdk.commands.authorize({
    client_id: cfg.data.clientId,
    response_type: "code",
    state: "",
    prompt: "consent",
    scope: ["identify"]
  })

  const tokenRes = await api("/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: authz.code })
  })

  if (!tokenRes.res.ok || !tokenRes.data?.access_token) {
    const d = tokenRes.data ? JSON.stringify(tokenRes.data) : ""
    throw new Error(`token_exchange_failed ${d}`)
  }

  const auth = await discordSdk.commands.authenticate({ access_token: tokenRes.data.access_token })
  if (!auth?.user) throw new Error("authenticate_failed")

  const u = {
    id: auth.user.id,
    username: auth.user.global_name || auth.user.username,
    avatar: auth.user.avatar,
    avatar_url: auth.user.avatar ? `https://cdn.discordapp.com/avatars/${auth.user.id}/${auth.user.avatar}.png?size=128` : ""
  }

  localStorage.setItem("activity_user", JSON.stringify(u))
  return u
}

async function getActivityUser() {
  try {
    const raw = localStorage.getItem("activity_user")
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function getWebUser() {
  const r = await api("/api/web/me")
  if (!r.res.ok || !r.data?.user?.id) return null
  return r.data.user
}

function hexToIntColor(colorHex) {
  if (typeof colorHex === "number") return Number(colorHex) >>> 0
  const s = String(colorHex || "").trim()
  if (!s) return 0
  if (s.startsWith("#")) return parseInt(s.slice(1), 16) >>> 0
  if (s.startsWith("0x") || s.startsWith("0X")) return parseInt(s.slice(2), 16) >>> 0
  return parseInt(s, 10) >>> 0
}

function makeReqId() {
  try { return crypto.randomUUID() } catch { return String(Date.now()) + "_" + Math.random().toString(16).slice(2) }
}

async function getUserForPayload(inDiscord) {
  if (!inDiscord) return null
  const u = await getActivityUser()
  if (!u?.id) return null
  return { id: u.id, username: u.username || "", avatar: u.avatar || "" }
}

async function getUserIdForReset(inDiscord) {
  if (inDiscord) {
    const u = await getActivityUser()
    return u?.id ? String(u.id) : null
  }
  const cached = getCachedWebUser()
  if (cached?.id) return String(cached.id)
  try {
    const wu = await getWebUser()
    if (wu?.id) return String(wu.id)
  } catch {}
  return null
}

async function pingBackend(inDiscord) {
  const reqId = makeReqId()
  const user = await getUserForPayload(inDiscord)

  const res = await fetch(`${GATEWAY_BASE}/proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "PING",
      payload: {
        from: "activity",
        at: new Date().toISOString(),
        reqId,
        user
      }
    })
  })

  const data = await res.json()
  return data
}

async function resetBoardBackend(inDiscord) {
  const reqId = makeReqId()
  const userId = await getUserIdForReset(inDiscord)

  const res = await fetch(`${GATEWAY_BASE}/proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "RESET_BOARD",
      payload: {
        from: "activity",
        at: new Date().toISOString(),
        reqId,
        userId
      }
    })
  })

  const text = await res.text().catch(() => "")
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
  if (!res.ok) throw new Error(`RESET_BOARD failed: ${res.status} ${JSON.stringify(data)}`)
  return data
}

async function waitForChunksCleared(inDiscord, tries = 80, delayMs = 500) {
  const since = new Date(0).toISOString()
  for (let i = 0; i < tries; i++) {
    const data = await getBoardBackend(inDiscord, since, 1, null, { includeMeta: "false", includePixelMeta: "false" })
    const chunks = Array.isArray(data?.chunks) ? data.chunks : []
    if (chunks.length === 0) return true
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return false
}

async function placePixelBackend(inDiscord, x, y, colorHexOrInt) {
  const reqId = makeReqId()
  const user = await getUserForPayload(inDiscord)
  const color = hexToIntColor(colorHexOrInt)

  const res = await fetch(`${GATEWAY_BASE}/proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "PLACE_PIXEL",
      payload: {
        from: "activity",
        at: new Date().toISOString(),
        reqId,
        userId: user?.id,
        username:
          user?.username ??
          user?.global_name ??
          user?.displayName ??
          null,
        x,
        y,
        color
      }
    })
  })

  const text = await res.text().catch(() => "")
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }

  if (!res.ok) throw new Error(`PLACE_PIXEL failed: ${res.status} ${JSON.stringify(data)}`)
  return data
}

async function resolveUserHashBackend(userHash) {
  const reqId = makeReqId()
  const res = await fetch(`${GATEWAY_BASE}/proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "RESOLVE_USERHASH",
      payload: {
        from: "activity",
        at: new Date().toISOString(),
        reqId,
        userHash: String(userHash)
      }
    })
  })

  const text = await res.text().catch(() => "")
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
  if (!res.ok) throw new Error(`RESOLVE_USERHASH failed: ${res.status} ${JSON.stringify(data)}`)
  return data
}

async function getBoardBackend(inDiscord, since, limit = 200, pageToken = null, extra = {}) {
  const reqId = makeReqId()
  const user = await getUserForPayload(inDiscord)

  const url = new URL(`${GATEWAY_BASE}/board`)
  if (since != null) url.searchParams.set("since", String(since))
  if (limit != null) url.searchParams.set("limit", String(limit))
  if (pageToken) url.searchParams.set("pageToken", String(pageToken))
  for (const [k, v] of Object.entries(extra || {})) {
    if (v === undefined || v === null) continue
    url.searchParams.set(k, String(v))
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "X-Client-ReqId": reqId,
      "X-Client-At": new Date().toISOString(),
      ...(user?.id ? { "X-User-Id": user.id } : {})
    }
  })

  const text = await res.text().catch(() => "")
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }

  if (!res.ok) throw new Error(`GET_BOARD failed: ${res.status} ${JSON.stringify(data)}`)
  return { ...data, _client: { reqId, at: new Date().toISOString(), user } }
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

function u32le(bytes, off) {
  return (bytes[off + 0] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0
}

async function run() {
  const app = document.querySelector("#app")
  if (!app) throw new Error("Missing #app root element")

  app.innerHTML = `
    <div class="shell">
      <div class="topbar">
        <div class="brand">
          <div class="badge"></div>
          <div class="brandTitle">r/place viewer</div>
        </div>
        <div id="userSlot"></div>
      </div>

      <div class="mainRow">
        <div class="leftPanel">
          <h3 style="margin:0;">r/place viewer (server)</h3>

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
            <button class="btn" id="snapshot">Snapshot</button>
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

  const btn = document.getElementById("ping-btn")
  const out = document.getElementById("ping-output")

  if (btn && out) {
    btn.addEventListener("click", async () => {
      btn.disabled = true
      btn.textContent = "Ping..."
      out.textContent = ""
      try {
        const data = await pingBackend(inDiscord)
        out.textContent = JSON.stringify(data, null, 2)
      } catch (err) {
        console.error(err)
        out.textContent = `Erreur: ${err?.message ?? String(err)}`
      } finally {
        btn.disabled = false
        btn.textContent = "Ping Backend"
      }
    })
  }

  async function apiWithUser(path, opts = {}) {
    const headers = new Headers(opts.headers || {})
    if (inDiscord) {
      const u = await getActivityUser()
      if (u?.id) headers.set("x-user-id", u.id)
    }
    return api(path, { ...opts, headers })
  }

  function setHidden(id, hidden) {
    const el = $(id)
    if (!el) return
    el.style.display = hidden ? "none" : ""
  }

  function applyRoleUI(isAdmin) {
    window.__canPlace = true
    setHidden("reload", false)
    setHidden("start", !isAdmin)
    setHidden("pause", !isAdmin)
    setHidden("resetSession", !isAdmin)
    setHidden("snapshot", !isAdmin)
    setHidden("clear", !isAdmin)
    const brand = document.querySelector(".brandTitle")
    if (brand) brand.textContent = isAdmin ? "r/place viewer (ADMIN)" : "r/place viewer"
  }

  async function attemptLogin() {
    if (!inDiscord) {
      const fromUrl = readWebUserFromUrl()
      if (fromUrl?.id) {
        setUserSlotState({ type: "user", user: fromUrl })
        return
      }

      const cached = getCachedWebUser()
      if (cached?.id) {
        setUserSlotState({ type: "user", user: cached })
        return
      }

      try {
        const wu = await getWebUser()
        if (wu?.id) {
          try { localStorage.setItem("web_user_cache", JSON.stringify(wu)) } catch {}
          setUserSlotState({ type: "user", user: wu })
          return
        }
      } catch {}

      setUserSlotState({ type: "outside" })
      return
    }

    setUserSlotState({})

    try {
      const cached = await getActivityUser()
      if (cached?.id) {
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

  const r = await apiWithUser("/api/user/isAdmin")
  const isAdmin = Boolean(r.data?.isAdmin)
  window.__isAdmin = isAdmin
  applyRoleUI(isAdmin)

  const palette = [
    "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff",
    "#888888", "#ff8800", "#8844ff", "#44ff88", "#ff4444", "#4444ff", "#222222", "#cccccc"
  ]

  const view = { zoom: 6, panX: 0, panY: 0 }
  const state = { selectedColor: 2, hover: null, isDragging: false, dragStart: null, hoverHash: 0, hoverTs: 0 }

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

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }

  function worldToScreen(x, y) {
    return { x: x * view.zoom + view.panX, y: y * view.zoom + view.panY }
  }

  function screenToWorld(clientX, clientY) {
    const r = canvas.getBoundingClientRect()
    const sx = clientX - r.left
    const sy = clientY - r.top
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
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${a})`
  }

  function idx(x, y) {
    return y * board.w + x
  }

  function getColorAt(x, y) {
    return board.pixels[idx(x, y)] ?? 1
  }

  function setColorAt(x, y, colorId) {
    board.pixels[idx(x, y)] = colorId
  }

  function getMetaAt(x, y) {
    const i = idx(x, y)
    return { userHash: board.metaHash[i] >>> 0, ts: board.metaTs[i] >>> 0 }
  }

  function setMetaAt(x, y, userHash, ts) {
    const i = idx(x, y)
    board.metaHash[i] = userHash >>> 0
    board.metaTs[i] = ts >>> 0
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

  function applyChunk(cx, cy, bytes, inferredSize) {
    const sz = Math.max(1, Math.floor(Number(inferredSize || chunkSize || 1)))
    const ox = cx * sz
    const oy = cy * sz
    const maxW = board.w
    const maxH = board.h
    const w = Math.min(sz, Math.max(0, maxW - ox))
    const h = Math.min(sz, Math.max(0, maxH - oy))
    if (w <= 0 || h <= 0) return
    for (let y = 0; y < h; y++) {
      const srcRow = y * sz
      const dstRow = (oy + y) * maxW + ox
      for (let x = 0; x < w; x++) {
        const v = bytes[srcRow + x]
        board.pixels[dstRow + x] = (v === undefined ? 1 : v)
      }
    }
  }

  function applyChunkMeta(cx, cy, bytes, inferredSize) {
    const sz = Math.max(1, Math.floor(Number(inferredSize || chunkSize || 1)))
    const ox = cx * sz
    const oy = cy * sz
    const maxW = board.w
    const maxH = board.h
    const w = Math.min(sz, Math.max(0, maxW - ox))
    const h = Math.min(sz, Math.max(0, maxH - oy))
    if (w <= 0 || h <= 0) return

    const expected = sz * sz * 8
    if (!bytes || bytes.length < expected) return

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const pixIndex = (y * sz + x)
        const off = pixIndex * 8
        const userHash = u32le(bytes, off + 0)
        const ts = u32le(bytes, off + 4)
        setMetaAt(ox + x, oy + y, userHash, ts)
      }
    }
  }

  async function loadBoardFromServerlessFull() {
    const since = new Date(0).toISOString()
    const limit = 500
    let pageToken = null
    let metaApplied = false
    let any = 0

    const metaExtra = { includeMeta: "true", includePixelMeta: "true" }
    while (true) {
      const data = await getBoardBackend(inDiscord, since, limit, pageToken, metaApplied ? { includePixelMeta: "true" } : metaExtra)
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

        if (c?.pixelMetaGzipB64 || c?.metaPixelsGzipB64 || c?.pixelMetaGzip || c?.metaPixelsGzip) {
          const key =
            c?.pixelMetaGzipB64 ? "pixelMetaGzipB64" :
              c?.metaPixelsGzipB64 ? "metaPixelsGzipB64" :
                c?.pixelMetaGzip ? "pixelMetaGzip" :
                  "metaPixelsGzip"
          const metaPixBytes = await gunzipBytes(b64ToBytes(c[key]))
          let sz = chunkSize
          if (!sz || sz <= 0) {
            const g = guessSquareSize(Math.floor(metaPixBytes.length / 8))
            if (g) sz = g
          }
          if (sz && sz > 0) applyChunkMeta(Number(c.cx || 0), Number(c.cy || 0), metaPixBytes, sz)
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

  const userHashCache = new Map()
  let hoverResolveToken = 0

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
      setHoverUserText(cached.username || "-", cached.userId || "-")
      return
    }

    setHoverUserText("Loading…", String(m.userHash))

    try {
      const data = await resolveUserHashBackend(m.userHash)
      if (token !== hoverResolveToken) return

      const userId =
        data?.userId ||
        data?.discordId ||
        data?.id ||
        data?.user?.id ||
        ""

      const username =
        data?.username ||
        data?.discordUsername ||
        data?.user?.username ||
        data?.user?.global_name ||
        data?.user?.name ||
        ""

      const norm = { userId: userId ? String(userId) : "", username: username ? String(username) : "" }
      userHashCache.set(m.userHash, norm)
      setHoverUserText(norm.username || "-", norm.userId || "-")
    } catch {
      if (token !== hoverResolveToken) return
      setHoverUserText("-", String(m.userHash))
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

  canvas.addEventListener("click", async (e) => {
    if (state.isDragging) return
    const p = worldPixelFromEvent(e)
    if (!p) return

    try {
      const rr = await placePixelBackend(inDiscord, p.x, p.y, palette[state.selectedColor])
      if (rr?.ok) logLine(`🟦 Placed pixel @ ${p.x},${p.y} color=${state.selectedColor}`)
      setColorAt(p.x, p.y, state.selectedColor)
    } catch (err) {
      logLine(String(err?.message || err))
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
      b.onclick = () => {
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

  $("reset").onclick = () => {
    view.zoom = 6
    view.panX = 0
    view.panY = 0
    render()
  }

  $("reload").onclick = async () => {
    const b = $("reload")
    if (b) {
      b.disabled = true
      b.textContent = "Reloading..."
    }
    try {
      logLine("⏳ Reloading board from serverless...")
      const r2 = await loadBoardFromServerlessFull()
      logLine(`✅ Board reloaded (chunks=${r2.chunksApplied}${r2.metaApplied ? ", meta" : ""}).`)
      $("fit").click()
      render()
      resolveHoverOwner(state.hover)
    } catch (e) {
      showFatal(e)
    } finally {
      if (b) {
        b.disabled = false
        b.textContent = "Reload board"
      }
    }
  }

  $("clear").onclick = () => {
    board.pixels.fill(1)
    board.metaHash.fill(0)
    board.metaTs.fill(0)
    userHashCache.clear()
    logLine("🧹 Cleared locally.")
    render()
    resolveHoverOwner(state.hover)
  }

  const resetBtn = $("resetSession")
  if (resetBtn) {
    resetBtn.onclick = async () => {
      if (!window.__isAdmin) {
        logLine("admin_only")
        return
      }
      const prevText = resetBtn.textContent
      resetBtn.disabled = true
      resetBtn.textContent = "Resetting..."
      try {
        logLine("⏳ Resetting board (deleting ALL chunks)...")
        await resetBoardBackend(inDiscord)

        board.pixels.fill(1)
        board.metaHash.fill(0)
        board.metaTs.fill(0)
        userHashCache.clear()
        lastSince = new Date(0).toISOString()

        logLine("⏳ Waiting for chunks deletion to complete...")
        await waitForChunksCleared(inDiscord, 80, 500)

        logLine("⏳ Reloading board after reset...")
        const r2 = await loadBoardFromServerlessFull()
        logLine(`✅ Board reset (chunks=${r2.chunksApplied}${r2.metaApplied ? ", meta" : ""}).`)
        $("fit").click()
        render()
        resolveHoverOwner(state.hover)
      } catch (e) {
        logLine(String(e?.message || e))
      } finally {
        resetBtn.disabled = false
        resetBtn.textContent = prevText
      }
    }
  }

  buildPalette()

  ;(async () => {
    try {
      logLine("⏳ Loading board from serverless...")
      const r2 = await loadBoardFromServerlessFull()
      logLine(`✅ Board loaded (chunks=${r2.chunksApplied}${r2.metaApplied ? ", meta" : ""}).`)
    } catch (e) {
      logLine(String(e?.message || "⚠️ serverless /board unreachable"))
    }
    $("fit").click()
    render()
    resolveHoverOwner(state.hover)
  })()

  let lastSince = new Date(0).toISOString()
  let polling = false

  async function applyUpdateChunks(chunks) {
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

      if (c?.pixelMetaGzipB64 || c?.metaPixelsGzipB64 || c?.pixelMetaGzip || c?.metaPixelsGzip) {
        const key =
          c?.pixelMetaGzipB64 ? "pixelMetaGzipB64" :
            c?.metaPixelsGzipB64 ? "metaPixelsGzipB64" :
              c?.pixelMetaGzip ? "pixelMetaGzip" :
                "metaPixelsGzip"
        const metaPixBytes = await gunzipBytes(b64ToBytes(c[key]))
        let sz = chunkSize
        if (!sz || sz <= 0) {
          const g = guessSquareSize(Math.floor(metaPixBytes.length / 8))
          if (g) sz = g
        }
        if (sz && sz > 0) applyChunkMeta(Number(c.cx || 0), Number(c.cy || 0), metaPixBytes, sz)
      }
    }
  }

  async function pollBoard() {
    if (polling) return
    polling = true
    while (polling) {
      try {
        let pageToken = null
        let maxUpdatedAt = lastSince
        let changed = false

        do {
          const data = await getBoardBackend(inDiscord, lastSince, 200, pageToken, { includePixelMeta: "true" })
          const chunks = Array.isArray(data?.chunks) ? data.chunks : []
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
          render()
          resolveHoverOwner(state.hover)
        }
      } catch (e) {
        console.error(e)
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  pollBoard()
}

try {
  run()
} catch (e) {
  showFatal(e)
}
