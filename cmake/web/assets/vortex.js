(function initializeHypersomniaVortexAdapter() {
  "use strict";

  const declaredEvents = new Set([
    "hypersomnia.gameplay.entered",
    "hypersomnia.session.joined"
  ]);
  const pendingEvents = [];
  const observedMarkers = new Set();
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  let clientPromise;
  let context;
  let runtimeConfig;
  let reconnectTimer;
  let reconnectDelay = 1000;

  function createPanel() {
    const panel = document.createElement("aside");
    panel.id = "vortex-runtime-panel";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = [
      '<span class="vortex-dot" aria-hidden="true"></span>',
      '<span id="vortex-runtime-status">Connecting to Vortex…</span>',
      '<a href="/legal/source" target="_blank" rel="noopener noreferrer">Source &amp; license</a>',
      '<button id="vortex-runtime-reconnect" type="button" hidden>Reconnect</button>',
      '<button id="vortex-runtime-return" type="button" hidden>Return to Vortex</button>'
    ].join("");
    document.body.append(panel);
    return panel;
  }

  const panel = createPanel();
  const statusElement = panel.querySelector("#vortex-runtime-status");
  const reconnectButton = panel.querySelector("#vortex-runtime-reconnect");
  const returnButton = panel.querySelector("#vortex-runtime-return");

  function setStatus(mode, label, title = "") {
    panel.dataset.mode = mode;
    statusElement.textContent = label;
    panel.title = title;
    reconnectButton.hidden = mode !== "error";
    returnButton.hidden = mode !== "connected";
  }

  function isLocalHostname(hostname) {
    return localHosts.has(hostname) || hostname.endsWith(".localhost");
  }

  function validateConfig(value) {
    if (!value || value.enabled !== true || typeof value.vortexOrigin !== "string" || typeof value.sdkUrl !== "string") {
      return null;
    }

    const vortexUrl = new URL(value.vortexOrigin);
    const sdkUrl = new URL(value.sdkUrl);
    const local = isLocalHostname(vortexUrl.hostname);
    const safeProtocol = vortexUrl.protocol === "https:" || (local && vortexUrl.protocol === "http:");
    if (
      !safeProtocol
      || vortexUrl.username
      || vortexUrl.password
      || vortexUrl.pathname !== "/"
      || vortexUrl.search
      || vortexUrl.hash
      || sdkUrl.origin !== vortexUrl.origin
      || sdkUrl.username
      || sdkUrl.password
      || sdkUrl.pathname !== "/sdk/v1/vortex-game-sdk.js"
      || sdkUrl.search
      || sdkUrl.hash
    ) {
      throw new Error("Vortex supplied an unsafe SDK URL");
    }

    return { vortexOrigin: vortexUrl.origin, sdkUrl: sdkUrl.href };
  }

  async function fetchRuntimeConfig() {
    const response = await fetch("/api/vortex/config", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error("Vortex runtime config is unavailable");
    return validateConfig(await response.json());
  }

  async function getClient() {
    if (clientPromise) return clientPromise;
    clientPromise = (async () => {
      runtimeConfig = runtimeConfig ?? await fetchRuntimeConfig();
      if (!runtimeConfig) return null;
      const sdk = await import(runtimeConfig.sdkUrl);
      if (typeof sdk.createVortexGameClient !== "function") {
        throw new Error("Vortex SDK module is invalid");
      }
      return sdk.createVortexGameClient({
        vortexOrigin: runtimeConfig.vortexOrigin,
        onSessionExpired: () => {
          context = undefined;
          setStatus("error", "Vortex session needs reconnecting");
          scheduleReconnect();
        },
        onError: (error) => {
          if (error && error.retryable) scheduleReconnect(error.retryAfterMs);
        }
      });
    })().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
    return clientPromise;
  }

  function scheduleReconnect(requestedDelay) {
    if (reconnectTimer) return;
    const delay = Number.isFinite(requestedDelay) ? Math.max(500, Math.min(requestedDelay, 30000)) : reconnectDelay;
    reconnectTimer = window.setTimeout(async () => {
      reconnectTimer = undefined;
      try {
        await connect();
      }
      catch {
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        scheduleReconnect();
      }
    }, delay);
  }

  function emitNow(client, eventKey) {
    client.events.track(eventKey, {}, { version: 1, value: 1 });
  }

  function flushPending(client) {
    while (pendingEvents.length > 0) {
      emitNow(client, pendingEvents.shift());
    }
  }

  async function connect() {
    try {
      runtimeConfig = runtimeConfig ?? await fetchRuntimeConfig();
      if (!runtimeConfig) {
        setStatus("standalone", "Standalone mode");
        return { mode: "standalone", context: null };
      }
      const client = await getClient();
      if (!client) {
        setStatus("standalone", "Standalone mode");
        return { mode: "standalone", context: null };
      }
      context = await client.auth.context();
      reconnectDelay = 1000;
      const displayName = context.user.displayName || context.user.handle;
      setStatus(
        "connected",
        `Vortex · ${displayName}`,
        `Vortex player @${context.user.handle}\nPairwise player id: ${context.user.id}`
      );
      flushPending(client);
      return { mode: "connected", context };
    }
    catch (error) {
      setStatus("error", "Vortex reconnecting…", error instanceof Error ? error.message : "Vortex connection failed");
      scheduleReconnect(error && error.retryAfterMs);
      throw error;
    }
  }

  function safeNickname(playerContext) {
    const raw = String(playerContext.user.displayName || playerContext.user.handle || "Vortex Player")
      .normalize("NFKC")
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const fallback = String(playerContext.user.handle || "Vortex Player").trim() || "Vortex Player";
    const bytes = new TextEncoder().encode(raw || fallback);
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 40)).replace(/\uFFFD+$/g, "").trim() || "Vortex Player";
  }

  function readJsonFile(FS, filename) {
    try {
      return JSON.parse(FS.readFile(filename, { encoding: "utf8" }));
    }
    catch {
      return {};
    }
  }

  async function applyIdentity(FS) {
    if (!context) return false;
    const nickname = safeNickname(context);
    FS.mkdirTree("/user/conf.d");
    FS.writeFile("/user/conf.d/00-vortex-identity.json", JSON.stringify({
      prompted_for_sign_in_once: true,
      client: {
        use_account_nickname: false,
        use_account_avatar: false,
        nickname
      }
    }));

    const runtimePath = "/user/runtime_prefs.json";
    const runtime = readJsonFile(FS, runtimePath);
    runtime.prompted_for_sign_in_once = true;
    runtime.client = runtime.client && typeof runtime.client === "object" ? runtime.client : {};
    runtime.client.use_account_nickname = false;
    runtime.client.use_account_avatar = false;
    runtime.client.nickname = nickname;
    runtime.client.avatar_image_path = "";
    FS.writeFile(runtimePath, JSON.stringify(runtime));

    for (const path of ["/user/cached_auth.json", "/user/cached_avatar.png"]) {
      try { FS.unlink(path); }
      catch { /* Missing legacy game-account state is expected. */ }
    }
    return true;
  }

  function track(eventKey) {
    if (!declaredEvents.has(eventKey)) throw new Error(`Undeclared Vortex event: ${eventKey}`);
    if (!context) {
      if (pendingEvents.length < 20) pendingEvents.push(eventKey);
      return null;
    }
    void getClient().then((client) => {
      if (client) emitNow(client, eventKey);
    });
    return true;
  }

  function trackObserved(eventKey, marker) {
    const observation = `${eventKey}:${marker}`;
    if (observedMarkers.has(observation)) return false;
    observedMarkers.add(observation);
    track(eventKey);
    return true;
  }

  async function within(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((resolve) => window.setTimeout(resolve, timeoutMs))
    ]);
  }

  async function returnToVortex() {
    const client = await getClient();
    if (!client || !runtimeConfig) return;
    returnButton.disabled = true;
    try {
      await within(client.events.flush(), 2000);
      await within(client.play.end("quit"), 2000);
      client.navigation.returnToVortex("/");
    }
    catch {
      window.location.assign(`${runtimeConfig.vortexOrigin}/`);
    }
  }

  const ready = connect().catch(() => ({ mode: "error", context: null }));
  reconnectButton.addEventListener("click", () => void connect());
  returnButton.addEventListener("click", () => void returnToVortex());

  window.hypersomniaVortex = {
    applyIdentity,
    ready,
    returnToVortex,
    track,
    trackObserved
  };
})();
