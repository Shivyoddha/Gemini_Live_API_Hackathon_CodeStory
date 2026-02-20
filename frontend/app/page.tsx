"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Github, Mic, Layers, Search, Play, Zap } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import Image from "next/image";

const MODES = [
    {
        id: "architecture",
        icon: Layers,
        title: "Architecture Walkthrough",
        description: "AI narrates the entire codebase from entry points outward, building a mental map with real-time diagrams.",
        color: "#4285F4",
        bg: "rgba(66,133,244,0.06)",
        border: "rgba(66,133,244,0.25)",
    },
    {
        id: "flow",
        icon: Search,
        title: "Flow-Based Explanation",
        description: 'Trace a specific flow end-to-end — "Explain the auth process" — with sequence diagrams and call graphs.',
        color: "#DB4437",
        bg: "rgba(219,68,55,0.06)",
        border: "rgba(219,68,55,0.25)",
    },
    {
        id: "qa",
        icon: Mic,
        title: "Immersive Q&A",
        description: "Open conversation with an AI that knows every function, class, and commit in the repo. Ask anything.",
        color: "#0F9D58",
        bg: "rgba(15,157,88,0.06)",
        border: "rgba(15,157,88,0.25)",
    },
];

const PERSONAS = [
    { id: "architect", label: "The Architect", emoji: "🏗️", desc: "High-level design & trade-offs" },
    { id: "debugger", label: "The Debugger", emoji: "🔍", desc: "Edge cases & logical pitfalls" },
    { id: "historian", label: "The Historian", emoji: "📜", desc: "Why decisions were made" },
];

