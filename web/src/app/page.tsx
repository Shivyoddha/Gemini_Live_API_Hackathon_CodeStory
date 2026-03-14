"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import { useEffect, useState } from "react";

type GenerateResponse = {
  ok: boolean;
  jobId?: string;
  error?: string;
};

type ModeResponse = {
  ok: boolean;
  mode?: "mock" | "real-cli";
  reason?: string;
};

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export default function Home() {
  const router = useRouter();
  const [githubUrl, setGithubUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pipelineMode, setPipelineMode] = useState<"mock" | "real-cli">("mock");

  useEffect(() => {
    async function loadMode() {
      try {
        const response = await fetch("/api/walkthrough/mode", { cache: "no-store" });
        const data = (await response.json()) as ModeResponse;
        if (response.ok && data.ok && data.mode) {
          setPipelineMode(data.mode);
        }
      } catch {
        setPipelineMode("mock");
      }
    }

    void loadMode();
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/walkthrough/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubUrl }),
      });
      const data = (await response.json()) as GenerateResponse;

      if (!response.ok || !data.ok || !data.jobId) {
        throw new Error(data.error ?? "Failed to start walkthrough generation.");
      }

      router.push(`/walkthrough?jobId=${encodeURIComponent(data.jobId)}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unexpected error while starting walkthrough generation.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-[100dvh] bg-gradient-to-br from-[#F4F7FF] via-[#F9FAFF] to-[#FDFEFF] px-6 py-4 text-slate-900 overflow-hidden relative">
      <main className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-between relative z-10">
        <div className={`${inter.className} mb-4 text-center flex flex-col items-center`}>
          <div className="mb-3 flex items-center justify-center gap-2">
            <Image src="/logo.png" alt="CodeStory logo" width={120} height={32} priority />
          </div>
          <p className="font-medium tracking-[0.01em] text-[#64748B] text-xs sm:text-sm">
            Live AI Walkthrough for Any Repository
          </p>
          <h1 className="mt-3 text-[2rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-[#0F172A] sm:text-[2.5rem]">
            Turn Any GitHub Repo Into a <br />
            <span className="text-[#3B82F6]">Live AI Walkthrough</span>
          </h1>
          <p className="mt-3 text-[0.95rem] font-normal tracking-[0.005em] text-[#64748B] max-w-[540px] leading-relaxed">
            CodeStory sees your code, explains it with slides, and answers your questions in real time.
          </p>
        </div>

        <section className="w-full rounded-[2rem] bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-8 relative">
          <div className="absolute top-4 right-6">
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase ${pipelineMode === "real-cli"
                  ? "bg-emerald-50 text-[#10B981]"
                  : "bg-amber-50 text-[#F59E0B]"
                }`}
            >
              {pipelineMode === "real-cli" ? "Real CLI" : "Mock"}
            </span>
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="block text-sm font-semibold text-[#334155] mb-2.5 ml-1" htmlFor="repo-url">
                Repository URL
              </label>
              <div className="relative flex items-center">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <svg className="h-5 w-5 text-[#94A3B8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <input
                  id="repo-url"
                  type="url"
                  required
                  value={githubUrl}
                  onChange={(event) => setGithubUrl(event.target.value)}
                  placeholder="https://github.com/username/repository"
                  className="w-full rounded-full border border-[#E2E8F0] py-3.5 pl-11 pr-4 text-[#0F172A] outline-none transition-all placeholder:text-[#94A3B8] hover:border-[#CBD5E1] focus:border-[#3B82F6] focus:ring-4 focus:ring-[#3B82F6]/10"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-[#3B82F6] py-3.5 text-[15px] font-semibold tracking-wide text-white shadow-md transition-all hover:bg-[#2563EB] focus:outline-none focus:ring-4 focus:ring-[#3B82F6]/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Starting..." : "Generate Walkthrough"}
              {!isSubmitting && (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
            </button>
          </form>

          <div className="mt-5 flex flex-col items-center justify-center space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#64748B]">
              <svg className="h-4 w-4 text-[#94A3B8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Supports public GitHub repositories.
            </div>
            <div className="flex items-center gap-2 pt-2">
              <div className="h-1.5 w-10 rounded-full bg-[#CBD5E1]"></div>
              <div className="h-1.5 w-10 rounded-full bg-[#E2E8F0]"></div>
              <div className="h-1.5 w-10 rounded-full bg-[#E2E8F0]"></div>
              <div className="h-1.5 w-10 rounded-full bg-[#E2E8F0]"></div>
            </div>
          </div>

          {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-2 text-sm font-medium text-red-600 border border-red-100">{error}</p> : null}

          {/* Floating decorative icons mapping to STITCH UI */}
          <div className="absolute top-[30%] -right-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[0_4px_20px_rgb(0,0,0,0.06)] border border-[#F1F5F9] text-[#F59E0B]">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
          </div>
          <div className="absolute top-[75%] -right-6 flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-white shadow-[0_4px_20px_rgb(0,0,0,0.06)] border border-[#F1F5F9] text-[#10B981]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
          </div>
          <div className="absolute -left-8 top-1/2 flex items-center justify-center -translate-y-1/2 h-16 w-16 rounded-[1.25rem] bg-white shadow-[0_4px_20px_rgb(0,0,0,0.06)] border border-[#F1F5F9] text-[#EF4444]">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </div>
        </section>

        <div className="mt-4 text-[12px] text-[#94A3B8] font-medium tracking-wide">
          © 2024 CodeStory AI. Built for developers.
        </div>
      </main>
    </div>
  );
}
