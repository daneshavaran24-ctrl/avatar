type LiveAvatarModule = typeof import("@heygen/liveavatar-web-sdk");

const UMD_URL = "https://cdn.jsdelivr.net/npm/@heygen/liveavatar-web-sdk@0.0.18/dist/index.umd.js";

/** Minimal Node-style EventEmitter the UMD build expects on `globalThis`. */
function eventsShim() {
  type Handler = (...args: unknown[]) => void;
  class EventEmitter {
    private handlers = new Map<string, Set<Handler>>();
    on(event: string, handler: Handler) {
      const set = this.handlers.get(event) ?? new Set<Handler>();
      set.add(handler);
      this.handlers.set(event, set);
      return this;
    }
    addListener(event: string, handler: Handler) {
      return this.on(event, handler);
    }
    once(event: string, handler: Handler) {
      const wrapped = (...args: unknown[]) => {
        this.off(event, wrapped);
        handler(...args);
      };
      return this.on(event, wrapped);
    }
    off(event: string, handler: Handler) {
      this.handlers.get(event)?.delete(handler);
      return this;
    }
    removeListener(event: string, handler: Handler) {
      return this.off(event, handler);
    }
    removeAllListeners(event?: string) {
      if (event) this.handlers.delete(event);
      else this.handlers.clear();
      return this;
    }
    listenerCount(event: string) {
      return this.handlers.get(event)?.size ?? 0;
    }
    listeners(event: string) {
      return [...(this.handlers.get(event) ?? [])];
    }
    setMaxListeners() {
      return this;
    }
    emit(event: string, ...args: unknown[]) {
      const set = this.handlers.get(event);
      if (!set?.size) return false;
      for (const handler of [...set]) handler(...args);
      return true;
    }
  }
  return { EventEmitter, default: EventEmitter };
}

let cached: Promise<LiveAvatarModule> | null = null;

function loadFromCdn(): Promise<LiveAvatarModule> {
  return new Promise((resolve, reject) => {
    const scope = globalThis as Record<string, unknown>;
    // The UMD bundle reads `events` off the global scope; browsers have no such
    // module, so a tiny compatible emitter is provided before it evaluates.
    scope["events$1"] ??= eventsShim();
    scope["events"] ??= scope["events$1"];
    const existing = scope["LiveAvatarSDK"] as LiveAvatarModule | undefined;
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement("script");
    script.src = UMD_URL;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      const mod = (globalThis as Record<string, unknown>)["LiveAvatarSDK"] as
        | LiveAvatarModule
        | undefined;
      if (mod) resolve(mod);
      else reject(new Error("LIVEAVATAR_UMD_EMPTY"));
    };
    script.onerror = () => reject(new Error("LIVEAVATAR_UMD_LOAD_FAILED"));
    document.head.appendChild(script);
  });
}

/**
 * Loads the LiveAvatar SDK. The bundled ESM build is tried first; if its
 * dependency graph fails to initialise in the browser, the vendor's official
 * standalone build is loaded instead so the live session still connects.
 */
export function loadLiveAvatarSdk(): Promise<LiveAvatarModule> {
  cached ??= (async () => {
    try {
      const mod = await import("@heygen/liveavatar-web-sdk");
      if (!mod?.LiveAvatarSession) throw new Error("LIVEAVATAR_ESM_EMPTY");
      return mod;
    } catch (error) {
      console.warn("LiveAvatar bundled SDK unavailable, using vendor build", error);
      return loadFromCdn();
    }
  })().catch((error) => {
    cached = null;
    throw error;
  });
  return cached;
}
