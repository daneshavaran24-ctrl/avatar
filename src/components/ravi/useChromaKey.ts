import { useEffect, useRef } from "react";

/**
 * Draws the avatar video onto a canvas and removes a solid (usually green)
 * studio background, so the avatar sits directly on the app's ambient stage.
 * The backdrop colour is sampled once from a tiny downscaled copy of the frame:
 * when the corners are not a uniform chroma colour every later frame is blitted
 * straight through with no pixel work at all, which keeps the canvas at the
 * video's real frame rate so blinking and lip movement stay smooth.
 */
export function useChromaKey(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let key: { r: number; g: number; b: number } | null = null;
    let sampled = false;

    /** One-off backdrop probe on a 32px copy — cheap and off the hot path. */
    const sampleKey = (video: HTMLVideoElement) => {
      const probe = document.createElement("canvas");
      probe.width = 32;
      probe.height = 32;
      const pctx = probe.getContext("2d", { willReadFrequently: true });
      if (!pctx) return;
      pctx.drawImage(video, 0, 0, 32, 32);
      const data = pctx.getImageData(0, 0, 32, 32).data;
      const corners = [0, 31 * 4, 31 * 32 * 4, (31 * 32 + 31) * 4];
      const avg = corners.reduce(
        (acc, index) => ({
          r: acc.r + (data[index] ?? 0) / 4,
          g: acc.g + (data[index + 1] ?? 0) / 4,
          b: acc.b + (data[index + 2] ?? 0) / 4,
        }),
        { r: 0, g: 0, b: 0 },
      );
      key = avg.g > avg.r + 40 && avg.g > avg.b + 40 ? avg : null;
    };

    const render = () => {
      frame = requestAnimationFrame(render);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext("2d", { willReadFrequently: !!key });
      if (!ctx) return;

      if (!sampled) {
        sampled = true;
        sampleKey(video);
      }

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(video, 0, 0, width, height);
      if (!key) return; // Transparent or scenic backdrop: nothing to strip.

      const image = ctx.getImageData(0, 0, width, height);
      const data = image.data;
      for (let i = 0; i < data.length; i += 4) {
        const distance =
          Math.abs((data[i] ?? 0) - key.r) +
          Math.abs((data[i + 1] ?? 0) - key.g) +
          Math.abs((data[i + 2] ?? 0) - key.b);
        if (distance < 90) {
          data[i + 3] = 0;
        } else if (distance < 150) {
          data[i + 3] = Math.round(((distance - 90) / 60) * 255);
        }
      }
      ctx.putImageData(image, 0, 0);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [active, videoRef]);

  return canvasRef;
}
