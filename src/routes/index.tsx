import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Info, Loader2, Mic, MicOff, MessageSquare, Send, ShieldCheck, Settings2, X } from "lucide-react";

import { AvatarErrorBoundary } from "@/components/ravi/AvatarErrorBoundary";
import { AvatarOrb, SpeakingBars } from "@/components/ravi/AvatarOrb";
import type { AvatarStreamerHandle } from "@/components/ravi/AvatarStreamer";
import { Transcript } from "@/components/ravi/Transcript";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";
import {
  askRavi,
  beginSession,
  requestAvatarSession,
  speakPersian,
  transcribeSpeech,
} from "@/lib/ravi/api.functions";
import { splitSpeechChunks, toSpeechText } from "@/lib/ravi/persian-speech";

import {
  AVATAR_STATE_LABELS,
  GENERIC_ERROR_FA,
  type AvatarState,
  type TranscriptTurn,
} from "@/lib/ravi/types";

const AvatarStreamer = lazy(() => import("@/components/ravi/AvatarStreamer"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "راوی‌استان | دستیار هوشمند گفتگومحور سازمانی" },
      {
        name: "description",
        content:
          "راوی‌استان، دستیار هوشمند فارسی‌زبان با آواتار زنده که بر پایهٔ اسناد و دانش سازمان شما پاسخ می‌دهد.",
      },
      { property: "og:title", content: "راوی‌استان | دستیار هوشمند گفتگومحور سازمانی" },
      {
        property: "og:description",
        content:
          "گفتگوی زندهٔ صوتی و متنی با دستیار هوشمند سازمانی، متکی بر پایگاه دانش داخلی.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RaviStage,
});

type Credentials = {
  token: string;
  avatarId: string | null;
  voiceId: string | null;
  avatarName: string | null;
  voiceName: string | null;
  vendor: "heygen" | "liveavatar";
};