export default function LandingPage() {
    const router = useRouter();
    const [repoUrl, setRepoUrl] = useState(
        "https://github.com/Shivyoddha/Gemini_Live_API_Hackathon_CodeStory"
    );
    const [selectedMode, setSelectedMode] = useState("architecture");
    const [selectedPersona, setSelectedPersona] = useState("architect");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleStart = async () => {
        if (!repoUrl.trim()) { setError("Please enter a GitHub repository URL."); return; }
        setError("");
        setLoading(true);
        const sessionId = uuidv4();
        try {
            const res = await fetch("/api/ingest/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ repo_url: repoUrl, session_id: sessionId }),
            });
            if (!res.ok) throw new Error("Ingestion failed");
            router.push(`/session/${sessionId}?mode=${selectedMode}&persona=${selectedPersona}&repo=${encodeURIComponent(repoUrl)}`);
        } catch {
            setError("Failed to connect to ingestion service. Ensure backend is running.");
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen" style={{ background: "#FFFFFF", fontFamily: "'Google Sans', Roboto, sans-serif" }}>
            {/* 4-color Google top bar */}
            <div className="g-gradient-bar" />

            {/* Navbar */}
            <nav style={{ borderBottom: "1px solid #DADCE0", padding: "12px 32px" }}
                className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Image src="/logo.png" alt="CodeStory" width={160} height={44} priority style={{ objectFit: "contain" }} />
                </div>
                <div className="flex items-center gap-4 text-sm" style={{ color: "#5F6368" }}>
                    <a href="https://github.com/Shivyoddha/Gemini_Live_API_Hackathon_CodeStory"
                        target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 hover:underline">
                        <Github className="w-4 h-4" /> GitHub
                    </a>
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full"
                        style={{ background: "rgba(66,133,244,0.1)", color: "#4285F4", border: "1px solid rgba(66,133,244,0.2)", fontSize: 12 }}>
                        <Zap className="w-3 h-3" />
                        Gemini 2.5 Flash Live
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <main className="flex flex-col items-center px-6 pt-16 pb-20">
                <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="text-center max-w-3xl w-full"
                >
                    {/* Hackathon badge */}
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8 text-sm"
                        style={{ background: "rgba(15,157,88,0.08)", border: "1px solid rgba(15,157,88,0.2)", color: "#0F9D58" }}>
                        ⭐ Built for the Gemini Live API Hackathon · Creative Story Track
                    </div>

                    <h1 className="text-6xl font-normal tracking-tight mb-5 leading-tight" style={{ color: "#202124" }}>
                        Your codebase,{" "}
                        <span style={{
                            background: "linear-gradient(135deg, #4285F4 0%, #0F9D58 100%)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
                            fontWeight: 700,
                        }}>narrated live.</span>
                    </h1>

                    <p className="text-xl mb-12 leading-relaxed" style={{ color: "#5F6368" }}>
                        Paste any GitHub URL. CodeStory ingests the repo into a{" "}
                        <span style={{ color: "#4285F4", fontWeight: 500 }}>Spanner Graph</span>, then a Gemini
                        AI agent walks you through it — speaking, showing slides, and answering your{" "}
                        <span style={{ color: "#0F9D58", fontWeight: 500 }}>voice & video</span> questions — in real time.
                    </p>

                    {/* URL Input card */}
                    <div className="w-full max-w-2xl mx-auto mb-10 g-card p-6 g-shadow-sm">
                        <label className="block text-xs font-medium uppercase tracking-widest mb-3 text-left"
                            style={{ color: "#5F6368" }}>GitHub Repository URL</label>
                        <div className="flex gap-3">
                            <div className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl g-input focus-within:border-blue-500"
                                style={{ border: "1px solid #DADCE0" }}>
                                <Github className="w-4 h-4 flex-shrink-0" style={{ color: "#9AA0A6" }} />
                                <input
                                    type="text"
                                    value={repoUrl}
                                    onChange={(e) => setRepoUrl(e.target.value)}
                                    placeholder="https://github.com/owner/repo"
                                    className="flex-1 bg-transparent text-sm outline-none font-mono"
                                    style={{ color: "#202124" }}
                                    onKeyDown={(e) => e.key === "Enter" && handleStart()}
                                />
                            </div>
                        </div>
                        {error && <p className="text-xs mt-2 text-left" style={{ color: "#DB4437" }}>{error}</p>}
                    </div>

                    {/* Mode selector */}
                    <div className="w-full max-w-4xl mx-auto mb-8">
                        <p className="text-xs font-medium uppercase tracking-widest mb-4 text-left"
                            style={{ color: "#80868B" }}>Choose Your Session Mode</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {MODES.map((mode) => {
                                const Icon = mode.icon;
                                const isSelected = selectedMode === mode.id;
                                return (
                                    <motion.button
                                        key={mode.id}
                                        onClick={() => setSelectedMode(mode.id)}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className="text-left p-5 rounded-2xl border transition-all duration-200"
                                        style={{
                                            background: isSelected ? mode.bg : "#FFFFFF",
                                            border: `1px solid ${isSelected ? mode.color : "#DADCE0"}`,
                                            boxShadow: isSelected
                                                ? `0 0 0 1px ${mode.color}40, 0 4px 12px ${mode.color}20`
                                                : "0 1px 3px rgba(60,64,67,0.08)",
                                        }}
                                    >
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                                            style={{ background: mode.bg, border: `1px solid ${mode.border}` }}>
                                            <Icon className="w-4 h-4" style={{ color: mode.color }} />
                                        </div>
                                        <h3 className="font-medium text-sm mb-1.5" style={{ color: "#202124" }}>{mode.title}</h3>
                                        <p className="text-xs leading-relaxed" style={{ color: "#5F6368" }}>{mode.description}</p>
                                    </motion.button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Persona selector */}
                    <div className="w-full max-w-4xl mx-auto mb-10">
                        <p className="text-xs font-medium uppercase tracking-widest mb-4 text-left"
                            style={{ color: "#80868B" }}>Choose AI Narrator Persona</p>
                        <div className="flex gap-3 flex-wrap">
                            {PERSONAS.map((p) => (
                                <motion.button
                                    key={p.id}
                                    onClick={() => setSelectedPersona(p.id)}
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    className="flex items-center gap-2.5 px-5 py-2.5 rounded-full text-sm font-medium transition-all"
                                    style={{
                                        background: selectedPersona === p.id ? "rgba(66,133,244,0.1)" : "#FFFFFF",
                                        border: `1px solid ${selectedPersona === p.id ? "#4285F4" : "#DADCE0"}`,
                                        color: selectedPersona === p.id ? "#4285F4" : "#5F6368",
                                    }}
                                >
                                    <span>{p.emoji}</span>
                                    <span>{p.label}</span>
                                    <span className="text-xs" style={{ opacity: 0.6 }}>· {p.desc}</span>
                                </motion.button>
                            ))}
                        </div>
                    </div>

                    {/* CTA Button */}
                    <motion.button
                        onClick={handleStart}
                        disabled={loading}
                        whileHover={{ scale: 1.02, boxShadow: "0 4px 16px rgba(66,133,244,0.4)" }}
                        whileTap={{ scale: 0.98 }}
                        className="inline-flex items-center gap-3 px-10 py-4 rounded-full text-white font-medium text-base transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{ background: loading ? "#9AA0A6" : "#4285F4" }}
                    >
                        {loading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                Initializing CodeStory…
                            </>
                        ) : (
                            <>
                                <Play className="w-4 h-4 fill-white" />
                                Begin the Story
                            </>
                        )}
                    </motion.button>

                    <p className="text-xs mt-4" style={{ color: "#9AA0A6" }}>
                        Powered by Gemini 2.5 Flash Live API · Spanner Graph · Vertex AI
                    </p>
                </motion.div>

                {/* Stats row */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                    className="flex gap-12 mt-20 text-center"
                >
                    {[
                        { label: "Audio Latency", value: "<500ms", color: "#4285F4" },
                        { label: "Input Modes", value: "Voice + Video", color: "#0F9D58" },
                        { label: "Memory", value: "∞ Context", color: "#F4B400" },
                        { label: "AI Agents", value: "3 Personas", color: "#DB4437" },
                    ].map((stat) => (
                        <div key={stat.label} className="flex flex-col">
                            <span className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</span>
                            <span className="text-xs mt-1" style={{ color: "#9AA0A6" }}>{stat.label}</span>
                        </div>
                    ))}
                </motion.div>
            </main>
        </div>
    );
}
