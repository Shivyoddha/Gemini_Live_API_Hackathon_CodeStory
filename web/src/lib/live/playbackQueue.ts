import { base64ToBytes, parseSampleRateFromMime, pcm16ToAudioBuffer } from "./pcmUtils";

export class AudioPlaybackQueue {
  private ctx: AudioContext | null = null;
  /** Currently playing source node — used to interrupt playback. */
  private currentSource: AudioBufferSourceNode | null = null;
  /** Resolve function for the currently playing chunk's promise. */
  private currentResolve: (() => void) | null = null;
  /** Chained promise queue so chunks play in order. */
  private queue: Promise<void> = Promise.resolve();
  /** When true, newly enqueued chunks are silently discarded. */
  private cleared = false;
  /** Number of chunks currently queued or playing. */
  private pendingChunks = 0;
  /** Resolve function called when pendingChunks drops to 0. */
  private drainResolve: (() => void) | null = null;

  /** True when audio chunks are queued or actively playing. */
  get playing(): boolean {
    return this.pendingChunks > 0;
  }

  /**
   * Returns a promise that resolves once all currently queued audio has
   * finished playing.  If nothing is queued it resolves immediately.
   */
  waitUntilDrained(): Promise<void> {
    if (this.pendingChunks <= 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      // If there's already a drain listener, chain them.
      const prev = this.drainResolve;
      this.drainResolve = () => {
        prev?.();
        resolve();
      };
    });
  }

  private markChunkDone(): void {
    this.pendingChunks = Math.max(0, this.pendingChunks - 1);
    if (this.pendingChunks <= 0 && this.drainResolve) {
      this.drainResolve();
      this.drainResolve = null;
    }
  }

  private async getOrCreateContext(): Promise<AudioContext> {
    if (typeof window === "undefined") {
      throw new Error("Audio output is not supported in this environment.");
    }
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Unlock AudioContext on user gesture so playback works when chunks arrive.
   * Call from startListening (mic click) before streaming begins.
   */
  async prepare(): Promise<void> {
    if (typeof window === "undefined") return;
    await this.getOrCreateContext();
  }

  enqueueBase64Audio(base64: string, mimeType: string): void {
    this.pendingChunks += 1;
    this.queue = this.queue
      .then(async () => {
        // If clear() was called, skip all pending chunks until un-cleared.
        if (this.cleared) {
          this.markChunkDone();
          return;
        }

        const audioContext = await this.getOrCreateContext();
        const bytes = base64ToBytes(base64);

        let buffer: AudioBuffer;
        if (mimeType.toLowerCase().includes("audio/pcm")) {
          const sampleRate = parseSampleRateFromMime(mimeType);
          buffer = pcm16ToAudioBuffer(audioContext, bytes, sampleRate);
        } else {
          const arrayBuffer = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer;
          buffer = await audioContext.decodeAudioData(arrayBuffer);
        }

        await this.playBuffer(audioContext, buffer);
        this.markChunkDone();
      })
      .catch(() => {
        // Keep playback queue alive even if one chunk fails.
        this.markChunkDone();
      });
  }

  /**
   * Interrupt any currently playing audio and discard all queued chunks.
   * The AudioContext stays open so new audio can be enqueued immediately.
   */
  clear(): void {
    // Stop whatever is currently playing.
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // May already have finished.
      }
      this.currentSource = null;
    }
    // Resolve any pending play promise so the queue advances.
    if (this.currentResolve) {
      this.currentResolve();
      this.currentResolve = null;
    }
    // Mark cleared so pending enqueued chunks are skipped.
    this.cleared = true;
    // Reset pending count and fire drain listeners.
    this.pendingChunks = 0;
    if (this.drainResolve) {
      this.drainResolve();
      this.drainResolve = null;
    }
    // Reset the queue to a fresh resolved promise.
    this.queue = this.queue.then(() => {
      this.cleared = false;
    });
  }

  /**
   * Fully close the AudioContext. Use only when the component unmounts.
   * For interrupting during playback, use clear() instead.
   */
  async stop(): Promise<void> {
    this.clear();
    this.queue = this.queue.then(async () => {
      if (this.ctx && this.ctx.state !== "closed") {
        await this.ctx.close();
        this.ctx = null;
      }
    });
    await this.queue;
  }

  private playBuffer(audioContext: AudioContext, audioBuffer: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        if (this.currentSource === source) {
          this.currentSource = null;
          this.currentResolve = null;
        }
        resolve();
      };
      this.currentSource = source;
      this.currentResolve = resolve;
      source.start();
    });
  }
}