/** Last-resort voice: only used when the Persian gateway voice is unavailable. */
function speakWithBrowser(text: string, onEnd: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onEnd();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  const persian = window.speechSynthesis
    .getVoices()
    .find((item) => item.lang?.toLowerCase().startsWith("fa"));
  if (persian) utterance.voice = persian;
  utterance.lang = "fa-IR";
  utterance.rate = 1;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

/** Sentence-group split so the first audio chunk starts playing quickly. */
function chunkForSpeech(text: string, maxChars = 340): string[] {
  return splitSpeechChunks(toSpeechText(text), maxChars).slice(0, 12);
}


function playBase64Audio(base64: string, mime: string, element: HTMLAudioElement) {
  return new Promise<void>((resolve, reject) => {
    element.src = `data:${mime};base64,${base64}`;
    element.onended = () => resolve();
    element.onerror = () => reject(new Error("AUDIO_PLAYBACK_FAILED"));
    void element.play().catch(reject);
  });
}


function RaviStage() {
  const startSessionFn = useServerFn(beginSession);
  const askFn = useServerFn(askRavi);
  const avatarSessionFn = useServerFn(requestAvatarSession);
  const transcribeFn = useServerFn(transcribeSpeech);
  const speakFn = useServerFn(speakPersian);

  const [state, setState] = useState<AvatarState>("IDLE");
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [avatarLive, setAvatarLive] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [avatarNotice, setAvatarNotice] = useState<string | null>(null);
  const [avatarAttempt, setAvatarAttempt] = useState(0);
  const [avatarInfoOpen, setAvatarInfoOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const streamerRef = useRef<AvatarStreamerHandle | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const voice = useVoiceCapture(setNotice);

  // Session row + avatar credentials are provisioned once, on mount.
  useEffect(() => {
    let active = true;
    setState("CONNECTING");

    void startSessionFn({ data: "web" })
      .then((result) => {
        if (active) sessionIdRef.current = result.sessionId;
      })
      .catch(() => undefined);

    void avatarSessionFn()
      .then((result) => {
        if (!active) return;
        setPreviewUrl(result.previewUrl ?? null);
        if (result.configured) {
          setCredentials({
            token: result.token,
            avatarId: result.avatarId,
            voiceId: result.voiceId,
            avatarName: result.avatarName,
            voiceName: result.voiceName,
            vendor: result.vendor,
          });
        } else {
          // No avatar provider configured: the still face + browser voice carry the experience.
          setState("IDLE");
          setAvatarNotice(
            "آواتار زنده در دسترس نیست؛ پاسخ‌ها با صدای جایگزین پخش می‌شود. کلید و چهرهٔ آواتار را در پنل مدیریت بررسی کنید.",
          );
        }
      })
      .catch(() => {
        if (active) {
          setState("IDLE");
          setAvatarNotice("اتصال به سرویس آواتار برقرار نشد؛ فعلاً از صدای جایگزین استفاده می‌شود.");
        }
      });

    const timer = window.setTimeout(() => {
      if (active) setState((current) => (current === "CONNECTING" ? "IDLE" : current));
    }, 4000);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [startSessionFn, avatarSessionFn, avatarAttempt]);

  // If the live stream never reports "ready", fall back visibly instead of a blank
  // stage — but never overwrite a more specific reason the streamer already gave
  // (e.g. exhausted provider credits).
  useEffect(() => {
    if (!credentials || avatarLive || avatarNotice) return;
    const timer = window.setTimeout(() => {
      setAvatarNotice(
        (current) =>
          current ??
          "اتصال به آواتار زنده طول کشید؛ پاسخ‌ها فعلاً با صدای جایگزین پخش می‌شود.",
      );
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [credentials, avatarLive, avatarNotice]);

  const retryAvatar = useCallback(() => {
    setAvatarNotice(null);
    setAvatarLive(false);
    setCredentials(null);
    setAvatarAttempt((count) => count + 1);
  }, []);

  const deliverAnswer = useCallback(
    async (answer: string, turnId: string) => {
      setState("SPEAKING");
      const chunks = chunkForSpeech(answer);
      // The transcript keeps pace with the speech: each sentence group appears
      // exactly when the avatar (or the fallback voice) starts saying it.
      const reveal = (index: number) =>
        setTurns((current) =>
          current.map((turn) =>
            turn.id === turnId
              ? { ...turn, content: chunks.slice(0, index + 1).join(" ").trim() }
              : turn,
          ),
        );
      const revealAll = () =>
        setTurns((current) =>
          current.map((turn) => (turn.id === turnId ? { ...turn, content: answer } : turn)),
        );

      if (avatarLive && streamerRef.current) {
        try {
          for (let i = 0; i < chunks.length; i += 1) {
            reveal(i);
            await streamerRef.current.speak(chunks[i]!);
          }
          revealAll();
          return;
        } catch {
          /* fall through to the Persian gateway voice */
        }
      }

      const element = audioRef.current;
      if (element) {
        try {
          element.pause();
          // Each clip is synthesized with its neighbours as context (request
          // stitching) and the next clip is fetched while the current one
          // plays, so speech flows without gaps between sentences.
          const request = (index: number) =>
            speakFn({
              data: {
                text: chunks[index]!,
                previous: index > 0 ? chunks[index - 1] : undefined,
                next: chunks[index + 1],
              },
            });
          let inFlight = chunks.length ? request(0) : null;
          for (let i = 0; i < chunks.length; i += 1) {
            const clip = await inFlight!;
            inFlight = i + 1 < chunks.length ? request(i + 1) : null;
            reveal(i);
            await playBase64Audio(clip.audio, clip.mime, element);
          }
          revealAll();
          setState("IDLE");
          return;
        } catch {
          /* fall through to the browser voice */
        }
      }

      revealAll();
      speakWithBrowser(answer, () => setState("IDLE"));
    },
    [avatarLive, speakFn],
  );


  const submitQuestion = useCallback(
    async (question: string, inputMode: "VOICE" | "TEXT") => {
      const trimmed = question.trim();
      if (!trimmed || pending) return;

      setNotice(null);
      setDraft("");
      setTranscriptOpen(true);
      const history = turns.slice(-6).map((turn) => ({ role: turn.role, content: turn.content }));
      setTurns((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "user", content: trimmed },
      ]);
      setPending(true);
      setState("THINKING");
      await streamerRef.current?.interrupt();

      try {
        const result = await askFn({
          data: { sessionId: sessionIdRef.current, question: trimmed, inputMode, history },
        });
        const turnId = result.messageId ?? crypto.randomUUID();
        setTurns((current) => [
          ...current,
          {
            id: turnId,
            role: "assistant",
            content: "",
            sourceType: result.sourceType,
          },
        ]);
        await deliverAnswer(result.answer, turnId);

      } catch (error) {
        setState("ERROR");
        const message = error instanceof Error ? error.message : "";
        setNotice(message && /[آ-ی]/.test(message) ? message : GENERIC_ERROR_FA);
        window.setTimeout(() => setState("IDLE"), 2500);
      } finally {
        setPending(false);
      }
    },
    [askFn, deliverAnswer, pending, turns],
  );

  const toggleMic = useCallback(async () => {
    if (voice.recording) {
      const blob = await voice.stop();
      setState("THINKING");
      if (!blob) {
        setNotice(
          "صدایی شنیده نشد. دکمهٔ میکروفون را نگه دارید، کمی نزدیک‌تر و بلندتر صحبت کنید و سپس رها کنید.",
        );
        setState("IDLE");
        return;
      }
      const form = new FormData();
      form.append("audio", blob.blob, blob.filename);
      try {
        const { text } = await transcribeFn({ data: form });
        if (!text) {
          setNotice("صدایی تشخیص داده نشد. دوباره و کمی واضح‌تر صحبت کنید.");
          setState("IDLE");
          return;
        }
        // The recognised text lands in the box so it can be corrected before sending.
        setDraft(text);
        setState("IDLE");
        setTranscriptOpen(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        setNotice(
          message && /[آ-ی]/.test(message)
            ? message
            : "تبدیل گفتار به متن ممکن نشد. دوباره تلاش کنید.",
        );
        setState("IDLE");
      }
      return;
    }

    await voice.start();
    setState("LISTENING");
  }, [submitQuestion, transcribeFn, voice]);

  return (
    <main className="ambient-backdrop relative h-dvh overflow-hidden">
      {/* Persian answer audio when no live avatar speaks it. */}
      <audio ref={audioRef} className="hidden" playsInline />
      {/* Avatar occupies the whole stage; everything else floats above it. */}
      <div className="absolute inset-0 flex items-center justify-center px-3 pb-28 pt-24 sm:px-6 lg:pb-24 lg:pt-20">
        {/* Until the live stream plays, the selected face (or the orb) fills the stage. */}
        {!avatarLive && (
          <div className="absolute inset-0 flex items-center justify-center px-3 pb-28 pt-24 sm:px-6 lg:pb-24 lg:pt-20">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="چهرهٔ آواتار انتخاب‌شده"
                data-speaking={state === "SPEAKING" ? "true" : "false"}
                className="avatar-idle-life h-full w-auto max-w-full object-contain drop-shadow-[0_30px_60px_rgba(0,0,0,0.6)]"
              />

            ) : (
              <OrbStage state={state} />
            )}
          </div>
        )}
        {credentials && (
          <div className="relative h-full max-h-[calc(100dvh-12rem)] w-full max-w-[min(100%,56rem)] overflow-hidden">
            <AvatarErrorBoundary
              key={avatarAttempt}
              onError={(errorId) => {
                setAvatarLive(false);
                setState("IDLE");
                setAvatarNotice(
                  `بارگذاری موتور آواتار ناموفق بود؛ پاسخ‌ها با صدای فارسی پخش می‌شود. (کد ${errorId})`,
                );
              }}
              fallback={() => (
                <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                  نمایش زندهٔ آواتار بارگذاری نشد؛ برای اتصال دوباره «تلاش دوباره» را بزنید.
                </div>
              )}

            >
              <ClientOnly fallback={<OrbStage state={state} />}>
                <Suspense fallback={<OrbStage state={state} />}>
                  <AvatarStreamer
                    ref={streamerRef}
                    credentials={credentials}
                    onReady={() => {
                      setAvatarLive(true);
                      setAvatarNotice(null);
                      setState("IDLE");
                    }}
                    onSpeakingChange={(speaking) => setState(speaking ? "SPEAKING" : "IDLE")}
                    onError={(message) => {
                      console.error("Avatar session failed", { message });
                      setAvatarLive(false);
                      setState("IDLE");
                      setAvatarNotice(
                        /no credits|credit|4033|quota/i.test(message)
                          ? "اعتبار حساب سرویس آواتار زنده تمام شده است؛ تا شارژ حساب، پاسخ‌ها فقط با صدای فارسی پخش می‌شود."
                          : message === "AVATAR_SDK_LOAD_FAILED"
                            ? "موتور نمایش زنده بارگذاری نشد؛ پاسخ‌ها با صدای فارسی پخش می‌شود. «تلاش دوباره» را بزنید."
                            : /already been started/i.test(message)
                              ? "نشست زنده قبلاً آغاز شده بود؛ با «تلاش دوباره» نشست تازه ساخته می‌شود."
                              : "اتصال به آواتار زنده برقرار نشد؛ پاسخ‌ها با صدای جایگزین پخش می‌شود.",
                      );

                    }}

                  />
                </Suspense>
              </ClientOnly>
            </AvatarErrorBoundary>
          </div>
        )}
      </div>

      {!avatarLive && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-linear-to-t from-background to-transparent"
        />
      )}

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-4 px-4 py-4 lg:px-8">
        <div className="rounded-2xl glass-panel px-4 py-2">
          <h1 className="text-xl font-bold text-gradient-main lg:text-2xl">راوی‌استان</h1>
          <p className="text-xs text-muted-foreground">دستیار هوشمند گفتگومحور سازمانی</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full glass-panel px-3 py-1.5 text-xs text-muted-foreground sm:flex">
            <ShieldCheck className="size-3.5" />
            پاسخ‌ها مبتنی بر اسناد سازمان
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTranscriptOpen((open) => !open)}
          >
            <MessageSquare className="size-4" />
            متن گفتگو
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin">
              <Settings2 className="size-4" />
              پنل مدیریت
            </Link>
          </Button>
        </div>
      </header>

      {credentials && (
        <div className="absolute right-4 top-24 z-20 lg:right-8">
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="مشاهدهٔ انتخاب فعال آواتار"
            onClick={() => setAvatarInfoOpen((open) => !open)}
          >
            <Info className="size-4" />
          </Button>
          {avatarInfoOpen && (
            <div className="mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl glass-panel p-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">انتخاب فعال این نشست</p>
                <span className="text-muted-foreground">
                  {credentials.vendor === "liveavatar" ? "LiveAvatar" : "HeyGen"}
                </span>
              </div>
              <dl className="mt-3 grid gap-2">
                <div><dt className="text-muted-foreground">چهره</dt><dd className="mt-1">{credentials.avatarName || "بدون نام"}</dd></div>
                <div><dt className="text-muted-foreground">شناسهٔ چهره</dt><dd dir="ltr" className="mt-1 break-all font-mono">{credentials.avatarId || "—"}</dd></div>
                <div><dt className="text-muted-foreground">صدا</dt><dd className="mt-1">{credentials.voiceName || "صدای پیش‌فرض"}</dd></div>
                <div><dt className="text-muted-foreground">شناسهٔ صدا</dt><dd dir="ltr" className="mt-1 break-all font-mono">{credentials.voiceId || "default"}</dd></div>
              </dl>
            </div>
          )}
        </div>
      )}

      {transcriptOpen && (
        <aside className="absolute bottom-28 left-4 top-24 z-20 flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl glass-panel">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">متن گفتگو</h2>
            <button
              type="button"
              onClick={() => setTranscriptOpen(false)}
              aria-label="بستن متن گفتگو"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <Transcript turns={turns} pending={pending} />
          </div>
        </aside>
      )}

      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 px-4 pb-5 lg:px-8">
        <div className="flex items-center gap-3 rounded-full glass-panel px-4 py-1.5">
          <span className="text-xs font-medium text-foreground">{AVATAR_STATE_LABELS[state]}</span>
          <SpeakingBars active={state === "SPEAKING" || state === "LISTENING"} />
        </div>

        {notice && (
          <p className="rounded-xl bg-destructive/15 px-4 py-2 text-center text-sm text-destructive-foreground">
            {notice}
          </p>
        )}

        {avatarNotice && (
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl glass-panel px-4 py-2 text-center">
            <span className="text-xs text-muted-foreground">{avatarNotice}</span>
            <Button type="button" size="sm" variant="outline" onClick={retryAvatar}>
              تلاش دوباره
            </Button>
          </div>
        )}

        <form
          className="flex w-full max-w-2xl items-end gap-2 rounded-3xl glass-panel p-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submitQuestion(draft, "TEXT");
          }}
        >
          <Button
            type="button"
            size="icon"
            variant={voice.recording ? "destructive" : "secondary"}
            onClick={() => void toggleMic()}
            aria-label={voice.recording ? "پایان ضبط صدا" : "شروع ضبط صدا"}
          >
            {voice.recording ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </Button>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitQuestion(draft, "TEXT");
              }
            }}
            placeholder="پرسش خود را بنویسید…"
            rows={1}
            className="max-h-32 min-h-10 resize-none border-0 bg-surface-2"
          />
          <Button type="submit" size="icon" disabled={pending || !draft.trim()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      </div>
    </main>
  );
}

function OrbStage({ state }: { state: AvatarState }) {
  return (
    <AvatarOrb state={state}>
      <OrbFallback state={state} />
    </AvatarOrb>
  );
}

function OrbFallback({ state }: { state: AvatarState }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <span className="text-6xl font-bold text-gradient-main">ر</span>
      <span className="sr-only">{AVATAR_STATE_LABELS[state]}</span>
    </div>
  );
}
