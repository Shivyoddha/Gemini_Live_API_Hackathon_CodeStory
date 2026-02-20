"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Send, MessageSquare } from "lucide-react";

interface AudioInterfaceProps {
    onAudioChunk: (data: ArrayBuffer) => void;
    onTextMessage: (text: string) => void;
    isMuted: boolean;
    isAgentSpeaking: boolean;
    onMuteToggle: () => void;
}

const SAMPLE_RATE = 16000;
const CHUNK_DURATION_MS = 40; // 40ms chunks as per Gemini Live API spec

export default function AudioInterface({
    onAudioChunk,
    onTextMessage,
    isMuted,
    isAgentSpeaking,
    onMuteToggle,
}: AudioInterfaceProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [textInput, setTextInput] = useState("");
    const [showTextInput, setShowTextInput] = useState(false);
    const [volumeLevel, setVolumeLevel] = useState(0);

    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animFrameRef = useRef<number | null>(null);

    const startRecording = useCallback(async () => {
        if (isMuted) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true },
            });
            mediaStreamRef.current = stream;

            const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
            audioContextRef.current = audioCtx;

            const source = audioCtx.createMediaStreamSource(stream);

            // Analyser for visualization
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            analyserRef.current = analyser;
            source.connect(analyser);

            // Processor for raw PCM chunks
            const processor = audioCtx.createScriptProcessor(
                Math.floor((SAMPLE_RATE * CHUNK_DURATION_MS) / 1000),
                1,
                1
            );
            processorRef.current = processor;
            source.connect(processor);
            processor.connect(audioCtx.destination);

            processor.onaudioprocess = (e) => {
                if (isMuted) return;
                const float32 = e.inputBuffer.getChannelData(0);
                const int16 = new Int16Array(float32.length);
                for (let i = 0; i < float32.length; i++) {
                    int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
                }
                onAudioChunk(int16.buffer);
            };

            // Volume visualization
            const visualize = () => {
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(dataArray);
                const avg = dataArray.reduce((s, v) => s + v, 0) / dataArray.length;
                setVolumeLevel(avg / 128);
                animFrameRef.current = requestAnimationFrame(visualize);
            };
            visualize();

            setIsRecording(true);
        } catch (err) {
            console.error("Microphone access error:", err);
        }
    }, [isMuted, onAudioChunk]);

    const stopRecording = useCallback(() => {
        processorRef.current?.disconnect();
        analyserRef.current?.disconnect();
        audioContextRef.current?.close();
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setIsRecording(false);
        setVolumeLevel(0);
    }, []);

    useEffect(() => {
        // Auto-start recording when component mounts
        startRecording();
        return () => stopRecording();
    }, []);

    useEffect(() => {
        if (isMuted && isRecording) stopRecording();
        if (!isMuted && !isRecording) startRecording();
    }, [isMuted]);

    const handleSendText = () => {
        if (!textInput.trim()) return;
        onTextMessage(textInput.trim());
        setTextInput("");
    };

    return (
        <div className="px-6 py-4 flex items-center gap-4">
            {/* Mic button with pulse */}
            <div className="relative flex-shrink-0">
                {isRecording && !isMuted && (
                    <>
                        <div
                            className="absolute inset-0 rounded-full bg-brand-500/30 animate-ping"
                            style={{ animationDuration: "1.5s" }}
                        />
                        {/* Volume ring */}
                        <div
                            className="absolute inset-0 rounded-full border-2 border-brand-500/40 transition-all duration-100"
                            style={{ transform: `scale(${1 + volumeLevel * 0.5})`, opacity: 0.6 }}
                        />
                    </>
                )}
                <motion.button
                    onClick={onMuteToggle}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all ${isMuted
                            ? "bg-red-500/20 border border-red-500/40 text-red-400"
                            : "bg-brand-500/20 border border-brand-500/40 text-brand-400"
                        }`}
                >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </motion.button>
            </div>

            {/* Waveform visualization */}
            <div className="flex-1 flex items-center gap-1 h-10">
                {isAgentSpeaking ? (
                    <div className="flex items-center gap-1 w-full">
                        <div className="text-brand-400 text-xs mr-2 flex-shrink-0">AI Speaking</div>
                        {[...Array(20)].map((_, i) => (
                            <div
                                key={i}
                                className="flex-1 rounded-full bg-brand-500/60"
                                style={{
                                    height: `${8 + Math.sin(i * 0.8) * 16}px`,
                                    animation: `waveform 1.2s ease-in-out ${i * 0.06}s infinite`,
                                }}
                            />
                        ))}
                    </div>
                ) : isRecording && !isMuted ? (
                    <div className="flex items-center gap-1 w-full">
                        <div className="text-white/30 text-xs mr-2 flex-shrink-0">Listening</div>
                        {[...Array(20)].map((_, i) => (
                            <div
                                key={i}
                                className="flex-1 rounded-full bg-white/10 transition-all duration-100"
                                style={{
                                    height: `${4 + Math.sin(i + Date.now() / 200) * volumeLevel * 24}px`,
                                }}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-white/25 text-sm">
                        <div className="w-2 h-2 rounded-full bg-white/10" />
                        {isMuted ? "Microphone muted" : "Waiting for speech…"}
                    </div>
                )}
            </div>

            {/* Text input toggle */}
            <div className="flex items-center gap-2 flex-shrink-0">
                <motion.button
                    onClick={() => setShowTextInput((v) => !v)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="p-2.5 rounded-lg glass border border-white/10 text-white/40 hover:text-white/70 transition-colors"
                >
                    <MessageSquare className="w-4 h-4" />
                </motion.button>

                <AnimatePresence>
                    {showTextInput && (
                        <motion.div
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 280, opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            className="flex items-center overflow-hidden"
                        >
                            <input
                                autoFocus
                                type="text"
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSendText()}
                                placeholder="Type a question…"
                                className="flex-1 bg-surface-2 border border-white/10 rounded-l-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-brand-500/50"
                            />
                            <button
                                onClick={handleSendText}
                                className="px-3 py-2 bg-brand-500 rounded-r-xl text-white hover:bg-brand-600 transition-colors"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
