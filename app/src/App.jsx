import { useState, useEffect, useCallback } from "react";
import LiveAPIDemo from "./components/LiveAPIDemo";
import GitHubInputPage from "./components/GitHubInputPage";
import PipelineProgress from "./components/PipelineProgress";
import "./App.css";

/**
 * Dev flow only: set VITE_DEV_SKIP_PIPELINE=true to skip the GitHub URL input
 * and go straight to the dashboard (use existing documentation/ and slides/).
 * Debug and Prod flows leave this unset or false so the app starts at the GitHub URL step.
 */
const DEV_MODE = import.meta.env.VITE_DEV_SKIP_PIPELINE === "true";

export default function App() {
  // 'input' | 'running' | 'dashboard'
  const [page, setPage] = useState(DEV_MODE ? "dashboard" : "input");
  const [jobId, setJobId] = useState(null);
  const [repoUrl, setRepoUrl] = useState("");

  const handleJobStarted = useCallback((id, url) => {
    setJobId(id);
    setRepoUrl(url);
    setPage("running");
  }, []);

  const handlePipelineComplete = useCallback(() => {
    setPage("dashboard");
  }, []);

  if (page === "input") {
    return <GitHubInputPage onJobStarted={handleJobStarted} />;
  }

  if (page === "running") {
    return (
      <PipelineProgress
        jobId={jobId}
        repoUrl={repoUrl}
        onComplete={handlePipelineComplete}
      />
    );
  }

  // dashboard — render the Live API demo in full-screen mode
  return (
    <div className="App App--dashboard">
      <LiveAPIDemo />
    </div>
  );
}
