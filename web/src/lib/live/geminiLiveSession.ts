import { bytesToBase64 } from "./audioCapture";

type GeminiLiveEvents = {
  text: (text: string) => void;
  streamingText: (text: string) => void;
  audioChunk: (base64: string, mimeType: string) => void;
  state: (state: "connecting" | "ready" | "answering" | "idle") => void;
  error: (message: string) => void;
};

const SESSION_READY_TIMEOUT_MS = 10000;

type EventName = keyof GeminiLiveEvents;

type Listener<K extends EventName> = GeminiLiveEvents[K];

type GeminiLivePart = {
  text?: string;
  inlineData?: { data?: string; mimeType?: string };
  inline_data?: { data?: string; mime_type?: string };
};

type GeminiLivePayload = {
  serverContent?: {
    setupComplete?: boolean;
    turnComplete?: boolean;
    modelTurn?: { parts?: GeminiLivePart[] };
  };
  server_content?: {
    setup_complete?: boolean;
    turn_complete?: boolean;
    model_turn?: { parts?: GeminiLivePart[] };
  };
  generationComplete?: boolean;
};

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private readonly apiKey: string;
  private readonly model: string;
  // Map of event name to array of listeners. Use a non-generic storage type to simplify typing.
  private readonly listeners: Partial<Record<EventName, Array<Listener<any>>>> = {};
  private pendingText = "";
  private audioChunksInTurn = 0;
  private turnResolver: (() => void) | null = null;
  private reconnectDelayMs = 5000;
  private closing = false;
  private readyResolve: (() => void) | null = null;
  private readyPromise: Promise<void> = Promise.resolve();

  constructor(opts: { apiKey: string; model: string }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model;
  }

  on<K extends EventName>(event: K, handler: GeminiLiveEvents[K]): void {
    const existing = this.listeners[event] ?? [];
    const typed = existing as Array<Listener<K>>;
    typed.push(handler);
    this.listeners[event] = typed as Array<Listener<any>>;
  }

  private emit<K extends EventName>(event: K, ...args: any[]): void {
    const list = this.listeners[event] as Array<Listener<K>> | undefined;
    list?.forEach((fn) => {
      const handler = fn as any;
      if (args.length === 0) {
        handler();
      } else if (args.length === 1) {
        handler(args[0]);
      } else {
        handler(args[0], args[1]);
      }
    });
  }

  waitUntilReady(timeoutMs = SESSION_READY_TIMEOUT_MS): Promise<void> {
    return Promise.race([
      this.readyPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini Live session connection timeout.")), timeoutMs),
      ),
    ]);
  }

  async connect(): Promise<void> {
    if (!this.apiKey) {
      throw new Error("Gemini Live API key is missing.");
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.readyResolve?.();
      this.readyResolve = null;
      return;
    }
    this.closing = false;
    this.readyPromise = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });
    this.emit("state", "connecting");

    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(
      this.apiKey,
    )}`;

    console.log("[GeminiLive] Connecting to", url.replace(/key=[^&]+/, "key=***"));
    const ws = new WebSocket(url);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        console.log("[GeminiLive] WebSocket opened successfully");
        resolve();
      };
      ws.onerror = (ev) => {
        console.error("[GeminiLive] WebSocket open error", ev);
        reject(new Error("Unable to open Gemini Live connection."));
      };
    });

    ws.onmessage = (event) => {
      // Gemini Live may send Blob or string data. Handle both.
      const data = event.data;
      if (typeof data === "string") {
        this.handleMessage(data);
      } else if (data instanceof Blob) {
        data.text().then((text) => this.handleMessage(text)).catch(() => { });
      } else if (data instanceof ArrayBuffer) {
        this.handleMessage(new TextDecoder().decode(data));
      } else {
        console.warn("[GeminiLive] Unknown message type:", typeof data);
      }
    };
    ws.onerror = () => {
      if (!this.closing) {
        this.emit("error", "Gemini Live connection error.");
      }
    };
    ws.onclose = (ev) => {
      console.log("[GeminiLive] WebSocket closed", ev.code, ev.reason);
      if (this.ws === ws) {
        this.ws = null;
      }
    };

    ws.send(
      JSON.stringify({
        setup: {
          model: `models/${this.model}`,
          systemInstruction: {
            parts: [
              {
                text: "You are a helpful voice assistant for a code walkthrough. You narrate slides when given slide content. When the user interrupts you to ask a question, STOP narrating and answer their question conversationally. Do NOT resume narrating after answering — wait for the next narration prompt. Keep responses concise and natural.",
              },
            ],
          },
          generationConfig: {
            responseModalities: ["AUDIO"],
          },
          realtimeInputConfig: {
            automaticActivityDetection: {},
          },
        },
      }),
    );

    // API may not send setupComplete; mark ready after setup is sent so the UI can proceed
    console.log("[GeminiLive] Setup message sent, marking ready");
    this.emit("state", "ready");
    this.readyResolve?.();
    this.readyResolve = null;
  }

  private handleMessage(raw: string): void {
    try {
      const payload = JSON.parse(raw) as GeminiLivePayload & {
        error?: { message?: string };
        error_message?: string;
      };
      const errMsg = payload.error?.message ?? payload.error_message;
      if (errMsg) {
        this.emit("error", errMsg);
        return;
      }

      const serverContent =
        (payload.serverContent as GeminiLivePayload["serverContent"]) ??
        (payload.server_content as GeminiLivePayload["server_content"]);
      const setupComplete = Boolean(
        (serverContent as GeminiLivePayload["serverContent"])?.setupComplete ??
        (serverContent as GeminiLivePayload["server_content"])?.setup_complete,
      );
      if (setupComplete) {
        this.emit("state", "ready");
        this.readyResolve?.();
        this.readyResolve = null;
      }
      const modelTurn =
        (serverContent as GeminiLivePayload["serverContent"])?.modelTurn ??
        (serverContent as GeminiLivePayload["server_content"])?.model_turn;
      const parts = modelTurn?.parts ?? [];

      for (const part of parts) {
        if (part.text) {
          this.pendingText += part.text;
          this.emit("streamingText", this.pendingText);
          this.emit("state", "answering");
        }
        const inlineData = (part.inlineData ??
          part.inline_data) as
          | { data?: string; mimeType?: string }
          | { data?: string; mime_type?: string }
          | undefined;
        const audioData = inlineData?.data;
        const mimeType =
          (inlineData as { mimeType?: string } | undefined)?.mimeType ??
          (inlineData as { mime_type?: string } | undefined)?.mime_type;
        if (audioData && mimeType) {
          this.audioChunksInTurn += 1;
          if (this.audioChunksInTurn <= 3) {
            console.log(`[GeminiLive] Audio chunk #${this.audioChunksInTurn}, mimeType: ${mimeType}, bytes: ${audioData.length}`);
          }
          this.emit("audioChunk", audioData, mimeType);
          this.emit("state", "answering");
        }
      }

      const turnComplete = Boolean(
        (serverContent as GeminiLivePayload["serverContent"])?.turnComplete ??
        (serverContent as GeminiLivePayload["server_content"])?.turn_complete ??
        payload.generationComplete,
      );
      if (turnComplete) {
        const finalText = this.pendingText.trim();
        if (finalText) {
          this.emit("text", finalText);
        }
        this.pendingText = "";
        this.audioChunksInTurn = 0;
        if (this.turnResolver) {
          this.turnResolver();
          this.turnResolver = null;
        }
        this.emit("state", "idle");
      }
    } catch (parseError) {
      // Log malformed messages for debugging; live stream can continue.
      console.warn("[GeminiLive] Failed to parse message:", parseError, raw.slice(0, 200));
    }
  }

  async sendAudioChunk(pcm16: Uint8Array): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const base64 = bytesToBase64(pcm16);
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          mediaChunks: [
            { mimeType: "audio/pcm;rate=16000", data: base64 },
          ],
        },
      }),
    );
  }

  async startTurnWithText(prompt: string): Promise<void> {
    if (!prompt.trim()) {
      return;
    }
    await this.connect();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Cancel any pending turn so a new one can proceed.
    if (this.turnResolver) {
      this.turnResolver();
      this.turnResolver = null;
    }

    this.pendingText = "";
    this.audioChunksInTurn = 0;

    const turnCompletePromise = new Promise<void>((resolve) => {
      this.turnResolver = resolve;
    });

    console.log("[GeminiLive] Sending text turn:", prompt.slice(0, 80));
    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          turnComplete: true,
        },
      }),
    );

    void turnCompletePromise;
  }

  cancelPendingTurn(): void {
    if (this.turnResolver) {
      this.turnResolver();
      this.turnResolver = null;
    }
    this.pendingText = "";
    this.audioChunksInTurn = 0;
  }

  async endAudioStream(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          audioStreamEnd: true,
        },
      }),
    );
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
  }

  private scheduleReconnect(): void {
    if (this.closing) {
      return;
    }
    setTimeout(() => {
      if (!this.ws && !this.closing) {
        void this.connect().catch((err) => this.emit("error", String(err)));
      }
    }, this.reconnectDelayMs);
  }
}

