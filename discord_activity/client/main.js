import "./style.css"
import { DiscordSDK } from "@discord/embedded-app-sdk"
console.log("MAIN.JS VERSION = PING_BTN_V1", new Date().toISOString());
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
  const msg = String(e?.reason?.message || e?.reason || "");
  if (msg.includes("session_paused") || msg.includes("admin_only") || msg.includes("cooldown")) {
    console.warn("Non-fatal rejection:", e.reason);
    return;
  }
  showFatal(e.reason);
});


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
async function pingBackend() {
  console.log("window.location.href:", window.location.href);
  console.log("window.location.origin:", window.location.origin);
  const res = await fetch("https://1224715390362324992.discordsays.com/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "PING",
      payload: { from: "activity", at: new Date().toISOString() }
    })
  });

  const data = await res.json();
  console.log("Backend response:", data);
  return data;
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
async function checkIsAdmin() {
  const r = await fetch("/api/user/isAdmin", {
    method: "GET",
    credentials: "include",
  });

  if (!r.ok) throw new Error(`isAdmin failed: ${r.status}`);
  return r.json();
}

async function loginDiscordActivity() {
  console.log(JSON.stringify({ t: new Date().toISOString(), event: "login_start", href: location.href, origin: location.origin, search: location.search }))
  const cfg = await api("/api/auth/config")
  if (!cfg.res.ok || !cfg.data?.clientId) throw new Error("missing_client_id")

  console.log(JSON.stringify({ t: new Date().toISOString(), event: "config_loaded", clientId: cfg.data.clientId, clientIdLen: String(cfg.data.clientId).length }))

  const discordSdk = new DiscordSDK(cfg.data.clientId)
  await discordSdk.ready()
  console.log(JSON.stringify({ t: new Date().toISOString(), event: "sdk_ready" }))

  const authz = await discordSdk.commands.authorize({
    client_id: cfg.data.clientId,
    response_type: "code",
    state: "",
    prompt: "consent",
    scope: ["identify"]
  })

  console.log(JSON.stringify({ t: new Date().toISOString(), event: "authorize_done", code_present: Boolean(authz?.code), code_len: String(authz?.code || "").length }))

  const tokenRes = await api("/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: authz.code })
  })

  if (!tokenRes.res.ok || !tokenRes.data?.access_token) {
    const d = tokenRes.data ? JSON.stringify(tokenRes.data) : ""
    throw new Error(`token_exchange_failed ${d}`)
  }

  console.log(JSON.stringify({ t: new Date().toISOString(), event: "token_ok", access_token_len: String(tokenRes.data.access_token).length }))

  const auth = await discordSdk.commands.authenticate({ access_token: tokenRes.data.access_token })
  console.log(JSON.stringify({ t: new Date().toISOString(), event: "authenticate_done", user_present: Boolean(auth?.user) }))

  if (!auth?.user) throw new Error("authenticate_failed")

  const u = {
    id: auth.user.id,
    username: auth.user.global_name || auth.user.username,
    avatar: auth.user.avatar,
    avatar_url: auth.user.avatar ? `https://cdn.discordapp.com/avatars/${auth.user.id}/${auth.user.avatar}.png?size=128` : ""
  }

  localStorage.setItem("activity_user", JSON.stringify(u))
  console.log(JSON.stringify({ t: new Date().toISOString(), event: "user_saved", id: u.id, username: u.username }))
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

  // --- UI wiring ---
const btn = document.getElementById("ping-btn");
const out = document.getElementById("ping-output");

if (btn && out) {
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Ping...";
    out.textContent = "";

    try {
      const data = await pingBackend();
      out.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
      console.error(err);
      out.textContent = `Erreur: ${err?.message ?? String(err)}`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Ping Backend";
    }
  });
}

  async function apiWithUser(path, opts = {}) {
    const headers = new Headers(opts.headers || {});
    if (inDiscord) {
      const u = await getActivityUser();
      if (u?.id) headers.set("x-user-id", u.id);
    }
    return api(path, { ...opts, headers });
  }
  function setDisabled(id, disabled, title) {
    const el = $(id)
    if (!el) return
    el.disabled = disabled
    el.style.opacity = disabled ? "0.5" : "1"
    el.style.cursor = disabled ? "not-allowed" : "pointer"
    el.title = disabled ? (title || "") : ""
  }
  function setHidden(id, hidden) {
    const el = $(id);
    if (!el) return;
    el.style.display = hidden ? "none" : "";
  }
  function applyRoleUI(isAdmin) {
  window.__canPlace = true;

  setHidden("reload", false);
  setHidden("start", !isAdmin);
  setHidden("pause", !isAdmin);
  setHidden("resetSession", !isAdmin);
  setHidden("snapshot", !isAdmin);
  setHidden("clear", !isAdmin);

  const brand = document.querySelector(".brandTitle");
  if (brand) brand.textContent = isAdmin ? "r/place viewer (ADMIN)" : "r/place viewer";
  }

  async function attemptLogin() {
    console.log(JSON.stringify({ t: new Date().toISOString(), event: "attempt_login", inDiscord }))

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
      console.log(JSON.stringify({ t: new Date().toISOString(), event: "cache", present: Boolean(cached?.id) }))
      if (cached?.id) {
        setUserSlotState({ type: "user", user: cached })
        return
      }
      const u = await loginDiscordActivity()
      setUserSlotState({ type: "user", user: u })
    } catch (e) {
      console.log(JSON.stringify({ t: new Date().toISOString(), event: "login_error", message: String(e?.message || e), stack: String(e?.stack || "") }))
      logLine(String(e?.message || e))
      setUserSlotState({ type: "error", onRetry: attemptLogin })
    }
  }

  await attemptLogin();

  const r = await apiWithUser("/api/user/isAdmin");
  const isAdmin = Boolean(r.data?.isAdmin);

  console.log("isAdmin =", isAdmin);

  window.__isAdmin = isAdmin;
  applyRoleUI(isAdmin);

  const palette = [
    "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff",
    "#888888", "#ff8800", "#8844ff", "#44ff88", "#ff4444", "#4444ff", "#222222", "#cccccc"
  ]

  const view = { zoom: 6, panX: 0, panY: 0 }
  const state = { selectedColor: 2, hover: null, isDragging: false, dragStart: null }

  let board = { w: 100, h: 100, pixels: new Uint8Array(100 * 100), colors: 16, cooldownMs: 10000 }

  const canvas = $("cv")
  const ctx = canvas.getContext("2d", { alpha: false })
  async function getUserIdForServer() {
  if (!inDiscord) return null;
  const u = await getActivityUser();
  return u?.id || null;
}

