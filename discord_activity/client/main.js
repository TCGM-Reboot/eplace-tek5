import "./style.css"
import { DiscordSDK } from "@discord/embedded-app-sdk"

console.log("MAIN.JS VERSION = BOARD_V3_RELOAD_GETBOARD_RESET_FULLRELOAD", new Date().toISOString())

const GATEWAY_BASE = "https://1224715390362324992.discordsays.com/gcp"

const DEBUG = true
const DEBUG_DEEP = true

function dNowIso() { return new Date().toISOString() }
function dMsNow() { try { return performance.now() } catch { return Date.now() } }
function dReqId() { try { return crypto.randomUUID() } catch { return String(Date.now()) + "_" + Math.random().toString(16).slice(2) } }

function dSafeJson(o, maxLen = 8000) {
  let s = ""
  try { s = JSON.stringify(o) } catch { s = String(o) }
  if (s.length > maxLen) s = s.slice(0, maxLen) + `…(trunc ${s.length - maxLen})`
  return s
}

function dLog(kind, msg, data) {
  if (!DEBUG) return
  const rec = { t: dNowIso(), kind, msg }
  if (data !== undefined) rec.data = data
  console.log(`[${kind}] ${msg}`, rec)
}

function dWarn(kind, msg, data) {
  if (!DEBUG) return
  const rec = { t: dNowIso(), kind, msg }
  if (data !== undefined) rec.data = data
  console.warn(`[${kind}] ${msg}`, rec)
}

function dErr(kind, msg, data) {
  const rec = { t: dNowIso(), kind, msg }
  if (data !== undefined) rec.data = data
  console.error(`[${kind}] ${msg}`, rec)
}

function dGroup(title, data) {
  if (!DEBUG) return
  console.groupCollapsed(title)
  if (data !== undefined) console.log("data", data)
}

function dGroupEnd() {
  if (!DEBUG) return
  console.groupEnd()
}

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
  dErr("fatal", "showFatal", { msg })
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

window.addEventListener("error", (e) => {
  dErr("window_error", "error", { message: String(e?.message || ""), filename: e?.filename, lineno: e?.lineno, colno: e?.colno, stack: e?.error?.stack || null })
  showFatal(e.error || e.message)
})
window.addEventListener("unhandledrejection", (e) => {
  dErr("unhandledrejection", "promise_rejection", { reason: String(e?.reason?.message || e?.reason || ""), stack: e?.reason?.stack || null })
  showFatal(e.reason)
})

function isProbablyDiscordActivity() {
  const qp = new URLSearchParams(location.search)
  const is = Boolean(qp.get("frame_id") || qp.get("instance_id") || window?.DiscordNative)
  dLog("env", "isProbablyDiscordActivity", { is, search: location.search, hasDiscordNative: Boolean(window?.DiscordNative) })
  return is
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
  try { localStorage.setItem("activity_auth", JSON.stringify(auth || {})) } catch (e) { dWarn("storage", "setActivityAuth_failed", { err: String(e?.message || e) }) }
}

function getActivityAuth() {
  try {
    const raw = localStorage.getItem("activity_auth")
    if (!raw) return null
    const a = JSON.parse(raw)
    if (!a?.accessToken) return null
    return a
  } catch (e) {
    dWarn("storage", "getActivityAuth_failed", { err: String(e?.message || e) })
    return null
  }
}

function setActivityUser(u) {
  try { localStorage.setItem("activity_user", JSON.stringify(u || {})) } catch (e) { dWarn("storage", "setActivityUser_failed", { err: String(e?.message || e) }) }
}

function getActivityUser() {
  try {
    const raw = localStorage.getItem("activity_user")
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    dWarn("storage", "getActivityUser_failed", { err: String(e?.message || e) })
    return null
  }
}

