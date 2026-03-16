import React, { useState } from "react";
import { API_BASE, getSessionId } from "../config";
import "./GitHubInputPage.css";

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
        body: JSON.stringify({ url: trimmed, session_id: getSessionId() }),
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
      <div className="gh-center">
        {/* logo */}
        <div className="gh-brand">
          <img src="/logo.png" alt="" className="gh-brand__logo" />
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

      </div>
    </div>
  );
}
