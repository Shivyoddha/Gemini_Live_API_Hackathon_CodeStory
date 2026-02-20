"use client";

import { motion } from "framer-motion";
import { Github, Database, Brain, Code2, GitBranch, Cpu } from "lucide-react";

interface IngestionProgressProps {
    progress: number;
    step: string;
    repoUrl: string;
}

const STEPS = [
    { icon: Github, label: "Cloning repository", threshold: 0 },
    { icon: Code2, label: "Parsing AST (Tree-sitter)", threshold: 20 },
    { icon: Brain, label: "Generating embeddings (Vertex AI)", threshold: 45 },
    { icon: Database, label: "Hydrating Spanner Graph", threshold: 70 },
    { icon: GitBranch, label: "Mapping call graph", threshold: 85 },
    { icon: Cpu, label: "Preparing Reasoning Engine", threshold: 95 },
];

export default function IngestionProgress({ progress, step, repoUrl }: IngestionProgressProps) {
    const repoName = repoUrl.replace("https://github.com/", "");

    return (
        <div className="max-w-md w-full mx-auto text-center space-y-8 px-6">
            {/* Animated logo */}
            <div className="relative mx-auto w-20 h-20">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 animate-glow" />
                <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center">
                    <Github className="w-9 h-9 text-white" />
                </div>
                {/* Orbiting dots */}
                {[0, 120, 240].map((deg) => (
                    <div
                        key={deg}
                        className="absolute w-2.5 h-2.5 rounded-full bg-brand-400"
                        style={{
                            top: "50%",
                            left: "50%",
                            transform: `rotate(${deg}deg) translateX(40px) translateY(-50%)`,
                            animation: "orbFloat 2s linear infinite",
                            animationDelay: `${deg / 360}s`,
                        }}
                    />
                ))}
            </div>

            <div>
                <h2 className="text-xl font-bold text-white mb-1">Ingesting Repository</h2>
                <p className="text-sm text-white/40 font-mono">{repoName}</p>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
                <div className="h-2 w-full bg-surface-3 rounded-full overflow-hidden">
                    <motion.div
                        className="h-full rounded-full progress-shimmer"
                        initial={{ width: "0%" }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                </div>
                <div className="flex justify-between text-xs text-white/30">
                    <span>{step}</span>
                    <span>{Math.round(progress)}%</span>
                </div>
            </div>

            {/* Step indicators */}
            <div className="space-y-2.5">
                {STEPS.map((s, i) => {
                    const Icon = s.icon;
                    const isDone = progress > s.threshold;
                    const isCurrent =
                        progress >= s.threshold &&
                        (i === STEPS.length - 1 || progress < STEPS[i + 1].threshold);
                    return (
                        <div
                            key={s.label}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-500 ${isDone
                                    ? "glass border border-brand-500/20 text-white/70"
                                    : isCurrent
                                        ? "glass border border-brand-500/40 text-brand-300"
                                        : "text-white/20"
                                }`}
                        >
                            <div
                                className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${isDone
                                        ? "bg-gradient-to-br from-brand-500 to-violet-500"
                                        : isCurrent
                                            ? "bg-brand-500/20 animate-pulse"
                                            : "bg-surface-3"
                                    }`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-xs font-medium">{s.label}</span>
                            {isDone && <div className="ml-auto text-brand-400 text-xs">✓</div>}
                            {isCurrent && (
                                <div className="ml-auto flex gap-0.5">
                                    {[0, 1, 2].map((dot) => (
                                        <div
                                            key={dot}
                                            className="w-1 h-1 rounded-full bg-brand-400 animate-bounce"
                                            style={{ animationDelay: `${dot * 0.15}s` }}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <p className="text-xs text-white/20">
                This usually takes 15–40 seconds depending on repository size.
            </p>
        </div>
    );
}
