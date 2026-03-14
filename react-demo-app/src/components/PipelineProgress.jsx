import React, { useState, useEffect, useRef } from "react";
import "./PipelineProgress.css";

const API_BASE = "http://localhost:8081";
const POLL_INTERVAL = 2000;

const STATUS_LABELS = {
  queued:   { label: "Queued",               step: 0 },
  cloning:  { label: "Cloning repository…",  step: 1 },
  running:  { label: "Generating content…",  step: 2 },
  indexing: { label: "Indexing into ChromaDB…", step: 3 },
  done:     { label: "Complete!",            step: 4 },
  error:    { label: "Error",                step: -1 },
};

const STEPS = ["Clone repo", "Generate docs & slides", "Index content", "Ready"];

export default function PipelineProgress({ jobId, repoUrl, onComplete }) {
  const [status, setStatus] = useState("queued");
  const [message, setMessage] = useState("Pipeline queued…");
  const [dots, setDots] = useState(".");
  const timerRef = useRef(null);
  const dotsRef = useRef(null);

  // animated ellipsis
  useEffect(() => {
    dotsRef.current = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 500);
    return () => clearInterval(dotsRef.current);
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/pipeline-status/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setStatus(data.status);
        setMessage(data.message || "");

        if (data.status === "done") {
          clearInterval(timerRef.current);
          // small delay so user sees "Complete!" before transitioning
          setTimeout(() => onComplete(), 1200);
        } else if (data.status === "error") {
          clearInterval(timerRef.current);
        }
      } catch {
        // server not reachable yet — keep polling
      }
    };

    poll(); // immediate first check
    timerRef.current = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [jobId, onComplete]);

  const info = STATUS_LABELS[status] || STATUS_LABELS.running;
  const isError = status === "error";

  return (
    <div className="pp-page">
      <div className="pp-blob pp-blob--1" />
      <div className="pp-blob pp-blob--2" />

      <div className="pp-card">
        {/* icon */}
        <div className={`pp-icon ${isError ? "pp-icon--error" : ""}`}>
          {isError ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#EF4444" strokeWidth="2"/>
              <line x1="12" y1="8" x2="12" y2="12" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="16" r="1" fill="#EF4444"/>
            </svg>
          ) : status === "done" ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#22C55E" strokeWidth="2"/>
              <path d="M8 12l3 3 5-5" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <div className="pp-spinner" />
          )}
        </div>

        {/* title */}
        <h2 className="pp-title">
          {isError ? "Pipeline failed" : status === "done" ? "Done! Loading dashboard…" : `Processing${dots}`}
        </h2>

        {/* repo url */}
        <p className="pp-repo">{repoUrl}</p>

        {/* step track */}
        <div className="pp-steps">
          {STEPS.map((s, i) => {
            const active = i === info.step - 1;
            const done   = info.step > i + 1 || status === "done";
            return (
              <div key={i} className={`pp-step ${done ? "pp-step--done" : ""} ${active ? "pp-step--active" : ""}`}>
                <div className="pp-step__dot">
                  {done ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span className="pp-step__label">{s}</span>
                {i < STEPS.length - 1 && <div className={`pp-step__line ${done ? "pp-step__line--done" : ""}`} />}
              </div>
            );
          })}
        </div>

        {/* live message */}
        <p className="pp-message">{message}</p>

        {isError && (
          <a className="pp-retry" href="/">
            ← Try a different repository
          </a>
        )}
      </div>
    </div>
  );
}
