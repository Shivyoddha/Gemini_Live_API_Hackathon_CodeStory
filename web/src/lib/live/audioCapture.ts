export type AudioChunkHandler = (pcm16: Uint8Array) => void;

/**
 * Inline AudioWorklet processor source code.
 * Runs on the audio rendering thread and forwards PCM chunks to the main thread.
 */
const WORKLET_PROCESSOR_CODE = `
class PcmForwarder extends AudioWorkletProcessor {
  constructor() {
    super();
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      // Copy the float32 buffer so ownership transfers cleanly.
      this.port.postMessage(new Float32Array(input[0]));
    }
    return true;
  }
}
registerProcessor("pcm-forwarder", PcmForwarder);
`;

export class AudioCapture {
  private context: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  // Fallback: ScriptProcessorNode for browsers without AudioWorklet support.
  private processor: ScriptProcessorNode | null = null;

  async start(onChunk: AudioChunkHandler): Promise<void> {
    if (this.stream) return;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone streaming is not supported in this browser.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Use a standard sample rate to avoid driver-level issues, then optionally
    // let the browser resample from mic to 16 kHz.
    const context = new AudioContext({ sampleRate: 16000 });
    if (context.state === "suspended") {
      await context.resume();
    }

    const source = context.createMediaStreamSource(stream);

    this.stream = stream;
    this.context = context;
    this.source = source;

    // Prefer AudioWorklet (modern, runs on a separate thread, no SIGILL risk).
    if (typeof AudioWorkletNode !== "undefined" && context.audioWorklet) {
      try {
        const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: "application/javascript" });
        const workletUrl = URL.createObjectURL(blob);
        await context.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);

        const workletNode = new AudioWorkletNode(context, "pcm-forwarder");
        workletNode.port.onmessage = (event) => {
          const floats = event.data as Float32Array;
          onChunk(float32ToPcm16Bytes(floats));
        };

        source.connect(workletNode);
        // Worklet must be connected to destination (silently) to keep processing.
        const gain = context.createGain();
        gain.gain.value = 0;
        workletNode.connect(gain);
        gain.connect(context.destination);

        this.workletNode = workletNode;
        return;
      } catch {
        // If AudioWorklet fails (e.g. CSP issues), fall through to ScriptProcessor.
        console.warn("[AudioCapture] AudioWorklet unavailable, falling back to ScriptProcessor");
      }
    }

    // Fallback: ScriptProcessorNode (deprecated but widely supported).
    const bufferSize = 1024;
    const processor = context.createScriptProcessor(bufferSize, 1, 1);
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      onChunk(float32ToPcm16Bytes(input));
    };

    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(processor);
    processor.connect(gain);
    gain.connect(context.destination);

    this.processor = processor;
  }

  stop(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode.port.close();
      this.workletNode = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.context) {
      void this.context.close();
      this.context = null;
    }
  }
}

function float32ToPcm16Bytes(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(i * 2, Math.round(int16), true);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}
