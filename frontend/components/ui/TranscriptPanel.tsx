"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TranscriptEntry } from "@/app/session/[id]/page";
import { Bot, User } from "lucide-react";

interface TranscriptPanelProps {
    entries: TranscriptEntry[];
}

export default function TranscriptPanel({ entries }: TranscriptPanelProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [entries]);

    if (entries.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center text-center p-6">
                <div className="space-y-3">
                    <div className="w-10 h-10 rounded-xl border border-dashed border-white/10 flex items-center justify-center mx-auto">
                        <Bot className="w-5 h-5 text-white/15" />
                    </div>
                    <p className="text-white/20 text-xs leading-relaxed">
                        Conversation transcript will appear here once the session begins.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
            <AnimatePresence initial={false}>
                {entries.map((entry) => (
                    <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className={`flex gap-2.5 ${entry.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                    >
                        <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${entry.role === "agent"
                                    ? "bg-gradient-to-br from-brand-500 to-violet-500"
                                    : "bg-surface-4 border border-white/10"
                                }`}
                        >
                            {entry.role === "agent" ? (
                                <Bot className="w-3.5 h-3.5 text-white" />
                            ) : (
                                <User className="w-3.5 h-3.5 text-white/50" />
                            )}
                        </div>
                        <div
                            className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${entry.role === "agent"
                                    ? "glass border border-white/8 text-white/70"
                                    : "bg-brand-500/15 border border-brand-500/20 text-brand-200"
                                }`}
                        >
                            {entry.text}
                            <div className="text-right mt-1 opacity-40 text-[10px]">
                                {new Date(entry.timestamp).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                })}
                            </div>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
            <div ref={bottomRef} />
        </div>
    );
}