async function postAdmin(path) {
  const uid = await getUserIdForServer();
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: uid ? { "x-user-id": uid } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} failed (${res.status}) ${JSON.stringify(data)}`);
  return data;
}


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

  function hexToRgba(hex, a) {
    const h = hex.replace("#", "")
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${a})`
  }

  function getColorAt(x, y) {
    return board.pixels[y * board.w + x] ?? 1
  }

  function setColorAt(x, y, colorId) {
    board.pixels[y * board.w + x] = colorId
  }

  async function loadBoard() {
    const res = await fetch("/api/board", { credentials: "include" })
    if (!res.ok) throw new Error(`GET /api/board failed (${res.status})`)
    const data = await res.json()
    board.w = data.w
    board.h = data.h
    board.colors = data.colors
    board.cooldownMs = data.cooldownMs
    board.pixels = Uint8Array.from(data.pixels)
    logLine("✅ Board loaded from server.")
  }

  async function placePixel(x, y, color) {
    const res = await fetch("/api/pixel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ x, y, color })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 429) {
        logLine(`⏳ Cooldown. Retry in ${Math.ceil((data.retryAfterMs || 0) / 1000)}s`);
        return { ok: false, reason: "cooldown" };
      }

      if (res.status === 423 && data?.error === "session_paused") {
        logLine("⏸️ Session is paused. You can't place pixels right now.");
        return { ok: false, reason: "paused" };
      }

      if (res.status === 403 && data?.error === "admin_only") {
        logLine("⛔ Admin only.");
        return { ok: false, reason: "admin_only" };
      }
      throw new Error(`POST /api/pixel failed (${res.status}) ${JSON.stringify(data)}`);
    }

    setColorAt(x, y, color);
    return { ok: true };
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
    const vy1 = clamp(bottom, 0, board.w - 1)

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
    state.hover = worldPixelFromEvent(e)
    if (state.isDragging) {
      const dx = e.clientX - state.dragStart.x
      const dy = e.clientY - state.dragStart.y
      view.panX = state.dragStart.panX + dx
      view.panY = state.dragStart.panY + dy
    }
    render()
  })

  canvas.addEventListener("pointerup", () => {
    state.isDragging = false
    state.dragStart = null
  })

  canvas.addEventListener("click", async (e) => {
    if (state.isDragging) return;
    const p = worldPixelFromEvent(e);
    if (!p) return;

    try {
      const r = await placePixel(p.x, p.y, state.selectedColor);
      if (r.ok) logLine(`🟦 Placed pixel @ ${p.x},${p.y} color=${state.selectedColor}`);
    } catch (err) {
      logLine(String(err?.message || err));
    }

    render();
  });


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
    try {
      await loadBoard()
      render()
    } catch (e) {
      showFatal(e)
    }
  }

  $("clear").onclick = () => {
    board.pixels.fill(1)
    logLine("🧹 Cleared locally.")
    render()
  }
  $("start").onclick = async () => {
    try { await postAdmin("/api/session/start"); logLine("🟢 Session started"); }
    catch (e) { logLine(String(e?.message || e)); }
  };

  $("pause").onclick = async () => {
    try { await postAdmin("/api/session/pause"); logLine("⏸️ Session paused"); }
    catch (e) { logLine(String(e?.message || e)); }
  };

  $("resetSession").onclick = async () => {
    try { await postAdmin("/api/session/reset"); logLine("🔁 Session reset"); await loadBoard(); render(); }
    catch (e) { logLine(String(e?.message || e)); }
  };

  $("snapshot").onclick = async () => {
    try {
      const data = await postAdmin("/api/snapshot");
      // afficher dans un nouvel onglet (debug)
      window.open(data.dataUrl, "_blank");
      logLine("📸 Snapshot generated");
    } catch (e) {
      logLine(String(e?.message || e));
    }
  };

  buildPalette()

  ;(async () => {
    try {
      await loadBoard()
    } catch (e) {
      logLine(String(e?.message || "⚠️ /api/board unreachable. Start server + Vite proxy."))
    }
    $("fit").click()
    render()
  })()
}

try {
  run()
} catch (e) {
  showFatal(e)
}
