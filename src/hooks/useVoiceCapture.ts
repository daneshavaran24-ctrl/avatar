import { useCallback, useRef, useState } from "react";

export interface VoiceClip {
  blob: Blob;
  filename: string;
  durationMs: number;
}

export interface VoiceCapture {
  recording: boolean;
  start: () => Promise<void>;
  stop: () => Promise<VoiceClip | null>;
  cancel: () => void;
}

const TARGET_RATE = 16000;

/** Downsamples mono float PCM to 16 kHz — plenty for speech, much smaller upload. */
function downsample(input: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate <= TARGET_RATE) return input;
  const ratio = sourceRate / TARGET_RATE;
  const output = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < output.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j] ?? 0;
    output[i] = sum / Math.max(1, end - start);
  }
  return output;
}

/** Writes a standard 16-bit mono WAV file: decodable everywhere, unlike raw recorder fragments. */
function encodeWav(chunks: Float32Array[], sourceRate: number): Blob {
  const merged = new Float32Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  const samples = downsample(merged, sourceRate);
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (position: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(position + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Microphone capture through the Web Audio API. MediaRecorder output varies per
 * browser (Safari emits fragmented MP4) and transcription models reject those
 * containers, so raw PCM is captured and uploaded as a complete WAV instead.
 */
export function useVoiceCapture(onError: (message: string) => void): VoiceCapture {
  const [recording, setRecording] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const startedAtRef = useRef(0);

  const cleanup = useCallback(() => {
    nodeRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void contextRef.current?.close().catch(() => undefined);
    nodeRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    contextRef.current = null;
    setRecording(false);
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const context = new AudioContext();
      if (context.state === "suspended") await context.resume().catch(() => undefined);
      const source = context.createMediaStreamSource(stream);
      const node = context.createScriptProcessor(4096, 1, 1);
      chunksRef.current = [];
      node.onaudioprocess = (event) => {
        chunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      // The processor must be connected to keep running, but routing it to the
      // speakers echoes the microphone back into the room (and into the avatar
      // stream). A muted gain node keeps the graph alive silently.
      const mute = context.createGain();
      mute.gain.value = 0;
      source.connect(node);
      node.connect(mute);
      mute.connect(context.destination);

      streamRef.current = stream;
      contextRef.current = context;
      sourceRef.current = source;
      nodeRef.current = node;
      startedAtRef.current = Date.now();
      setRecording(true);
    } catch {
      cleanup();
      onError("دسترسی به میکروفون ممکن نشد. لطفاً اجازهٔ دسترسی مرورگر را بررسی کنید.");
    }
  }, [cleanup, onError]);

  const stop = useCallback(async () => {
    const context = contextRef.current;
    if (!context) return null;
    const sourceRate = context.sampleRate;
    const chunks = chunksRef.current;
    const durationMs = Date.now() - startedAtRef.current;
    chunksRef.current = [];
    cleanup();

    if (chunks.length === 0) return null;

    // Silence check before uploading: transcription models invent sentences
    // ("موسیقی", "زیرنویس…") when they are handed near-silent audio, so a quiet
    // recording is reported as "nothing heard" instead of being sent.
    let energy = 0;
    let samples = 0;
    let peak = 0;
    for (const chunk of chunks) {
      for (let i = 0; i < chunk.length; i++) {
        const value = chunk[i] ?? 0;
        energy += value * value;
        if (Math.abs(value) > peak) peak = Math.abs(value);
      }
      samples += chunk.length;
    }
    const rms = samples ? Math.sqrt(energy / samples) : 0;
    if (rms < 0.004 || peak < 0.03 || durationMs < 400) return null;

    const blob = encodeWav(chunks, sourceRate);
    // Header-only WAV = silent mic or an instant start/stop: not worth uploading.
    if (blob.size < 4000) return null;
    return { blob, filename: "speech.wav", durationMs };
  }, [cleanup]);

  return { recording, start, stop, cancel: cleanup };
}
