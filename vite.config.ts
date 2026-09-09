// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { fileURLToPath } from "node:url";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Node's CommonJS `events` module is the base class of every avatar/LiveKit
// emitter; bundled, it could evaluate after its subclasses ("Class extends
// value undefined"). Client builds use a plain ESM implementation instead.
const eventsShim = fileURLToPath(new URL("./src/lib/node-events.ts", import.meta.url));

/** Forces every `events` import in browser bundles onto the ESM shim. */
const eventsShimPlugin = {
  name: "ravi-events-shim",
  enforce: "pre" as const,
  resolveId(source: string, _importer: string | undefined, options?: { ssr?: boolean }) {
    if (options?.ssr) return null;
    return source === "events" || source === "node:events" ? eventsShim : null;
  },
};

export default defineConfig({
  plugins: [eventsShimPlugin],

  // ⭐ رفع خطای 502: Override کردن Nitro preset
  // @lovable.dev/vite-tanstack-config به صورت پیش‌فرض از cloudflare استفاده می‌کند
  // ما آن را به node-server تغییر می‌دهیم و 0.0.0.0 را تنظیم می‌کنیم
  nitro: {
    preset: "node-server",
    devServer: {
      host: "0.0.0.0",
      port: 5173,
    },
    runtimeConfig: {
      nitro: {
        port: process.env.PORT || 3000,
        host: "0.0.0.0",
      },
    },
    routeRules: {
      "/api/liveavatar/**": {
        proxy: "https://api.liveavatar.com/**",
      },
    },
  },

  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // تنظیمات development server
    server: {
      host: "0.0.0.0", // مهم: برای دسترسی از شبکه
      port: 5173,
      strictPort: false,
    },
    // تنظیمات preview server
    preview: {
      host: "0.0.0.0",
      port: Number(process.env.PORT) || 3000,
      strictPort: false,
    },
    optimizeDeps: {
      // Both SDKs ship CommonJS deps; pre-bundling them keeps their base classes
      // defined before subclasses evaluate.
      include: ["@heygen/streaming-avatar", "@heygen/liveavatar-web-sdk"],
      esbuildOptions: { alias: { events: eventsShim, "node:events": eventsShim } },
    },



    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            // The avatar SDKs and their shared CommonJS dependencies must stay in
            // ONE chunk: split across chunks, a shared base class evaluated as
            // `undefined` and the stage crashed with "Class extends value undefined".
            if (
              /node_modules\/(@heygen\/(liveavatar-web-sdk|streaming-avatar)|livekit-client|typed-emitter|webrtc-issue-detector|events|sdp-transform|ts-debounce|loglevel|rtcstats)\//.test(
                id,
              )
            ) {
              return "avatar-sdk";
            }
            return undefined;
          },
        },
      },
    },
  },
});

