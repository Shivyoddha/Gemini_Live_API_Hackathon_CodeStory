"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import SlideEngine from "@/components/slide/SlideEngine";
import TranscriptPanel from "@/components/ui/TranscriptPanel";
import IngestionProgress from "@/components/ui/IngestionProgress";
import MermaidViewer from "@/components/slide/MermaidViewer";
import Image from "next/image";
import {
    Mic, MicOff, Video, VideoOff, Volume2, VolumeX,
    ChevronLeft, Zap, Send, Camera
} from "lucide-react";

export type SlideData = {
    header: string;
    code?: { language: string; content: string; file?: string; lines?: string };
    narrative_notes?: string;
    mermaid?: string;
    visual_type?: "flowchart" | "sequence" | "architecture" | "none";
};

export type TranscriptEntry = {
    id: string;
    role: "agent" | "user";
    text: string;
    timestamp: number;
};

export type SessionStatus = "ingesting" | "ready" | "connecting" | "live" | "error";

// ─── Mic capture: 640 samples = 40ms @ 16kHz (Gemini Live spec) ─────────────
async function startAudioCapture(
    onChunk: (buf: ArrayBuffer) => void,
    sampleRate = 16000
): Promise<() => void> {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate, channelCount: 1, echoCancellation: true, noiseSuppression: true }
    });
    const ctx = new AudioContext({ sampleRate });
    const src = ctx.createMediaStreamSource(stream);
    // 512 samples = 32ms @ 16kHz — closest power-of-2 to Gemini Live's preferred 40ms
    const processor = ctx.createScriptProcessor(512, 1, 1);
    src.connect(processor);
    processor.connect(ctx.destination);
    processor.onaudioprocess = (e) => {
        const f32 = e.inputBuffer.getChannelData(0);
        const i16 = new Int16Array(f32.length);
        for (let i = 0; i < f32.length; i++) {
            i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768));
        }
        onChunk(i16.buffer);
    };
    return () => {
        processor.disconnect();
        src.disconnect();
        ctx.close();
        stream.getTracks().forEach((t) => t.stop());
    };
}

