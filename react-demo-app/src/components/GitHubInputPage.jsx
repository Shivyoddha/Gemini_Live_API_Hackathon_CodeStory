import React, { useState } from "react";
import "./GitHubInputPage.css";

const API_BASE = "http://localhost:8081";

export default function GitHubInputPage({ onJobStarted }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please enter a GitHub repository URL.");
      return;
    }
    if (!trimmed.startsWith("https://github.com/") && !trimmed.startsWith("http://github.com/")) {
      setError("Please enter a valid GitHub URL (https://github.com/...)");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/run-pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      onJobStarted(data.jobId, trimmed);
    } catch (err) {
      setError(`Failed to start pipeline: ${err.message}. Make sure server.py is running.`);
      setLoading(false);
    }
  };

  return (
    <div className="gh-page">
      {/* decorative blobs */}
      <div className="gh-blob gh-blob--1" />
      <div className="gh-blob gh-blob--2" />
      <div className="gh-blob gh-blob--3" />

      <div className="gh-center">
        {/* logo / brand */}
        <div className="gh-brand">
          <div className="gh-brand__icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="gh-brand__name">CodeStory</span>
        </div>

        <h1 className="gh-headline">
          Turn Any GitHub Repo Into a<br />
          <span className="gh-headline--accent">Live AI Walkthrough</span>
        </h1>
        <p className="gh-sub">
          Paste a public GitHub URL and let the pipeline clone, analyse, and generate
          an interactive slide deck — then talk to Gemini Live about the codebase.
        </p>

        {/* card */}
        <div className="gh-card">
          <form className="gh-form" onSubmit={handleSubmit}>
            <div className="gh-input-wrap">
              <span className="gh-input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
                    stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                    stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              <input
                className="gh-input"
                type="text"
                placeholder="https://github.com/owner/repository"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(""); }}
                disabled={loading}
                autoFocus
              />
            </div>

            {error && <p className="gh-error">{error}</p>}

            <button className="gh-btn" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="gh-spinner" />
                  Starting pipeline…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Generate Walkthrough
                </>
              )}
            </button>
          </form>

          <div className="gh-steps">
            {["Clone & analyse repo", "Generate docs + slides", "Load into Gemini Live"].map((s, i) => (
              <div className="gh-step" key={i}>
                <span className="gh-step__dot" />
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="gh-footer">
          In dev mode? Restart with <code>VITE_DEV_SKIP_PIPELINE=true</code> to go directly to the dashboard.
        </p>
      </div>
    </div>
  );
}
