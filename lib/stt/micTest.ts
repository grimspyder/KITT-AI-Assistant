// Short microphone diagnostics used by Settings → AUDIO.
// It deliberately does not record or upload audio.
export interface MicTestResult {
  ok: boolean;
  peak: number;
  message: string;
}

export async function testMicrophone(deviceId?: string, durationMs = 1200): Promise<MicTestResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, peak: 0, message: 'This browser does not support microphone capture.' };
  }
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let raf = 0;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const Ctor: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const data = new Float32Array(analyser.fftSize);
    ctx.createMediaStreamSource(stream).connect(analyser);
    let peak = 0;
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const loop = () => {
        analyser.getFloatTimeDomainData(data as unknown as Float32Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        peak = Math.max(peak, Math.sqrt(sum / data.length));
        if (performance.now() - started < durationMs) raf = requestAnimationFrame(loop);
        else resolve();
      };
      raf = requestAnimationFrame(loop);
    });
    const label = stream.getAudioTracks()[0]?.label || 'selected microphone';
    const level = Math.round(Math.min(1, peak * 4) * 100);
    return {
      ok: peak > 0.008,
      peak,
      message: peak > 0.008
        ? `${label} detected input (${level}% peak).`
        : `${label} opened, but no audible input was detected. Check mute, system input level, and distance from the microphone.`,
    };
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return { ok: false, peak: 0, message: 'Microphone permission is blocked. Allow it from the browser lock icon and reload.' };
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return { ok: false, peak: 0, message: 'The selected microphone is unavailable. Choose another input and refresh the device list.' };
    return { ok: false, peak: 0, message: `Microphone test failed: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((track) => track.stop());
    await ctx?.close().catch(() => undefined);
  }
}
