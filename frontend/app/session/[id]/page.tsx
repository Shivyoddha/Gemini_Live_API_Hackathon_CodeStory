"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import SlideEngine from "@/components/slide/SlideEngine";
import AudioInterface from "@/components/audio/AudioInterface";
import TranscriptPanel from "@/components/ui/TranscriptPanel";
import IngestionProgress from "@/components/ui/IngestionProgress";
import MermaidViewer from "@/components/slide/MermaidViewer";
import { BookOpen, Mic, MicOff, Volume2, VolumeX, ChevronLeft, Zap } from "lucide-react";

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
    const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
    const [slideHistory, setSlideHistory] = useState<SlideData[]>([]);
    const wsRef = useRef<WebSocket | null>(null);

    // Poll ingestion status
    useEffect(() => {
        if (status !== "ingesting") return;
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/ingest/status/${sessionId}`);
                const data = await res.json();
                setIngestionProgress(data.progress ?? 0);
                setIngestionStep(data.step ?? "Processing…");
                if (data.status === "complete") {
                    setStatus("ready");
                    clearInterval(interval);
                } else if (data.status === "error") {
                    setStatus("error");
                    clearInterval(interval);
                }
            } catch {
                // retry
            }
        }, 1500);
        return () => clearInterval(interval);
    }, [status, sessionId]);

    // WebSocket connection to backend
    const connectWebSocket = useCallback(() => {
        setStatus("connecting");
        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || `ws://localhost:8000/ws/session/${sessionId}`;
        const fullUrl = `${wsUrl}?mode=${mode}&persona=${persona}`;
        const ws = new WebSocket(fullUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setStatus("live");
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            switch (msg.type) {
                case "slide_update":
                    setCurrentSlide(msg.slide);
                    setSlideHistory((prev) => [...prev, msg.slide]);
                    break;
                case "transcript":
                    setTranscript((prev) => [
                        ...prev,
                        { id: crypto.randomUUID(), role: msg.role, text: msg.text, timestamp: Date.now() },
                    ]);
                    break;
                case "agent_speaking":
                    setIsAgentSpeaking(msg.value);
                    break;
                case "session_ready":
                    setStatus("live");
                    break;
                case "error":
                    console.error("WS Error:", msg.message);
                    break;
            }
        };

        ws.onclose = () => {
            if (status === "live") setStatus("ready");
        };

        ws.onerror = () => setStatus("error");
    }, [sessionId, mode, persona, status]);

    const sendAudioChunk = useCallback((pcmData: ArrayBuffer) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "audio_chunk", data: Array.from(new Uint8Array(pcmData)) }));
        }
    }, []);

    const sendTextMessage = useCallback((text: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "text_input", text }));
            setTranscript((prev) => [
                ...prev,
                { id: crypto.randomUUID(), role: "user", text, timestamp: Date.now() },
            ]);
        }
    }, []);

    const modeLabel: Record<string, string> = {
        architecture: "Architecture Walkthrough",
        flow: "Flow-Based Explanation",
        qa: "Immersive Q&A",
    };

    const personaEmoji: Record<string, string> = {
        architect: "🏗️",
        debugger: "🔍",
        historian: "📜",
    };

    return (
        <div className="flex flex-col h-screen bg-surface overflow-hidden">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-3 border-b border-white/8 bg-surface-1/80 backdrop-blur-xl flex-shrink-0 z-20">
                <div className="flex items-center gap-4">
                    <a href="/" className="flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors text-sm">
                        <ChevronLeft className="w-4 h-4" />
                        Back
                    </a>
                    <div className="h-4 w-px bg-white/10" />
                    <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-brand-400" />
                        <span className="font-semibold text-sm gradient-text-blue">CodeStory</span>
                    </div>
                    <div className="h-4 w-px bg-white/10" />
                    <span className="text-xs text-white/40">{modeLabel[mode]}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-surface-3 text-white/50">
                        {personaEmoji[persona]} {persona}
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    {status === "live" && (
                        <div className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-xs text-green-400 font-medium">LIVE</span>
                        </div>
                    )}
                    {status === "connecting" && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                            <span className="text-xs text-yellow-400 font-medium">Connecting…</span>
                        </div>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-white/30">
                        <Zap className="w-3 h-3 text-brand-400" />
                        Gemini 2.5 Flash Live
                    </div>
                </div>
            </header>

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Slide area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <AnimatePresence mode="wait">
                        {status === "ingesting" && (
                            <motion.div
                                key="ingesting"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex-1 flex items-center justify-center"
                            >
                                <IngestionProgress
                                    progress={ingestionProgress}
                                    step={ingestionStep}
                                    repoUrl={repoUrl}
                                />
                            </motion.div>
                        )}
                        {(status === "ready" || status === "connecting") && (
                            <motion.div
                                key="ready"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex-1 flex items-center justify-center"
                            >
                                <div className="text-center space-y-6">
                                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center mx-auto glow-brand">
                                        <BookOpen className="w-10 h-10 text-white" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-white">Repository Ready</h2>
                                    <p className="text-white/40 text-sm">Knowledge graph hydrated. Ready to begin the story.</p>
                                    <motion.button
                                        onClick={connectWebSocket}
                                        disabled={status === "connecting"}
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                        className="px-8 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-violet-500 text-white font-semibold glow-brand transition-all disabled:opacity-60"
                                    >
                                        {status === "connecting" ? "Connecting to Gemini…" : "Start Live Session"}
                                    </motion.button>
                                </div>
                            </motion.div>
                        )}
                        {status === "live" && (
                            <motion.div
                                key="live"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex-1 flex flex-col overflow-hidden"
                            >
                                <SlideEngine slide={currentSlide} isAgentSpeaking={isAgentSpeaking} />
                                {currentSlide?.mermaid && (
                                    <div className="px-6 pb-4 flex-shrink-0">
                                        <MermaidViewer chart={currentSlide.mermaid} />
                                    </div>
                                )}
                            </motion.div>
                        )}
                        {status === "error" && (
                            <motion.div
                                key="error"
                                className="flex-1 flex items-center justify-center"
                            >
                                <div className="text-center space-y-4">
                                    <div className="text-5xl">⚠️</div>
                                    <h2 className="text-xl font-bold text-red-400">Session Error</h2>
                                    <p className="text-white/40 text-sm">Check that all backend services are running.</p>
                                    <button onClick={() => window.location.reload()} className="px-6 py-2 rounded-lg bg-surface-3 border border-white/10 text-sm text-white/70 hover:text-white transition-colors">
                                        Retry
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Audio interface */}
                    {status === "live" && (
                        <div className="flex-shrink-0 border-t border-white/8 bg-surface-1/60 backdrop-blur-xl">
                            <AudioInterface
                                onAudioChunk={sendAudioChunk}
                                onTextMessage={sendTextMessage}
                                isMuted={isMuted}
                                isAgentSpeaking={isAgentSpeaking}
                                onMuteToggle={() => setIsMuted((m) => !m)}
                            />
                        </div>
                    )}
                </div>

                {/* Transcript sidebar */}
                <div className="w-80 flex-shrink-0 border-l border-white/8 flex flex-col bg-surface-1/40 backdrop-blur-xl">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
                        <span className="text-xs font-medium text-white/40 uppercase tracking-widest">Transcript</span>
                        <button onClick={() => setIsMuted((m) => !m)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                            {isMuted ? <VolumeX className="w-4 h-4 text-white/30" /> : <Volume2 className="w-4 h-4 text-white/40" />}
                        </button>
                    </div>
                    <TranscriptPanel entries={transcript} />
                </div>
            </div>
        </div>
    );
}
