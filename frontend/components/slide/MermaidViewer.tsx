"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

// Mermaid is loaded dynamically because it uses browser APIs
declare global {
    interface Window {
        mermaid: {
            initialize: (config: object) => void;
            render: (id: string, definition: string) => Promise<{ svg: string }>;
        };
    }
}

interface MermaidViewerProps {
    chart: string;
}

export default function MermaidViewer({ chart }: MermaidViewerProps) {
    const [svg, setSvg] = useState<string>("");
    const [error, setError] = useState<string>("");
    const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);

    useEffect(() => {
        const renderChart = async () => {
            try {
                if (!window.mermaid) {
                    const mermaid = (await import("mermaid")).default;
                    mermaid.initialize({
                        startOnLoad: false,
                        theme: "dark",
                        themeVariables: {
                            primaryColor: "#6272fa",
                            primaryTextColor: "#ffffff",
                            primaryBorderColor: "#4f52ef",
                            lineColor: "#6272fa",
                            secondaryColor: "#1d1e35",
                            tertiaryColor: "#161729",
                            background: "#0f1020",
                            mainBkg: "#161729",
                            nodeBorder: "#6272fa",
                            clusterBkg: "#1d1e35",
                            titleColor: "#ffffff",
                            edgeLabelBackground: "#1d1e35",
                        },
                    });
                    (window as Window).mermaid = mermaid as Window["mermaid"];
                }
                const { svg: renderedSvg } = await window.mermaid.render(idRef.current, chart);
                setSvg(renderedSvg);
                setError("");
            } catch (err) {
                setError("Failed to render diagram.");
                console.error("Mermaid error:", err);
            }
        };
        renderChart();
    }, [chart]);

    if (error) {
        return (
            <div className="glass rounded-xl p-4 border border-red-500/20 text-red-400 text-sm">
                ⚠️ {error}
            </div>
        );
    }

    if (!svg) {
        return (
            <div className="glass rounded-xl p-6 animate-pulse">
                <div className="h-32 bg-white/5 rounded-lg" />
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mermaid-container glass rounded-xl p-4 border border-brand-500/20 overflow-x-auto"
        >
            <div
                className="flex justify-center"
                dangerouslySetInnerHTML={{ __html: svg }}
            />
        </motion.div>
    );
}
