"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Github, Mic, Layers, Search, Play, Star, Zap, BookOpen } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

const MODES = [
    {
        id: "architecture",
        icon: Layers,
        title: "Architecture Walkthrough",
        description:
            "AI narrates the entire codebase from entry points outward, building a mental map with real-time diagrams.",
        gradient: "from-brand-500 to-violet-500",
        glow: "rgba(98,114,250,0.4)",
    },
    {
        id: "flow",
        icon: Search,
        title: "Flow-Based Explanation",
        description:
            'Trace a specific flow end-to-end — "Explain the authentication process" — with sequence diagrams and call graphs.',
        gradient: "from-violet-500 to-fuchsia-500",
        glow: "rgba(167,139,250,0.4)",
    },
    {
        id: "qa",
        icon: Mic,
        title: "Immersive Q&A",
        description:
            "Open conversation with an AI that knows every function, class, and commit in the repo. Ask anything.",
        gradient: "from-fuchsia-500 to-pink-500",
        glow: "rgba(232,121,249,0.4)",
    },
];

const PERSONAS = [
    { id: "architect", label: "The Architect", emoji: "🏗️", desc: "High-level design & trade-offs" },
    { id: "debugger", label: "The Debugger", emoji: "🔍", desc: "Edge cases & logical pitfalls" },
    { id: "historian", label: "The Historian", emoji: "📜", desc: "Why decisions were made (git insights)" },
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
        if (!repoUrl.trim()) {
            setError("Please enter a GitHub repository URL.");
            return;
        }
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
        <div className="relative min-h-screen bg-surface overflow-hidden">
            {/* Background orbs */}
            <div className="orb w-[600px] h-[600px] bg-brand-600 top-[-200px] left-[-200px]" />
            <div className="orb w-[400px] h-[400px] bg-violet-600 top-[40%] right-[-100px]" style={{ animationDelay: "3s" }} />
            <div className="orb w-[300px] h-[300px] bg-fuchsia-600 bottom-[10%] left-[20%]" style={{ animationDelay: "6s" }} />

            {/* Grid overlay */}
            <div className="absolute inset-0 bg-grid opacity-100 pointer-events-none" />

            {/* Navbar */}
            <nav className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center glow-brand">
                        <BookOpen className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-bold text-xl tracking-tight gradient-text-blue">CodeStory</span>
                </div>
                <div className="flex items-center gap-6 text-sm text-white/50">
                    <a href="https://github.com/Shivyoddha/Gemini_Live_API_Hackathon_CodeStory" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white transition-colors">
                        <Github className="w-4 h-4" />
                        GitHub
                    </a>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs">
                        <Zap className="w-3 h-3" />
                        Gemini 2.5 Flash Live
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <main className="relative z-10 flex flex-col items-center px-6 pt-20 pb-16">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className="text-center max-w-4xl"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-brand-500/20 mb-8 text-sm text-brand-300">
                        <Star className="w-3.5 h-3.5 fill-brand-400 text-brand-400" />
                        Built for the Gemini Live API Hackathon · Creative Story Track
                    </div>

                    <h1 className="text-6xl md:text-7xl font-extrabold tracking-tight mb-6 leading-none">
                        Your codebase,{" "}
                        <span className="gradient-text">narrated live.</span>
                    </h1>

                    <p className="text-xl text-white/50 max-w-2xl mx-auto mb-12 leading-relaxed">
                        Paste any GitHub URL. CodeStory ingests the repo into a{" "}
                        <span className="text-brand-400">Spanner Graph</span>, then a Gemini AI agent walks
                        you through it — speaking, showing slides, and answering your questions — in real time.
                    </p>

                    {/* Input card */}
                    <div className="w-full max-w-2xl mx-auto glass rounded-2xl p-6 mb-10 border border-white/10">
                        <label className="block text-xs font-medium text-white/40 uppercase tracking-widest mb-3 text-left">
                            GitHub Repository URL
                        </label>
                        <div className="flex gap-3">
                            <div className="flex-1 flex items-center gap-3 bg-surface-2 rounded-xl px-4 py-3 border border-white/10 focus-within:border-brand-500/50 transition-colors">
                                <Github className="w-4 h-4 text-white/30 flex-shrink-0" />
                                <input
                                    type="text"
                                    value={repoUrl}
                                    onChange={(e) => setRepoUrl(e.target.value)}
                                    placeholder="https://github.com/owner/repo"
                                    className="flex-1 bg-transparent text-sm text-white placeholder-white/25 outline-none font-mono"
                                    onKeyDown={(e) => e.key === "Enter" && handleStart()}
                                />
                            </div>
                        </div>
                        {error && (
                            <p className="text-red-400 text-xs mt-2 text-left">{error}</p>
                        )}
                    </div>

                    {/* Mode selector */}
                    <div className="w-full max-w-4xl mx-auto mb-8">
                        <p className="text-xs font-medium text-white/40 uppercase tracking-widest mb-4">
                            Choose Your Session Mode
                        </p>
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
                                        className={`relative text-left p-5 rounded-xl border transition-all duration-300 ${isSelected
                                                ? "border-brand-500/50 bg-brand-500/10"
                                                : "border-white/8 glass hover:border-white/20"
                                            }`}
                                        style={isSelected ? { boxShadow: `0 0 30px ${mode.glow}` } : {}}
                                    >
                                        {isSelected && (
                                            <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${mode.gradient} opacity-5`} />
                                        )}
                                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${mode.gradient} flex items-center justify-center mb-3`}>
                                            <Icon className="w-4 h-4 text-white" />
                                        </div>
                                        <h3 className="font-semibold text-sm text-white mb-1.5">{mode.title}</h3>
                                        <p className="text-xs text-white/40 leading-relaxed">{mode.description}</p>
                                    </motion.button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Persona selector */}
                    <div className="w-full max-w-4xl mx-auto mb-10">
                        <p className="text-xs font-medium text-white/40 uppercase tracking-widest mb-4">
                            Choose AI Narrator Persona
                        </p>
                        <div className="flex gap-3 justify-center flex-wrap">
                            {PERSONAS.map((p) => (
                                <motion.button
                                    key={p.id}
                                    onClick={() => setSelectedPersona(p.id)}
                                    whileHover={{ scale: 1.04 }}
                                    whileTap={{ scale: 0.96 }}
                                    className={`flex items-center gap-2.5 px-4 py-2.5 rounded-full border text-sm font-medium transition-all ${selectedPersona === p.id
                                            ? "border-brand-500/60 bg-brand-500/15 text-brand-300"
                                            : "border-white/10 glass text-white/50 hover:text-white/80 hover:border-white/20"
                                        }`}
                                >
                                    <span>{p.emoji}</span>
                                    <span>{p.label}</span>
                                    <span className={`text-xs ${selectedPersona === p.id ? "text-brand-400/70" : "text-white/30"}`}>
                                        · {p.desc}
                                    </span>
                                </motion.button>
                            ))}
                        </div>
                    </div>

                    {/* CTA */}
                    <motion.button
                        onClick={handleStart}
                        disabled={loading}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        className="relative inline-flex items-center gap-3 px-10 py-4 rounded-2xl bg-gradient-to-r from-brand-500 to-violet-500 text-white font-bold text-lg shadow-lg glow-brand glow-brand-hover transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Initializing CodeStory…
                            </>
                        ) : (
                            <>
                                <Play className="w-5 h-5" />
                                Begin the Story
                            </>
                        )}
                    </motion.button>

                    <p className="text-xs text-white/25 mt-4">
                        Powered by Gemini 2.5 Flash Live API · Spanner Graph · Vertex AI Reasoning Engine
                    </p>
                </motion.div>

                {/* Stats row */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.6 }}
                    className="flex gap-12 mt-20 text-center"
                >
                    {[
                        { label: "Latency", value: "<500ms", sub: "Audio response" },
                        { label: "Format", value: "PCM 16kHz", sub: "Native audio" },
                        { label: "Memory", value: "∞ Session", sub: "With compression" },
                        { label: "Models", value: "3 Agents", sub: "Multi-agent AI" },
                    ].map((stat) => (
                        <div key={stat.label} className="flex flex-col">
                            <span className="text-2xl font-bold gradient-text-blue">{stat.value}</span>
                            <span className="text-xs text-white/50 mt-0.5">{stat.sub}</span>
                        </div>
                    ))}
                </motion.div>
            </main>
        </div>
    );
}