function hexToIntColor(colorHex) {
  if (typeof colorHex === "number") return Number(colorHex) >>> 0
  const s = String(colorHex || "").trim()
  if (!s) return 0
  if (s.startsWith("#")) return parseInt(s.slice(1), 16) >>> 0
  if (s.startsWith("0x") || s.startsWith("0X")) return parseInt(s.slice(2), 16) >>> 0
  return parseInt(s, 10) >>> 0
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
  const id = dReqId()
  const started = dMsNow()
  const u = typeof url === "string" ? url : String(url?.toString?.() ?? url)
  const method = (opts?.method || "GET").toUpperCase()
  const headers = opts?.headers ? (opts.headers instanceof Headers ? headersToObj(opts.headers) : opts.headers) : {}
  const meta = { id, t: dNowIso(), kind: info?.kind || "fetch", method, url: u, headers, info: info || null }

  dGroup(`[${meta.kind}] -> ${method} ${u}`, meta)
  dLog(meta.kind, "request_meta", meta)

  let res
  let text = ""
  try {
    res = await fetch(url, opts)
    const ended = dMsNow()
    meta.status = res.status
    meta.ok = res.ok
    meta.ms = Math.round(ended - started)
    meta.resHeaders = headersToObj(res.headers)
    dLog(meta.kind, "response_meta", { status: meta.status, ok: meta.ok, ms: meta.ms, headers: meta.resHeaders })

    text = await res.text().catch(() => "")
    meta.bodyLen = text.length
    const preview = text.length > 2000 ? text.slice(0, 2000) + `…(trunc ${text.length - 2000})` : text
    dLog(meta.kind, "response_text_preview", preview)

    const parsed = parseMaybeJson(text)
    if (parsed && parsed.raw === undefined) dLog(meta.kind, "response_json", parsed)

    dGroupEnd()
    return { id, res, text, data: parsed, meta }
  } catch (err) {
    const ended = dMsNow()
    meta.ms = Math.round(ended - started)
    meta.error = { message: String(err?.message || err), stack: err?.stack || null }
    dErr(meta.kind, "fetch_error", meta)
    dGroupEnd()
    throw err
  }
}

async function exchangeCodeForTokenViaApi(code, state) {
  const id = dReqId()
  const started = dMsNow()
  dGroup("[login] exchangeCodeForTokenViaApi start", { id, statePresent: Boolean(state), codePresent: Boolean(code), codeLen: String(code || "").length })
  const { res, data, meta } = await fetchDebug(
    `${GATEWAY_BASE}/oauth/exchange`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state })
    },
    { kind: "oauth_exchange", statePresent: Boolean(state), codeLen: String(code || "").length }
  )

  const ms = Math.round(dMsNow() - started)
  dLog("login", "exchange_response", { id, ms, status: res.status, ok: res.ok, hasToken: Boolean(data?.access_token) })

  if (!res.ok || !data?.access_token) {
    dErr("login", "token_exchange_failed", { id, status: meta.status, body: data })
    dGroupEnd()
    throw new Error(`token_exchange_failed ${res.status} ${dSafeJson(data)}`)
  }

  dGroupEnd()
  return String(data.access_token)
}