export default function SessionPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const sessionId = params.id as string;
    const mode = searchParams.get("mode") || "architecture";
    const persona = searchParams.get("persona") || "architect";
    const repoUrl = decodeURIComponent(searchParams.get("repo") || "");

    const [status, setStatus] = useState<SessionStatus>("ingesting");
    const [ingestionProgress, setIngestionProgress] = useState(0);
    const [ingestionStep, setIngestionStep] = useState("Initializing…");
    const [currentSlide, setCurrentSlide] = useState<SlideData | null>(null);
    const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
    const [textInput, setTextInput] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    // Buffer for accumulating transcript word-fragments into full sentences
    const transcriptBufferRef = useRef<{ role: string; text: string } | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const audioStopRef = useRef<(() => void) | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const cameraStreamRef = useRef<MediaStream | null>(null);
    const videoFrameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Playback audio context for Gemini's audio responses (24kHz output)
    const playbackCtxRef = useRef<AudioContext | null>(null);
    const playbackNextTimeRef = useRef<number>(0);

    // ── Play base64-encoded PCM16 audio (little-endian, 24kHz) from Gemini ─────
    const playBase64Audio = useCallback((b64: string, sampleRate = 24000) => {
        if (!playbackCtxRef.current || playbackCtxRef.current.state === "closed") {
            playbackCtxRef.current = new AudioContext({ sampleRate });
            playbackNextTimeRef.current = 0;
        }
        const ctx = playbackCtxRef.current;
        // Decode base64 → raw bytes
        const raw = atob(b64);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        // Reinterpret as little-endian int16 PCM → Float32
        const numSamples = Math.floor(bytes.length / 2);
        const f32 = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
            const lo = bytes[i * 2];
            const hi = bytes[i * 2 + 1];
            let s = (hi << 8) | lo;
            if (s > 32767) s -= 65536;   // unsigned → signed
            f32[i] = s / 32768;
        }
        if (numSamples === 0) return;
        const buf = ctx.createBuffer(1, numSamples, sampleRate);
        buf.copyToChannel(f32, 0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        // Schedule contiguously so chunks play without gaps
        const startTime = Math.max(ctx.currentTime, playbackNextTimeRef.current);
        src.start(startTime);
        playbackNextTimeRef.current = startTime + buf.duration;
    }, []);
    // ── Stop all queued audio immediately (for interruption) ─────────────────
    const stopAudio = useCallback(() => {
        if (playbackCtxRef.current && playbackCtxRef.current.state !== "closed") {
            playbackCtxRef.current.close();   // stops ALL scheduled buffers instantly
            playbackCtxRef.current = null;
            playbackNextTimeRef.current = 0;
        }
    }, []);

    useEffect(() => {
        if (status !== "ingesting") return;
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/ingest/status/${sessionId}`);
                const data = await res.json();
                setIngestionProgress(data.progress ?? 0);
                setIngestionStep(data.step ?? "Processing…");
                if (data.status === "complete") { setStatus("ready"); clearInterval(interval); }
                else if (data.status === "error") { setStatus("error"); clearInterval(interval); }
            } catch { /* retry */ }
        }, 1500);
        return () => clearInterval(interval);
    }, [status, sessionId]);

    // ── Camera toggle ──────────────────────────────────────────────────────────
    const toggleCamera = useCallback(async () => {
        if (isCameraOn) {
            cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
            cameraStreamRef.current = null;
            if (videoFrameIntervalRef.current) clearInterval(videoFrameIntervalRef.current);
            setIsCameraOn(false);
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360, frameRate: 15 } });
                cameraStreamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play();
                }
                setIsCameraOn(true);
                // Send 1 video frame/sec to server
                videoFrameIntervalRef.current = setInterval(() => {
                    if (!canvasRef.current || !videoRef.current || !wsRef.current) return;
                    const ctx = canvasRef.current.getContext("2d");
                    canvasRef.current.width = 640;
                    canvasRef.current.height = 360;
                    ctx?.drawImage(videoRef.current, 0, 0, 640, 360);
                    const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.7);
                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({ type: "video_frame", data: dataUrl }));
                    }
                }, 1000);
            } catch (e) {
                console.error("Camera error:", e);
            }
        }
    }, [isCameraOn]);

    // ── WebSocket connect ──────────────────────────────────────────────────────
    const connectWebSocket = useCallback(async () => {
        setStatus("connecting");
        const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/session"}/${sessionId}`;
        const ws = new WebSocket(`${wsUrl}?mode=${mode}&persona=${persona}`);
        wsRef.current = ws;

        ws.onopen = async () => {
            setStatus("live");
            if (!isMuted) {
                audioStopRef.current = await startAudioCapture((chunk) => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: "audio_chunk", data: Array.from(new Uint8Array(chunk)) }));
                    }
                });
            }
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            switch (msg.type) {
                case "slide_update":
                    setCurrentSlide(msg.slide);
                    break;
                case "transcript": {
                    // Buffer word fragments — flush when role changes or sentence ends
                    const buf = transcriptBufferRef.current;
                    const text: string = msg.text || "";
                    const endsWithPunct = /[.!?,;]\s*$/.test(text);
                    if (buf && buf.role === msg.role) {
                        buf.text += " " + text.trim();
                        if (endsWithPunct || buf.text.length > 200) {
                            setTranscript((prev) => [
                                ...prev,
                                { id: crypto.randomUUID(), role: buf.role as "agent" | "user", text: buf.text.trim(), timestamp: Date.now() },
                            ]);
                            transcriptBufferRef.current = null;
                        }
                    } else {
                        // Flush previous buffer if role changed
                        if (buf) {
                            setTranscript((prev) => [
                                ...prev,
                                { id: crypto.randomUUID(), role: buf.role as "agent" | "user", text: buf.text.trim(), timestamp: Date.now() },
                            ]);
                        }
                        if (endsWithPunct || msg.role === "user") {
                            setTranscript((prev) => [
                                ...prev,
                                { id: crypto.randomUUID(), role: msg.role, text: text.trim(), timestamp: Date.now() },
                            ]);
                            transcriptBufferRef.current = null;
                        } else {
                            transcriptBufferRef.current = { role: msg.role, text: text.trim() };
                        }
                    }
                    break;
                }
                case "agent_speaking":
                    if (!msg.value) {
                        // Agent stopped — stop scheduled audio so user can interrupt immediately
                        stopAudio();
                    }
                    setIsAgentSpeaking(msg.value);
                    // Flush buffer when agent stops speaking
                    if (!msg.value && transcriptBufferRef.current) {
                        const buf = transcriptBufferRef.current;
                        setTranscript((prev) => [
                            ...prev,
                            { id: crypto.randomUUID(), role: buf.role as "agent" | "user", text: buf.text.trim(), timestamp: Date.now() },
                        ]);
                        transcriptBufferRef.current = null;
                    }
                    break;
                case "audio_output":
                    // Play Gemini's audio response — base64-encoded PCM16 @ 24kHz
                    if (msg.data && typeof msg.data === "string") {
                        playBase64Audio(msg.data, msg.sample_rate || 24000);
                    }
                    break;
                case "error":
                    console.error("WS Error:", msg.message);
                    break;
            }
        };

        ws.onclose = (event) => {
            audioStopRef.current?.();
            stopAudio();
            // Flush any remaining transcript buffer
            if (transcriptBufferRef.current) {
                const buf = transcriptBufferRef.current;
                setTranscript((prev) => [
                    ...prev,
                    { id: crypto.randomUUID(), role: buf.role as "agent" | "user", text: buf.text.trim(), timestamp: Date.now() },
                ]);
                transcriptBufferRef.current = null;
            }
            setStatus((current) => {
                if (current === "connecting") {
                    const reason = event.reason || "Connection refused. Is the backend running?";
                    setErrorMessage(`Gemini Live connection failed: ${reason}`);
                    return "error";
                }
                // Return to ready — show reconnect button
                if (current === "live" || current === "connecting") return "ready";
                return current;
            });
        };
        ws.onerror = (e) => {
            console.error("WS error", e);
        };
    }, [sessionId, mode, persona, stopAudio]);

    const sendText = useCallback(() => {
        if (!textInput.trim() || !wsRef.current) return;
        wsRef.current.send(JSON.stringify({ type: "text_input", text: textInput }));
        setTranscript((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: "user", text: textInput, timestamp: Date.now() },
        ]);
        setTextInput("");
    }, [textInput]);

    const toggleMic = useCallback(() => {
        if (isMuted) {
            // Unmute: start audio capture
            startAudioCapture((chunk) => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: "audio_chunk", data: Array.from(new Uint8Array(chunk)) }));
                }
            }).then((stop) => { audioStopRef.current = stop; });
        } else {
            audioStopRef.current?.();
            audioStopRef.current = null;
        }
        setIsMuted((m) => !m);
    }, [isMuted]);

    const modeLabel: Record<string, string> = {
        architecture: "Architecture Walkthrough",
        flow: "Flow-Based Explanation",
        qa: "Immersive Q&A",
    };

    // ── RENDER ─────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-screen session-surface overflow-hidden">
            {/* Google 4-color top bar */}
            <div className="g-gradient-bar flex-shrink-0" />

            {/* Header */}
            <header className="flex items-center justify-between px-6 py-3 flex-shrink-0 z-20"
                style={{ borderBottom: "1px solid #3C4043", background: "#202124" }}>
                <div className="flex items-center gap-4">
                    <a href="/" className="flex items-center gap-1.5 text-sm transition-colors"
                        style={{ color: "#9AA0A6" }}>
                        <ChevronLeft className="w-4 h-4" /> Back
                    </a>
                    <div className="h-4 w-px" style={{ background: "#3C4043" }} />
                    {/* Logo in header */}
                    <Image src="/logo.png" alt="CodeStory" width={100} height={28}
                        style={{ objectFit: "contain", filter: "brightness(0) invert(1)", opacity: 0.9 }} />
                    <div className="h-4 w-px" style={{ background: "#3C4043" }} />
                    <span className="text-xs" style={{ color: "#9AA0A6" }}>{modeLabel[mode]}</span>
                </div>

                <div className="flex items-center gap-3">
                    {status === "live" && (
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full live-badge">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 rec-pulse" />
                            <span className="text-xs font-medium">LIVE</span>
                        </div>
                    )}
                    {status === "connecting" && (
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full"
                            style={{ background: "rgba(244,180,0,0.1)", border: "1px solid rgba(244,180,0,0.3)", color: "#F4B400" }}>
                            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                            <span className="text-xs font-medium">Connecting…</span>
                        </div>
                    )}
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: "#5F6368" }}>
                        <Zap className="w-3 h-3" style={{ color: "#4285F4" }} />
                        Gemini 2.5 Flash Live
                    </div>
                </div>
            </header>

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Slide / status area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <AnimatePresence mode="wait">
                        {/* Ingesting */}
                        {status === "ingesting" && (
                            <motion.div key="ingesting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="flex-1 flex items-center justify-center">
                                <IngestionProgress progress={ingestionProgress} step={ingestionStep} repoUrl={repoUrl} />
                            </motion.div>
                        )}

                        {/* Ready */}
                        {(status === "ready" || status === "connecting") && (
                            <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="flex-1 flex items-center justify-center">
                                <div className="text-center space-y-6">
                                    <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center"
                                        style={{ background: "rgba(66,133,244,0.1)", border: "1px solid rgba(66,133,244,0.3)" }}>
                                        <Image src="/logo.png" alt="CodeStory" width={56} height={56}
                                            style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }} />
                                    </div>
                                    <h2 className="text-2xl font-medium" style={{ color: "#E8EAED" }}>Repository Ready</h2>
                                    <p className="text-sm" style={{ color: "#9AA0A6" }}>Knowledge graph hydrated. Ready to begin the story.</p>
                                    <motion.button
                                        onClick={connectWebSocket}
                                        disabled={status === "connecting"}
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                        className="px-8 py-3 rounded-full text-white font-medium transition-all disabled:opacity-60"
                                        style={{ background: "#4285F4" }}
                                    >
                                        {status === "connecting" ? "Connecting to Gemini…" : "Start Live Session"}
                                    </motion.button>
                                </div>
                            </motion.div>
                        )}

                        {/* Live */}
                        {status === "live" && (
                            <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="flex-1 flex flex-col overflow-hidden">
                                <SlideEngine slide={currentSlide} isAgentSpeaking={isAgentSpeaking} />
                                {currentSlide?.mermaid && (
                                    <div className="px-6 pb-4 flex-shrink-0">
                                        <MermaidViewer chart={currentSlide.mermaid} />
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* Error */}
                        {status === "error" && (
                            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="flex-1 flex items-center justify-center p-8">
                                <div className="text-center space-y-5 max-w-lg">
                                    <div className="text-5xl">⚠️</div>
                                    <h2 className="text-xl font-medium" style={{ color: "#DB4437" }}>Session Connection Failed</h2>
                                    {errorMessage && (
                                        <div className="px-4 py-3 rounded-xl text-left text-sm font-mono"
                                            style={{ background: "#2C2E33", border: "1px solid #DB443740", color: "#F28B82" }}>
                                            {errorMessage}
                                        </div>
                                    )}
                                    <p className="text-sm" style={{ color: "#9AA0A6" }}>
                                        The Gemini Live API requires a valid API key from{" "}
                                        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer"
                                            style={{ color: "#4285F4", textDecoration: "underline" }}>
                                            aistudio.google.com/apikey
                                        </a>
                                        {" "}(format: AIza...). Update <code style={{ color: "#F4B400" }}>GEMINI_API_KEY</code> in <code style={{ color: "#F4B400" }}>.env</code> and restart the backend.
                                    </p>
                                    <div className="flex gap-3 justify-center">
                                        <button onClick={() => { setStatus("ready"); setErrorMessage(""); }}
                                            className="px-6 py-2 rounded-full text-sm font-medium"
                                            style={{ background: "#4285F4", color: "white" }}>
                                            Try Again
                                        </button>
                                        <button onClick={() => window.location.href = "/"}
                                            className="px-6 py-2 rounded-full text-sm font-medium"
                                            style={{ background: "transparent", border: "1px solid #3C4043", color: "#9AA0A6" }}>
                                            Back to Home
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ── Voice + Video + Text Input Bar (only when live) ─────────────── */}
                    {status === "live" && (
                        <div className="flex-shrink-0 p-4 space-y-3"
                            style={{ borderTop: "1px solid #3C4043", background: "#202124" }}>

                            {/* Camera preview */}
                            {isCameraOn && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                                    className="flex justify-center">
                                    <div className="video-preview" style={{ width: 240, height: 135 }}>
                                        <video ref={videoRef} muted className="w-full h-full object-cover" />
                                    </div>
                                    <canvas ref={canvasRef} className="hidden" />
                                </motion.div>
                            )}
                            {!isCameraOn && <canvas ref={canvasRef} className="hidden" />}

                            {/* Controls row */}
                            <div className="flex items-center gap-3">
                                {/* Mic toggle */}
                                <button onClick={toggleMic}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all"
                                    style={{
                                        background: isMuted ? "rgba(219,68,55,0.1)" : "rgba(66,133,244,0.1)",
                                        border: `1px solid ${isMuted ? "rgba(219,68,55,0.4)" : "rgba(66,133,244,0.4)"}`,
                                        color: isMuted ? "#DB4437" : "#4285F4",
                                    }}>
                                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                                    <span>{isMuted ? "Mic Off" : "Mic On"}</span>
                                    {!isMuted && (
                                        <div className="flex gap-0.5 items-end h-4">
                                            {[1, 2, 3, 4].map((i) => (
                                                <div key={i} className="waveform-bar rounded-full"
                                                    style={{ width: 3, height: "100%", background: "#4285F4", animationDelay: `${i * 0.15}s` }} />
                                            ))}
                                        </div>
                                    )}
                                </button>

                                {/* Camera toggle */}
                                <button onClick={toggleCamera}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all"
                                    style={{
                                        background: isCameraOn ? "rgba(15,157,88,0.1)" : "rgba(255,255,255,0.04)",
                                        border: `1px solid ${isCameraOn ? "rgba(15,157,88,0.4)" : "#3C4043"}`,
                                        color: isCameraOn ? "#0F9D58" : "#9AA0A6",
                                    }}>
                                    {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                                    <span>{isCameraOn ? "Camera On" : "Camera Off"}</span>
                                    {isCameraOn && <Camera className="w-3 h-3 rec-pulse" />}
                                </button>

                                {/* Text input */}
                                <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-full"
                                    style={{ background: "#2C2E33", border: "1px solid #3C4043" }}>
                                    <input
                                        type="text"
                                        value={textInput}
                                        onChange={(e) => setTextInput(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && sendText()}
                                        placeholder="Ask a question or interrupt…"
                                        className="flex-1 bg-transparent text-sm outline-none"
                                        style={{ color: "#E8EAED", fontFamily: "inherit" }}
                                    />
                                    <button onClick={sendText} disabled={!textInput.trim()}
                                        className="p-1 rounded-full transition-all disabled:opacity-30"
                                        style={{ color: "#4285F4" }}>
                                        <Send className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Speaker mute */}
                                <button className="p-2.5 rounded-full transition-all"
                                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #3C4043", color: "#9AA0A6" }}>
                                    <Volume2 className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Speaking indicator */}
                            {isAgentSpeaking && (
                                <div className="flex items-center gap-2 text-xs" style={{ color: "#4285F4" }}>
                                    <div className="flex gap-0.5 items-end h-3">
                                        {[1, 2, 3, 5, 4, 2].map((h, i) => (
                                            <div key={i} className="waveform-bar rounded-full"
                                                style={{ width: 3, height: `${h * 20}%`, background: "#4285F4", animationDelay: `${i * 0.1}s` }} />
                                        ))}
                                    </div>
                                    Gemini is speaking…
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Transcript sidebar */}
                <div className="w-80 flex-shrink-0 flex flex-col"
                    style={{ borderLeft: "1px solid #3C4043", background: "#202124" }}>
                    <div className="flex items-center justify-between px-4 py-3"
                        style={{ borderBottom: "1px solid #3C4043" }}>
                        <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "#5F6368" }}>
                            Transcript
                        </span>
                    </div>
                    <TranscriptPanel entries={transcript} />
                </div>
            </div>
        </div>
    );
}
