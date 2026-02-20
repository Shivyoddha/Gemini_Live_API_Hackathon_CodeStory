"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Highlight, themes } from "prism-react-renderer";
import type { SlideData } from "@/app/session/[id]/page";
import { FileCode, Layers } from "lucide-react";

interface SlideEngineProps {
    slide: SlideData | null;
    isAgentSpeaking: boolean;
}

export default function SlideEngine({ slide, isAgentSpeaking }: SlideEngineProps) {
    if (!slide) {
        return (
            <div className="flex-1 flex items-center justify-center text-center p-12">
                <div className="space-y-4">
                    <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-white/10 flex items-center justify-center mx-auto">
                        <Layers className="w-7 h-7 text-white/20" />
                    </div>
                    <p className="text-white/25 text-sm">Slides will appear here as the story unfolds…</p>
                    {isAgentSpeaking && (
                        <div className="flex items-center justify-center gap-1.5 mt-2">
                            {[...Array(5)].map((_, i) => (
                                <div
                                    key={i}
                                    className="w-0.5 rounded-full bg-brand-500"
                                    style={{
                                        height: `${12 + Math.random() * 20}px`,
                                        animation: `waveform 1.2s ease-in-out ${i * 0.15}s infinite`,
                                    }}
                                />
                            ))}
                            <span className="ml-2 text-brand-400 text-xs">AI is speaking…</span>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={slide.header}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="flex-1 flex flex-col gap-4 p-6 overflow-auto"
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-2 h-2 rounded-full bg-gradient-to-r from-brand-500 to-violet-500" />
                            {isAgentSpeaking && (
                                <div className="flex items-center gap-1">
                                    {[...Array(4)].map((_, i) => (
                                        <div
                                            key={i}
                                            className="w-0.5 h-3 rounded-full bg-brand-500"
                                            style={{ animation: `waveform 1.2s ease-in-out ${i * 0.1}s infinite` }}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                        <h2 className="text-3xl font-bold text-white leading-tight">{slide.header}</h2>
                    </div>
                    {slide.visual_type && slide.visual_type !== "none" && (
                        <span className="px-2.5 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs capitalize flex-shrink-0">
                            {slide.visual_type}
                        </span>
                    )}
                </div>

                {/* Code block */}
                {slide.code && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="rounded-xl overflow-hidden border border-white/8"
                    >
                        {/* Code toolbar */}
                        <div className="flex items-center justify-between px-4 py-2.5 bg-surface-3 border-b border-white/8">
                            <div className="flex items-center gap-2.5">
                                <div className="flex gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                                </div>
                                {slide.code.file && (
                                    <div className="flex items-center gap-1.5">
                                        <FileCode className="w-3 h-3 text-white/30" />
                                        <span className="text-xs text-white/40 font-mono">{slide.code.file}</span>
                                        {slide.code.lines && (
                                            <span className="text-xs text-white/25">:{slide.code.lines}</span>
                                        )}
                                    </div>
                                )}
                            </div>
                            <span className="text-xs text-white/25 font-mono uppercase tracking-wider">
                                {slide.code.language}
                            </span>
                        </div>

                        {/* Code content */}
                        <div className="overflow-x-auto bg-surface-2">
                            <Highlight
                                theme={themes.nightOwl}
                                code={slide.code.content.trim()}
                                language={slide.code.language as "python" | "javascript" | "typescript" | "jsx" | "tsx" | "go" | "bash"}
                            >
                                {({ className, style, tokens, getLineProps, getTokenProps }) => (
                                    <pre
                                        className={`${className} text-sm p-4 leading-7 font-mono`}
                                        style={{ ...style, background: "transparent" }}
                                    >
                                        {tokens.map((line, i) => (
                                            <div key={i} {...getLineProps({ line })} className="flex">
                                                <span className="select-none w-8 text-right text-white/20 mr-4 flex-shrink-0 text-xs leading-7">
                                                    {i + 1}
                                                </span>
                                                <span>
                                                    {line.map((token, key) => (
                                                        <span key={key} {...getTokenProps({ token })} />
                                                    ))}
                                                </span>
                                            </div>
                                        ))}
                                    </pre>
                                )}
                            </Highlight>
                        </div>
                    </motion.div>
                )}

                {/* Narrative notes */}
                {slide.narrative_notes && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                        className="glass rounded-xl px-5 py-4 border-l-2 border-brand-500/50"
                    >
                        <p className="text-sm text-white/60 leading-relaxed italic">{slide.narrative_notes}</p>
                    </motion.div>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