async function loginDiscordActivity() {
  const loginId = dReqId()
  const started = dMsNow()

  const clientId = getDiscordClientId()
  dGroup("[login] loginDiscordActivity start", { loginId, clientId, origin: location.origin, href: location.href, search: location.search })
  if (!clientId) {
    dErr("login", "missing_client_id", { loginId })
    dGroupEnd()
    throw new Error("missing_client_id")
  }

  dLog("login", "sdk_construct", { loginId, clientId })
  const discordSdk = new DiscordSDK(clientId)

  dLog("login", "sdk_ready_wait", { loginId })
  await discordSdk.ready()
  dLog("login", "sdk_ready_ok", { loginId })

  const state = dReqId()
  try { sessionStorage.setItem("oauth_state", state) } catch (e) { dWarn("login", "sessionStorage_set_oauth_state_failed", { loginId, err: String(e?.message || e) }) }

  const redirectUri = `https://1224715390362324992.discordsays.com/oauth/callback`
  dLog("login", "authorize_call", { loginId, redirectUri, scopes: ["identify", "guilds.members.read"], prompt: "none" })

  let code = ""
  try {
    const authzStarted = dMsNow()
    const out = await discordSdk.commands.authorize({
      client_id: clientId,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify", "guilds.members.read"]
    })
    code = out?.code ? String(out.code) : ""
    dLog("login", "authorize_ok", { loginId, ms: Math.round(dMsNow() - authzStarted), codePresent: Boolean(code), codeLen: code.length })
  } catch (e) {
    dErr("login", "authorize_failed", { loginId, message: String(e?.message || e), stack: e?.stack || null })
    dGroupEnd()
    throw e
  }

  const access_token = await exchangeCodeForTokenViaApi(code, state)
  dLog("login", "exchange_ok", { loginId, tokenLen: access_token.length })

  let auth = null
  try {
    const authStarted = dMsNow()
    dLog("login", "authenticate_call", { loginId })
    auth = await discordSdk.commands.authenticate({ access_token })
    dLog("login", "authenticate_ok", { loginId, ms: Math.round(dMsNow() - authStarted), hasUser: Boolean(auth?.user), hasAccessToken: Boolean(auth?.access_token) })
  } catch (e) {
    dErr("login", "authenticate_failed_call", { loginId, message: String(e?.message || e), stack: e?.stack || null })
    dGroupEnd()
    throw e
  }

  if (!auth?.user) {
    dErr("login", "authenticate_failed_no_user", { loginId, authKeys: auth ? Object.keys(auth) : null })
    dGroupEnd()
    throw new Error("authenticate_failed")
  }

  const u = {
    id: auth.user.id,
    username: auth.user.global_name || auth.user.username,
    avatar: auth.user.avatar,
    avatar_url: auth.user.avatar ? `https://cdn.discordapp.com/avatars/${auth.user.id}/${auth.user.avatar}.png?size=128` : ""
  }

  const guildId = discordSdk.guildId ? String(discordSdk.guildId) : ""
  const channelId = discordSdk.channelId ? String(discordSdk.channelId) : ""

  dLog("login", "sdk_context", { loginId, guildId, channelId, hasGuildId: Boolean(guildId), hasChannelId: Boolean(channelId) })

  setActivityUser(u)
  setActivityAuth({
    accessToken: access_token,
    guildId,
    channelId,
    clientId,
    at: dNowIso()
  })

  const ms = Math.round(dMsNow() - started)
  dLog("login", "login_done", { loginId, ms, user: { id: u.id, username: u.username, hasAvatar: Boolean(u.avatar) } })
  dGroupEnd()
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

async function pingBackend(inDiscord) {
  const reqId = dReqId()
  const user = await getUserForPayload(inDiscord)

  const payload = {
    type: "PING",
    payload: {
      from: "activity",
      at: dNowIso(),
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

  if (!res.ok) throw new Error(`PING failed: ${meta.status} ${dSafeJson(data)}`)
  return data
}

async function sessionStartBackend(inDiscord) {
  const reqId = dReqId()
  const userId = await getUserIdForAction(inDiscord)

  const payload = {
    type: "SESSION_START",
    payload: {
      from: "activity",
      at: dNowIso(),
      reqId,
      userId: userId || null
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

  if (!res.ok) throw new Error(`SESSION_START failed: ${meta.status} ${dSafeJson(data)}`)
  return data
}

async function sessionPauseBackend(inDiscord) {
  const reqId = dReqId()
  const userId = await getUserIdForAction(inDiscord)

  const payload = {
    type: "SESSION_PAUSE",
    payload: {
      from: "activity",
      at: dNowIso(),
      reqId,
      userId: userId || null
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

  if (!res.ok) throw new Error(`SESSION_PAUSE failed: ${meta.status} ${dSafeJson(data)}`)
  return data
}

async function resetBoardBackend(inDiscord) {
  const reqId = dReqId()
  const userId = await getUserIdForAction(inDiscord)

  const payload = {
    type: "RESET_BOARD",
    payload: {
      from: "activity",
      at: dNowIso(),
      reqId,
      userId
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

  if (!res.ok) throw new Error(`RESET_BOARD failed: ${meta.status} ${dSafeJson(data)}`)
  return data
}

async function snapshotBackend(inDiscord, region = null) {
  const reqId = dReqId()
  const userId = await getUserIdForAction(inDiscord)

  const payload = {
    type: "SNAPSHOT_CREATE",
    payload: {
      from: "activity",
      at: dNowIso(),
      reqId,
      userId,
      region: region || null
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

  if (!res.ok) throw new Error(`SNAPSHOT_CREATE failed: ${meta.status} ${dSafeJson(data)}`)
  return data
}

async function placePixelBackend(inDiscord, x, y, colorHexOrInt) {
  const reqId = dReqId()
  const user = await getUserForPayload(inDiscord)
  const color = hexToIntColor(colorHexOrInt)

  const payload = {
    type: "PLACE_PIXEL",
    payload: {
      from: "activity",
      at: dNowIso(),
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

  if (!res.ok) throw new Error(`PLACE_PIXEL failed: ${meta.status} ${dSafeJson(data)}`)
  return data
}

async function resolveUserHashBackend(userHash) {
  const reqId = dReqId()

  const payload = {
    type: "RESOLVE_USERHASH",
    payload: {
      from: "activity",
      at: dNowIso(),
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

  if (!res.ok) throw new Error(`RESOLVE_USERHASH failed: ${meta.status} ${dSafeJson(data)}`)
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

  if (!res.ok) throw new Error(`GET_BOARD failed: ${meta.status} ${dSafeJson(data)}`)
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

function guessSquareSizeByStride(n, stride) {
  const s = Math.floor(Math.sqrt(Math.max(0, Math.floor(n / Math.max(1, stride)))))
  if (s > 0 && s * s * stride === n) return s
  return null
}

function maxIso(a, b) {
  const A = a ? String(a) : ""
  const B = b ? String(b) : ""
  if (!A) return B || A
  if (!B) return A
  return (A > B) ? A : B
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
            <button class="btn" id="reload">Reload board</button>
            <button class="btn" id="clear">Clear local</button>
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

  dGroup("[run] bootstrap", {
    inDiscord,
    origin: location.origin,
    href: location.href,
    ua: navigator.userAgent,
    hasLocalStorage: (() => { try { localStorage.setItem("_t", "1"); localStorage.removeItem("_t"); return true } catch { return false } })(),
    hasSessionStorage: (() => { try { sessionStorage.setItem("_t", "1"); sessionStorage.removeItem("_t"); return true } catch { return false } })(),
    hasCryptoUuid: Boolean(globalThis.crypto?.randomUUID),
    hasDecompressionStream: typeof DecompressionStream !== "undefined"
  })
  dGroupEnd()

  async function attemptLogin() {
    const attemptId = dReqId()
    const started = dMsNow()
    dGroup("[login] attemptLogin start", { attemptId, inDiscord })

    if (!inDiscord) {
      dWarn("login", "not_in_discord", { attemptId })
      setUserSlotState({ type: "error", onRetry: attemptLogin })
      logLine("Open inside Discord to authenticate.")
      dGroupEnd()
      return
    }

    setUserSlotState({})

    try {
      const cached = getActivityUser()
      const cachedAuth = getActivityAuth()

      dLog("login", "cache_check", {
        attemptId,
        hasCachedUser: Boolean(cached?.id),
        hasCachedToken: Boolean(cachedAuth?.accessToken),
        cachedUser: cached ? { id: cached.id, username: cached.username, hasAvatar: Boolean(cached.avatar) } : null,
        cachedAuth: cachedAuth ? { hasToken: Boolean(cachedAuth.accessToken), guildId: cachedAuth.guildId || "", channelId: cachedAuth.channelId || "", clientId: cachedAuth.clientId || "", at: cachedAuth.at || "" } : null
      })

      if (cached?.id && cachedAuth?.accessToken) {
        dLog("login", "cache_hit_using_cached", { attemptId })
        setUserSlotState({ type: "user", user: cached })
        logLine("✅ Logged in (cached).")
        dGroupEnd()
        return
      }

      dLog("login", "cache_miss_start_fresh_login", { attemptId })
      logLine("⏳ Logging in...")
      const u = await loginDiscordActivity()
      setUserSlotState({ type: "user", user: u })
      logLine("✅ Logged in.")
      dLog("login", "attemptLogin_success", { attemptId, ms: Math.round(dMsNow() - started), user: { id: u.id, username: u.username } })
      dGroupEnd()
    } catch (e) {
      const msg = String(e?.message || e)
      dErr("login", "attemptLogin_failed", { attemptId, ms: Math.round(dMsNow() - started), message: msg, stack: e?.stack || null })
      logLine(msg)
      setUserSlotState({ type: "error", onRetry: attemptLogin })
      dGroupEnd()
    }
  }

  await attemptLogin()

  const palette = [
    "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff",
    "#888888", "#ff8800", "#8844ff", "#44ff88", "#ff4444", "#4444ff", "#222222", "#cccccc"
  ]

  const paletteRgb = palette.map((hex) => {
    const h = hex.replace("#", "")
    const r = parseInt(h.slice(0, 2), 16) | 0
    const g = parseInt(h.slice(2, 4), 16) | 0
    const b = parseInt(h.slice(4, 6), 16) | 0
    return { r, g, b }
  })

  const paletteKeyToIndex = new Map()
  for (let i = 0; i < paletteRgb.length; i++) {
    const c = paletteRgb[i]
    paletteKeyToIndex.set(`${c.r},${c.g},${c.b}`, i)
  }

  function nearestPaletteIndex(r, g, b) {
    const key = `${r},${g},${b}`
    const exact = paletteKeyToIndex.get(key)
    if (exact != null) return exact
    let bestI = 0
    let bestD = Infinity
    for (let i = 0; i < paletteRgb.length; i++) {
      const c = paletteRgb[i]
      const dr = r - c.r
      const dg = g - c.g
      const db = b - c.b
      const d = dr * dr + dg * dg + db * db
      if (d < bestD) {
        bestD = d
        bestI = i
      }
    }
    return bestI
  }

  const view = { zoom: 6, panX: 0, panY: 0 }
  const state = { selectedColor: 2, hover: null, isDragging: false, dragStart: null, hoverHash: 0, hoverTs: 0 }

  let sessionState = "RUNNING"

  let board = {
    w: 128,
    h: 128,
    pixels: new Uint8Array(128 * 128),
    metaHash: new Uint32Array(128 * 128),
    metaTs: new Uint32Array(128 * 128),
    colors: 16,
    cooldownMs: 10000
  }

  let chunkSize = 64

  const canvas = $("cv")
  const ctx = canvas.getContext("2d", { alpha: false })

  function setSessionState(next) {
    const before = sessionState
    sessionState = String(next || "").toUpperCase() === "PAUSED" ? "PAUSED" : "RUNNING"
    dLog("ui", "setSessionState", { before, after: sessionState })
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

  function idx(x, y) { return y * board.w + x }

  function getColorAt(x, y) { return board.pixels[idx(x, y)] ?? 1 }

  function getMetaAt(x, y) {
    const i = idx(x, y)
    return { userHash: board.metaHash[i] >>> 0, ts: board.metaTs[i] >>> 0 }
  }

  function ensureBoardSize(w, h) {
    const W = Math.max(1, Math.floor(Number(w || 0)))
    const H = Math.max(1, Math.floor(Number(h || 0)))
    if (W === board.w && H === board.h && board.pixels?.length === W * H) return

    const oldW = board.w
    const oldH = board.h
    const oldP = board.pixels
    const oldHh = board.metaHash
    const oldT = board.metaTs

    dLog("board", "ensureBoardSize_resize", { from: { w: oldW, h: oldH }, to: { w: W, h: H } })

    board.w = W
    board.h = H
    board.pixels = new Uint8Array(W * H)
    board.pixels.fill(1)
    board.metaHash = new Uint32Array(W * H)
    board.metaTs = new Uint32Array(W * H)

    if (oldP && oldP.length === oldW * oldH) {
      const copyW = Math.min(oldW, W)
      const copyH = Math.min(oldH, H)
      for (let y = 0; y < copyH; y++) {
        const src = y * oldW
        const dst = y * W
        board.pixels.set(oldP.subarray(src, src + copyW), dst)
        if (oldHh && oldHh.length === oldW * oldH) board.metaHash.set(oldHh.subarray(src, src + copyW), dst)
        if (oldT && oldT.length === oldW * oldH) board.metaTs.set(oldT.subarray(src, src + copyW), dst)
      }
    }
  }

  function ensureBoardAtLeast(w, h) {
    const W = Math.max(board.w, Math.max(1, Math.floor(Number(w || 0))))
    const H = Math.max(board.h, Math.max(1, Math.floor(Number(h || 0))))
    if (W !== board.w || H !== board.h) ensureBoardSize(W, H)
  }

  const userHashCache = new Map()
  let hoverResolveToken = 0

  function clearBoardLocal() {
    dLog("board", "clearBoardLocal", { pixels: board?.pixels?.length || 0, metaHash: board?.metaHash?.length || 0, metaTs: board?.metaTs?.length || 0 })
    if (board?.pixels?.length) board.pixels.fill(1)
    if (board?.metaHash?.length) board.metaHash.fill(0)
    if (board?.metaTs?.length) board.metaTs.fill(0)
    userHashCache.clear()
  }

  function applyChunkRgba(cx, cy, bytes, sz) {
    const ox = cx * sz
    const oy = cy * sz
    ensureBoardAtLeast(ox + sz, oy + sz)

    const maxW = board.w
    const w = Math.min(sz, Math.max(0, maxW - ox))
    const h = Math.min(sz, Math.max(0, board.h - oy))
    if (w <= 0 || h <= 0) return

    if (DEBUG_DEEP) dLog("chunk", "applyChunkRgba", { cx, cy, sz, bytesLen: bytes?.length || 0, ox, oy, w, h })

    for (let y = 0; y < h; y++) {
      const srcRow = y * sz * 4
      const dstRow = (oy + y) * maxW + ox
      for (let x = 0; x < w; x++) {
        const i = srcRow + x * 4
        const r = bytes[i + 0] | 0
        const g = bytes[i + 1] | 0
        const b = bytes[i + 2] | 0
        const a = bytes[i + 3] | 0
        const colorId = (a === 0) ? 1 : nearestPaletteIndex(r, g, b)
        board.pixels[dstRow + x] = colorId
      }
    }
  }

  function applyChunkMeta(cx, cy, bytes, sz) {
    const ox = cx * sz
    const oy = cy * sz
    ensureBoardAtLeast(ox + sz, oy + sz)

    const maxW = board.w
    const w = Math.min(sz, Math.max(0, maxW - ox))
    const h = Math.min(sz, Math.max(0, board.h - oy))
    if (w <= 0 || h <= 0) return

    if (DEBUG_DEEP) dLog("chunk", "applyChunkMeta", { cx, cy, sz, bytesLen: bytes?.length || 0, ox, oy, w, h })

    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let y = 0; y < h; y++) {
      const srcRow = y * sz * 8
      const dstRow = (oy + y) * maxW + ox
      for (let x = 0; x < w; x++) {
        const i = srcRow + x * 8
        const userHash = dv.getUint32(i + 0, true) >>> 0
        const ts = dv.getUint32(i + 4, true) >>> 0
        const di = dstRow + x
        board.metaHash[di] = userHash
        board.metaTs[di] = ts
      }
    }
  }

  async function applyServerChunk(c, wantMeta) {
    const cx = Number(c?.cx || 0)
    const cy = Number(c?.cy || 0)

    if (DEBUG_DEEP) dLog("chunk", "applyServerChunk", { cx, cy, wantMeta, hasData: Boolean(c?.dataGzipB64), hasMeta: Boolean(c?.metaGzipB64), updatedAt: c?.updatedAt || null, id: c?.id || null })

    if (c?.dataGzipB64) {
      const raw = await gunzipBytes(b64ToBytes(c.dataGzipB64))
      let sz = chunkSize
      const guessed = guessSquareSizeByStride(raw.length, 4)
      if (guessed) sz = guessed
      if (sz > 0) {
        chunkSize = sz
        applyChunkRgba(cx, cy, raw, sz)
      }
    }

    if (wantMeta && c?.metaGzipB64) {
      const raw = await gunzipBytes(b64ToBytes(c.metaGzipB64))
      let sz = chunkSize
      const guessed = guessSquareSizeByStride(raw.length, 8)
      if (guessed) sz = guessed
      if (sz > 0) applyChunkMeta(cx, cy, raw, sz)
    }
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

    if (DEBUG_DEEP) dLog("hover", "resolveHoverOwner_meta", { token, x: p.x, y: p.y, userHash: m.userHash >>> 0, ts: m.ts >>> 0 })

    if (!m.userHash) {
      setHoverUserText("-", "-")
      return
    }

    const cached = userHashCache.get(m.userHash)
    if (cached) {
      if (DEBUG_DEEP) dLog("hover", "resolveHoverOwner_cache_hit", { token, userHash: m.userHash >>> 0, cached })
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
      if (DEBUG_DEEP) dLog("hover", "resolveHoverOwner_resolved", { token, userHash: m.userHash >>> 0, norm, raw: data })
      setHoverUserText(norm.username || "-", norm.discordId || "-")
    } catch (e) {
      if (token !== hoverResolveToken) return
      dWarn("hover", "resolveHoverOwner_failed", { token, userHash: m.userHash >>> 0, err: String(e?.message || e) })
      setHoverUserText("-", "-")
    }
  }

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault()
    const before = screenToWorld(e.clientX, e.clientY)
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const prevZoom = view.zoom
    view.zoom = clamp(view.zoom * factor, 2, 80)
    const after = screenToWorld(e.clientX, e.clientY)
    const dxWorld = after.x - before.x
    const dyWorld = after.y - before.y
    view.panX += dxWorld * view.zoom
    view.panY += dyWorld * view.zoom
    dLog("ui", "wheel_zoom", { prevZoom, nextZoom: view.zoom, panX: view.panX, panY: view.panY })
    render()
  }, { passive: false })

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId)
    state.isDragging = true
    state.dragStart = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY }
    if (DEBUG_DEEP) dLog("ui", "pointerdown", { pointerId: e.pointerId, x: e.clientX, y: e.clientY, dragStart: state.dragStart })
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
      if (DEBUG_DEEP) dLog("ui", "drag_pan", { dx, dy, panX: view.panX, panY: view.panY })
    }

    render()
    if (prev !== next) resolveHoverOwner(state.hover)
  })

  canvas.addEventListener("pointerup", (e) => {
    if (DEBUG_DEEP) dLog("ui", "pointerup", { pointerId: e.pointerId })
    state.isDragging = false
    state.dragStart = null
  })

  let lastSince = new Date(0).toISOString()
  let placing = false
  let syncInFlight = null

  async function applyUpdateChunks(chunks, wantMeta) {
    dGroup(`[apply_update_chunks] n=${chunks?.length ?? 0}`, { time: dNowIso(), chunkSize, wantMeta })
    if (chunks?.length) {
      dLog("chunks", "first", chunks[0])
      dLog("chunks", "last", chunks[chunks.length - 1])
    }
    dGroupEnd()

    for (const c of (chunks || [])) {
      await applyServerChunk(c, wantMeta)
    }
  }

  function chunkViewportParams() {
    const left = Math.floor((-view.panX) / view.zoom) - 2
    const top = Math.floor((-view.panY) / view.zoom) - 2
    const right = Math.ceil((canvas.width - view.panX) / view.zoom) + 2
    const bottom = Math.ceil((canvas.height - view.panY) / view.zoom) + 2

    const vx0 = clamp(left, 0, board.w - 1)
    const vy0 = clamp(top, 0, board.h - 1)
    const vx1 = clamp(right, 0, board.w - 1)
    const vy1 = clamp(bottom, 0, board.h - 1)

    const minCx = Math.floor(vx0 / chunkSize)
    const maxCx = Math.floor(vx1 / chunkSize)
    const minCy = Math.floor(vy0 / chunkSize)
    const maxCy = Math.floor(vy1 / chunkSize)

    return { minCx, maxCx, minCy, maxCy }
  }

  async function quickGetBoardOnce(reason = "manual", wantMeta = true) {
    const started = dMsNow()
    const sinceBase = lastSince
    logLine("⏳ Fetching latest chunks...")

    const vp = chunkViewportParams()

    dGroup("[quick_get_board_once] start", { time: dNowIso(), reason, sinceBase, limit: 200, chunkSize, wantMeta, viewport: vp })

    let pageToken = null
    let maxSeen = sinceBase
    let changed = false
    let pages = 0
    let totalChunks = 0

    do {
      pages++
      const extra = { ...vp }
      if (wantMeta) extra.includeMeta = "true"

      const data = await getBoardBackend(inDiscord, sinceBase, 200, pageToken, extra)
      const chunks = Array.isArray(data?.chunks) ? data.chunks : []
      totalChunks += chunks.length

      dGroup(`[quick_get_board_once] page ${pages}`, {
        time: dNowIso(),
        since_used: sinceBase,
        sinceEcho: data?.sinceEcho ?? null,
        sinceEffectiveEcho: data?.sinceEffectiveEcho ?? null,
        serverNow: data?.serverNow ?? null,
        skewMs: data?.skewMs ?? null,
        returned: data?.returned ?? chunks.length,
        chunks_len: chunks.length,
        stoppedForSize: data?.stoppedForSize ?? null,
        approxBytes: data?.approxBytes ?? null,
        nextPageToken: data?.nextPageToken || null
      })
      if (chunks.length) {
        dLog("board", "first_chunk", chunks[0])
        dLog("board", "last_chunk", chunks[chunks.length - 1])
      }
      dGroupEnd()

      if (chunks.length) {
        await applyUpdateChunks(chunks, wantMeta)
        changed = true
      }

      for (const c of chunks) {
        if (c?.updatedAt) maxSeen = maxIso(maxSeen, c.updatedAt)
      }
      if (data?.serverNow) maxSeen = maxIso(maxSeen, data.serverNow)

      pageToken = data?.nextPageToken || null
    } while (pageToken)

    lastSince = maxSeen

    const ms = Math.round(dMsNow() - started)
    dGroup("[quick_get_board_once] done", { time: dNowIso(), ms, pages, totalChunks, changed, lastSince_after: lastSince, board: { w: board.w, h: board.h, chunkSize } })
    dGroupEnd()

    if (changed) {
      logLine("✅ Updated.")
      render()
      resolveHoverOwner(state.hover)
    } else {
      logLine("✅ No changes.")
    }

    return { changed, totalChunks, pages, ms }
  }

  async function syncBoardOnce(reason = "after_action", wantMeta = true) {
    if (syncInFlight) return syncInFlight
    syncInFlight = (async () => {
      try {
        return await quickGetBoardOnce(reason, wantMeta)
      } finally {
        syncInFlight = null
      }
    })()
    return syncInFlight
  }

  async function fullReloadFromServerless() {
    logLine("⏳ Reloading board from serverless...")
    dGroup("[full_reload_from_serverless] start", { time: dNowIso(), lastSince_before: lastSince, board_before: { w: board.w, h: board.h, chunkSize, colors: board.colors, cooldownMs: board.cooldownMs } })
    dGroupEnd()

    clearBoardLocal()
    lastSince = new Date(0).toISOString()

    await syncBoardOnce("full_reload", true)

    dGroup("[full_reload_from_serverless] done", { time: dNowIso(), board_after: { w: board.w, h: board.h, chunkSize, colors: board.colors, cooldownMs: board.cooldownMs }, lastSince_after: lastSince })
    dGroupEnd()

    logLine("✅ Board reloaded.")
    $("fit").click()
    render()
    resolveHoverOwner(state.hover)
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

    const picked = palette[state.selectedColor]
    const colorInt = hexToIntColor(picked)

    dGroup(`[ui_click_place] ${p.x},${p.y}`, {
      time: dNowIso(),
      inDiscord,
      sessionState,
      selectedColorId: state.selectedColor,
      selectedColorHex: picked,
      selectedColorInt: colorInt >>> 0,
      board: { w: board.w, h: board.h, chunkSize, colors: board.colors, cooldownMs: board.cooldownMs },
      view: { ...view },
      hover: state.hover
    })
    dGroupEnd()

    try {
      const rr = await placePixelBackend(inDiscord, p.x, p.y, picked)
      dGroup(`[place_pixel_result] ${p.x},${p.y}`, { time: dNowIso(), result: rr })
      dGroupEnd()

      logLine(`✅ Place requested @ ${p.x},${p.y}. Syncing from server...`)
      await syncBoardOnce("after_place_pixel", true)
    } catch (err) {
      dErr("place", "place_pixel_error", { time: dNowIso(), message: String(err?.message || err), stack: err?.stack || null })
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
        dLog("ui", "palette_select", { time: dNowIso(), prev: state.selectedColor, next: i })
        state.selectedColor = i
        buildPalette()
        render()
      }
      wrap.appendChild(b)
    })
  }

  $("fit").onclick = () => {
    const fitZoom = Math.min(canvas.width / board.w, canvas.height / board.h)
    const prevZoom = view.zoom
    view.zoom = clamp(Math.floor(fitZoom), 2, 80)
    view.panX = (canvas.width - board.w * view.zoom) / 2
    view.panY = (canvas.height - board.h * view.zoom) / 2
    dLog("ui", "fit", { prevZoom, nextZoom: view.zoom, panX: view.panX, panY: view.panY, board: { w: board.w, h: board.h } })
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
      await syncBoardOnce("reload_button", true)
    } catch (e) {
      dErr("ui", "reload_button_error", { time: dNowIso(), message: String(e?.message || e), stack: e?.stack || null })
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
        logLine("✅ Snapshot requested. Syncing from server...")
        await syncBoardOnce("after_snapshot", true)
        logLine("✅ Snapshot done.")
      } catch (e) {
        dErr("ui", "snapshot_error", { time: dNowIso(), message: String(e?.message || e), stack: e?.stack || null })
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
    dLog("ui", "clear_local", { time: dNowIso(), board: { w: board.w, h: board.h, pixels: board.pixels?.length, metaHash: board.metaHash?.length, metaTs: board.metaTs?.length } })
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
        dErr("ui", "reset_board_error", { time: dNowIso(), message: String(e?.message || e), stack: e?.stack || null })
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
        dLog("session", "session_start_result", { time: dNowIso(), result: data })
        logLine(`✅ Session started.${data?.ok === false ? " (server returned ok=false)" : ""}`)
        await syncBoardOnce("after_session_start", true)
      } catch (e) {
        dErr("session", "session_start_error", { time: dNowIso(), message: String(e?.message || e), stack: e?.stack || null })
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
        dLog("session", "session_pause_result", { time: dNowIso(), result: data })
        logLine(`✅ Session paused.${data?.ok === false ? " (server returned ok=false)" : ""}`)
        await syncBoardOnce("after_session_pause", true)
      } catch (e) {
        dErr("session", "session_pause_error", { time: dNowIso(), message: String(e?.message || e), stack: e?.stack || null })
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
        await syncBoardOnce("after_ping", true)
      } catch (err) {
        dErr("ui", "ping_error", { time: dNowIso(), message: String(err?.message || err), stack: err?.stack || null })
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
      logLine("⏳ Loading board from server...")
      dLog("startup", "startup_load_board_start", { time: dNowIso() })
      await fullReloadFromServerless()
      dLog("startup", "startup_load_board_done", { time: dNowIso() })
    } catch (e) {
      dErr("startup", "startup_load_board_error", { time: dNowIso(), message: String(e?.message || e), stack: e?.stack || null })
      logLine(String(e?.message || "⚠️ server /board unreachable"))
      $("fit").click()
      render()
      resolveHoverOwner(state.hover)
    }
  })()
}

run().catch(showFatal)