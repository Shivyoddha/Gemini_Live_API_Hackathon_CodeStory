"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DocsPreview } from "@/components/docs-preview";
import { SlideCanvas } from "@/components/slide-canvas";
import { WalkthroughProgress } from "@/components/walkthrough-progress";
import { useLiveBidi } from "@/lib/live/useLiveBidi";
import type { WalkthroughContentResponse, WalkthroughStatusResponse } from "@/lib/walkthrough/types";

type ViewMode = "slides" | "docs";
type LiveState = "playing" | "interrupted" | "answering" | "resuming" | "idle";
type SpeechRecognitionResultLike = {
  transcript: string;
};
type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
};
type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
export default function WalkthroughPage() {
  const [jobId, setJobId] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("slides");
  const [error, setError] = useState<string | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);

  const [liveState, setLiveState] = useState<LiveState>("idle");
  const [liveAnswer, setLiveAnswer] = useState<string | null>(null);
  const [content, setContent] = useState<WalkthroughContentResponse | null>(null);
  const [job, setJob] = useState<WalkthroughStatusResponse["job"] | null>(null);
  const [isNarratingSlides, setIsNarratingSlides] = useState(false);
  const [captionText, setCaptionText] = useState<string | null>(null);
  const [narrationSegmentProgress, setNarrationSegmentProgress] = useState(0);
  const narrationRef = useRef(false);
  const narrationProgressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const narrationStartTimeRef = useRef<number>(0);
  const [narrationElapsedMs, setNarrationElapsedMs] = useState(0);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  const {
    startListening: startGeminiListening,
    stopListening: stopGeminiListening,
    sendText: sendGeminiText,
    stopPlayback: stopGeminiPlayback,
    isListening,
    assistantState,
    lastText: liveTranscript,
    streamingText: liveStreamingText,
    error: liveError,
    isReady: liveSessionReady,
    bidiEnabled: liveBidiEnabled,
  } = useLiveBidi();

  useEffect(() => {
    if (liveError) {
      setError(liveError);
    }
  }, [liveError]);

  useEffect(() => {
    setLiveAnswer(liveStreamingText ?? liveTranscript ?? null);
  }, [liveTranscript, liveStreamingText]);

  useEffect(() => {
    if (assistantState === "connecting") {
      setLiveState("interrupted");
    } else if (assistantState === "answering") {
      setLiveState("answering");
    } else if (assistantState === "interrupted") {
      setLiveState("interrupted");
    } else if (assistantState === "idle") {
      setLiveState("playing");
    }
  }, [assistantState]);

  const pollStatus = useCallback(async () => {
    const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
    const response = await fetch(`/api/walkthrough/status${query}`, { cache: "no-store" });
    const data = (await response.json()) as WalkthroughStatusResponse;
    if (!response.ok || !data.ok || !data.job) {
      throw new Error(data.error ?? "Failed to fetch walkthrough status.");
    }
    setJob(data.job);
    if (data.job.stage === "failed") {
      throw new Error(data.job.error ?? "Walkthrough generation failed.");
    }
    return data.job.stage;
  }, [jobId]);

  const fetchContent = useCallback(async () => {
    const response = await fetch("/api/walkthrough/content", { cache: "no-store" });
    const data = (await response.json()) as WalkthroughContentResponse;
    if (!response.ok || !data.ok) {
      throw new Error("Failed to load walkthrough content.");
    }
    setContent(data);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setJobId(params.get("jobId"));
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    async function startPolling() {
      try {
        const initialStage = await pollStatus();
        if (initialStage === "ready") {
          await fetchContent();
          return;
        }

        interval = setInterval(async () => {
          try {
            const stage = await pollStatus();
            if (stage === "ready" && !cancelled) {
              if (interval) {
                clearInterval(interval);
              }
              await fetchContent();
            }
          } catch (pollError) {
            if (interval) {
              clearInterval(interval);
            }
            if (!cancelled) {
              setError(
                pollError instanceof Error
                  ? pollError.message
                  : "Unexpected status polling error.",
              );
            }
          }
        }, 1500);
      } catch (initialError) {
        if (!cancelled) {
          setError(
            initialError instanceof Error
              ? initialError.message
              : "Unexpected walkthrough startup error.",
          );
        }
      }
    }

    void startPolling();

    return () => {
      cancelled = true;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [fetchContent, pollStatus]);

  // When Gemini Live is ready, log readiness. The user can click the mic button
  // to start voice input — we no longer auto-start the mic to avoid browser
  // audio pipeline crashes.
  const hasAutoStartedMicRef = useRef(false);
  useEffect(() => {
    if (!liveBidiEnabled || !liveSessionReady) return;
    if (hasAutoStartedMicRef.current) return;
    hasAutoStartedMicRef.current = true;
    console.log("[Walkthrough] Gemini Live session is ready. Mic available.");
  }, [liveBidiEnabled, liveSessionReady]);

  const modules = useMemo(() => content?.deck?.modules ?? [], [content?.deck?.modules]);
  const docs = useMemo(() => content?.docs ?? [], [content?.docs]);

  const activeModule = modules[activeSlideIndex] ?? null;

  const groupedModules = useMemo(() => {
    const groups = new Map<string, Array<{ module: (typeof modules)[number]; index: number }>>();
    modules.forEach((module, index) => {
      const deckName = module.source_deck || "Slides";
      const current = groups.get(deckName) ?? [];
      current.push({ module, index });
      groups.set(deckName, current);
    });
    return Array.from(groups.entries()).map(([deckName, entries]) => ({
      deckName,
      entries,
    }));
  }, [modules]);

  const activeModuleGroup = groupedModules[activeModuleIndex] ?? null;
  const activeModuleIndexes = useMemo(
    () => activeModuleGroup?.entries.map((entry) => entry.index) ?? [],
    [activeModuleGroup],
  );

  useEffect(() => {
    if (!groupedModules.length) {
      return;
    }
    if (activeModuleIndex >= groupedModules.length) {
      setActiveModuleIndex(0);
      setActiveSlideIndex(groupedModules[0]?.entries[0]?.index ?? 0);
      return;
    }

    const currentGroup = groupedModules[activeModuleIndex];
    if (!currentGroup) {
      return;
    }

    const activeIsInGroup = currentGroup.entries.some((entry) => entry.index === activeSlideIndex);
    if (!activeIsInGroup) {
      setActiveSlideIndex(currentGroup.entries[0]?.index ?? 0);
    }
  }, [activeModuleIndex, activeSlideIndex, groupedModules]);

  const activeSlideIndexInModule = useMemo(() => {
    if (!activeModuleIndexes.length) {
      return 0;
    }
    const foundIndex = activeModuleIndexes.findIndex((index) => index === activeSlideIndex);
    return foundIndex >= 0 ? foundIndex : 0;
  }, [activeModuleIndexes, activeSlideIndex]);

  const WORDS_PER_MINUTE = 150;
  const MS_PER_WORD = (60 * 1000) / WORDS_PER_MINUTE;

  const progressByWords = useMemo(() => {
    if (!activeModuleIndexes.length || !modules.length) {
      return {
        totalWords: 0,
        cumulativeWords: [0] as number[],
        wordCounts: [] as number[],
        durationMsPerSlide: [] as number[],
        cumulativeDurationMs: [0] as number[],
        totalDurationMs: 0,
        progressToSlideIndex: (_p: number) => 0,
      };
    }
    const wordCounts = activeModuleIndexes.map((idx) => {
      const m = modules[idx];
      if (!m) return 0;
      return buildSlideNarration(m).trim().split(/\s+/).filter(Boolean).length;
    });
    const totalWords = wordCounts.reduce((a, b) => a + b, 0);
    const cumulativeWords: number[] = [0];
    for (const w of wordCounts) {
      cumulativeWords.push(cumulativeWords[cumulativeWords.length - 1]! + w);
    }
    const durationMsPerSlide = wordCounts.map((w) => w * MS_PER_WORD);
    const cumulativeDurationMs: number[] = [0];
    for (const d of durationMsPerSlide) {
      cumulativeDurationMs.push(cumulativeDurationMs[cumulativeDurationMs.length - 1]! + d);
    }
    const totalDurationMs = cumulativeDurationMs[cumulativeDurationMs.length - 1] ?? 0;
    return {
      wordCounts,
      totalWords,
      cumulativeWords,
      durationMsPerSlide,
      cumulativeDurationMs,
      totalDurationMs,
      progressToSlideIndex: (p: number) => {
        if (totalWords <= 0) return 0;
        const target = p * totalWords;
        for (let i = 1; i <= activeModuleIndexes.length; i++) {
          if (cumulativeWords[i]! > target) return i - 1;
        }
        return activeModuleIndexes.length - 1;
      },
    };
  }, [modules, activeModuleIndexes]);

  // When using Gemini Live for narration: chain to next slide when the current turn finishes.
  // Only auto-advance if the last turn was narration (not a user interruption/question).
  const prevAssistantStateRef = useRef<"idle" | "answering" | "connecting" | "interrupted">("idle");
  const lastTurnWasNarrationRef = useRef(false);
  useEffect(() => {
    const wasAnswering = prevAssistantStateRef.current === "answering";
    prevAssistantStateRef.current = assistantState;
    if (
      wasAnswering &&
      assistantState === "idle" &&
      isNarratingSlides &&
      liveBidiEnabled &&
      lastTurnWasNarrationRef.current
    ) {
      const pos = activeModuleIndexes.findIndex((idx) => idx === activeSlideIndex);
      const nextIdx = pos >= 0 ? activeModuleIndexes[pos + 1] : undefined;
      if (nextIdx === undefined) {
        narrationRef.current = false;
        setIsNarratingSlides(false);
        setCaptionText(null);
        return;
      }
      const nextModule = modules[nextIdx];
      if (nextModule) {
        setActiveSlideIndex(nextIdx);
        const nextPos = pos + 1;
        setNarrationElapsedMs(progressByWords.cumulativeDurationMs[nextPos] ?? 0);
        const prompt = `Narrate this slide clearly and concisely for a live walkthrough. Speak only the following content:\n\n${buildSlideNarration(nextModule)}`;
        lastTurnWasNarrationRef.current = true;
        void sendGeminiText(prompt);
      }
    } else if (wasAnswering && assistantState === "idle") {
      // After a non-narration response (e.g. answering user question), don't auto-advance.
      lastTurnWasNarrationRef.current = false;
    }
  }, [assistantState, isNarratingSlides, liveBidiEnabled, activeSlideIndex, activeModuleIndexes, modules, progressByWords.cumulativeDurationMs, sendGeminiText]);

  useEffect(() => {
    if (!isNarratingSlides) return;
    const tick = () => setNarrationElapsedMs(Date.now() - narrationStartTimeRef.current);
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [isNarratingSlides]);

  const activeDocForModule = useMemo(() => {
    if (!docs.length) {
      return null;
    }

    const deckName = activeModuleGroup?.deckName ?? "";
    const deckKey = normalizeSectionKey(deckName);
    const docsWithKeys = docs.map((doc) => ({
      doc,
      sectionKey: normalizeSectionKey(doc.sectionName),
      filenameKey: normalizeSectionKey(doc.filename.replace(/\.md$/i, "")),
    }));

    if (deckKey) {
      const exactDeckMatch = docsWithKeys.find(
        ({ sectionKey, filenameKey }) => sectionKey === deckKey || filenameKey === deckKey,
      )?.doc;
      if (exactDeckMatch) {
        return exactDeckMatch;
      }

      const partialDeckMatch = docsWithKeys.find(({ sectionKey, filenameKey }) => {
        return (
          sectionKey.includes(deckKey) ||
          filenameKey.includes(deckKey) ||
          deckKey.includes(sectionKey) ||
          deckKey.includes(filenameKey)
        );
      })?.doc;
      if (partialDeckMatch) {
        return partialDeckMatch;
      }
    }

    const titleKey = normalizeSectionKey(activeModule?.title ?? "");
    if (titleKey) {
      const byTitle = docsWithKeys.find(
        ({ sectionKey, filenameKey }) => sectionKey === titleKey || filenameKey === titleKey,
      )?.doc;
      if (byTitle) {
        return byTitle;
      }

      const byTitlePartial = docsWithKeys.find(({ sectionKey, filenameKey }) => {
        return (
          sectionKey.includes(titleKey) ||
          filenameKey.includes(titleKey) ||
          titleKey.includes(sectionKey) ||
          titleKey.includes(filenameKey)
        );
      })?.doc;
      if (byTitlePartial) {
        return byTitlePartial;
      }
    }

    return null;
  }, [activeModule?.title, activeModuleGroup?.deckName, docs]);

  useEffect(() => {
    narrationRef.current = isNarratingSlides;
  }, [isNarratingSlides]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      recognitionRef.current?.stop();
    };
  }, []);

  const speakTextFallback = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, []);

  const submitQuestion = useCallback(
    async (rawQuestion: string) => {
      const trimmedQuestion = rawQuestion.trim();
      if (!trimmedQuestion) {
        return;
      }

      setLiveAnswer(null);
      setLiveState("interrupted");

      await sleep(300);
      setLiveState("answering");

      const context = [
        activeModule ? `${activeModule.title}\n${activeModule.speaker_notes}` : "",
        activeDocForModule ? activeDocForModule.markdown.slice(0, 1800) : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      try {
        const response = await fetch("/api/live/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmedQuestion, context }),
        });
        const data = (await response.json()) as { ok: boolean; answer?: string; error?: string };
        if (!response.ok || !data.ok) {
          throw new Error(data.error ?? "Failed to get live answer.");
        }
        setLiveAnswer(data.answer ?? "No answer generated.");
      } catch (askError) {
        setLiveAnswer(
          askError instanceof Error ? askError.message : "Unexpected error while fetching answer.",
        );
      }

      setLiveState("resuming");
      await sleep(400);
      setLiveState("playing");
    },
    [activeDocForModule, activeModule],
  );

  const onToggleSlideNarration = async () => {
    try {
      setViewMode("slides");
      if (narrationRef.current) {
        if (narrationProgressIntervalRef.current) {
          clearInterval(narrationProgressIntervalRef.current);
          narrationProgressIntervalRef.current = null;
        }
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
        void stopGeminiListening();
        stopGeminiPlayback();
        narrationRef.current = false;
        setIsNarratingSlides(false);
        setCaptionText(null);
        return;
      }

      if (!modules.length) {
        setError("No slides available to narrate.");
        return;
      }

      setError(null);

      // When Gemini Live is enabled but not ready yet, ask user to wait
      if (liveBidiEnabled && !liveSessionReady) {
        setError(
          assistantState === "connecting"
            ? "Connecting to Gemini Live. Please wait..."
            : "Gemini Live is not ready. Please refresh or try again.",
        );
        return;
      }

      // When Gemini Live is enabled, use it for narration so the user can interrupt anytime
      if (liveBidiEnabled && liveSessionReady) {
        narrationRef.current = true;
        setIsNarratingSlides(true);
        setCaptionText(null);
        // Stop the mic during narration to prevent speaker output from
        // feeding back into the mic and triggering Gemini's VAD, which
        // would cause unwanted interruptions.  The user can click the
        // mic button manually if they want to ask a question.
        if (isListening) {
          void stopGeminiListening();
        }
        const slideModule = modules[activeSlideIndex];
        if (slideModule) {
          const narrationPrompt = `Narrate this slide clearly and concisely for a live walkthrough. Speak only the following content:\n\n${buildSlideNarration(slideModule)}`;
          narrationStartTimeRef.current = Date.now();
          const pos = activeModuleIndexes.findIndex((idx) => idx === activeSlideIndex);
          setNarrationElapsedMs(progressByWords.cumulativeDurationMs[pos] ?? 0);
          lastTurnWasNarrationRef.current = true;
          void sendGeminiText(narrationPrompt);
        }
        return;
      }

      // Fallback: browser SpeechSynthesis (no interrupt)
      void stopGeminiListening();
      narrationRef.current = true;
      setIsNarratingSlides(true);
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setError("Speech synthesis is not supported in this browser.");
        setIsNarratingSlides(false);
        return;
      }

      narrationStartTimeRef.current = Date.now();
      setNarrationElapsedMs(0);

      const synth = window.speechSynthesis;
      if (synth.getVoices().length === 0) {
        await new Promise<void>((resolve) => {
          const onReady = () => {
            synth.removeEventListener("voiceschanged", onReady);
            resolve();
          };
          synth.addEventListener("voiceschanged", onReady);
          setTimeout(() => {
            synth.removeEventListener("voiceschanged", onReady);
            resolve();
          }, 3000);
        });
      }

      speakSlide(activeSlideIndex);
    } catch (err) {
      setIsNarratingSlides(false);
      setCaptionText(null);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  const speakSlide = (slideIndex: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setIsNarratingSlides(false);
      return;
    }

    if (slideIndex < 0 || slideIndex >= modules.length) {
      setIsNarratingSlides(false);
      return;
    }

    const slideModule = modules[slideIndex];
    if (!slideModule) {
      setIsNarratingSlides(false);
      return;
    }

    const narration = buildSlideNarration(slideModule);
    setCaptionText(narration);
    setNarrationSegmentProgress(0);

    if (narrationProgressIntervalRef.current) {
      clearInterval(narrationProgressIntervalRef.current);
      narrationProgressIntervalRef.current = null;
    }

    const totalChars = narration.length;
    const estimatedMs = Math.max(2000, (narration.split(/\s+/).length / 120) * 60 * 1000);
    const start = Date.now();
    narrationProgressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const p = Math.min(1, elapsed / estimatedMs);
      setNarrationSegmentProgress(p);
      if (p >= 1 && narrationProgressIntervalRef.current) {
        clearInterval(narrationProgressIntervalRef.current);
        narrationProgressIntervalRef.current = null;
      }
    }, 100);

    setActiveSlideIndex(slideIndex);
    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(narration);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.lang = "en-US";

    utterance.onboundary = (event: SpeechSynthesisEvent) => {
      if (narrationProgressIntervalRef.current) {
        clearInterval(narrationProgressIntervalRef.current);
        narrationProgressIntervalRef.current = null;
      }
      if (totalChars > 0 && typeof event.charIndex === "number") {
        const p = Math.min(1, event.charIndex / totalChars);
        setNarrationSegmentProgress(p);
      }
    };

    utterance.onend = () => {
      if (narrationProgressIntervalRef.current) {
        clearInterval(narrationProgressIntervalRef.current);
        narrationProgressIntervalRef.current = null;
      }
      setNarrationSegmentProgress(1);
      if (!narrationRef.current) {
        return;
      }

      const currentPosition = activeModuleIndexes.findIndex((index) => index === slideIndex);
      const nextSlideIndex =
        currentPosition >= 0 ? activeModuleIndexes[currentPosition + 1] : undefined;

      if (nextSlideIndex === undefined) {
        setIsNarratingSlides(false);
        setCaptionText(null);
        return;
      }
      speakSlide(nextSlideIndex);
    };

    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      if (narrationProgressIntervalRef.current) {
        clearInterval(narrationProgressIntervalRef.current);
        narrationProgressIntervalRef.current = null;
      }
      const err = event?.error ?? "";
      if (err === "interrupted" || err === "canceled") {
        return;
      }
      setIsNarratingSlides(false);
      setCaptionText(null);
      setError(
        `Speech synthesis failed (${err || "unknown"}). Try using a different browser or voice.`,
      );
    };

    const voices = synth.getVoices();
    const enVoice =
      voices.find((v) => v.lang.startsWith("en") && v.localService) ??
      voices.find((v) => v.lang.startsWith("en")) ??
      voices[0];
    if (enVoice) {
      utterance.voice = enVoice;
    }

    synth.speak(utterance);
  };

  const onTestSpeaker = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }
    setError(null);
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    try {
      const ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(0, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
      await sleep(250);
      if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance("If you can hear this, your speaker is working.");
        u.lang = "en-US";
        u.rate = 0.95;
        window.speechSynthesis.speak(u);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Speaker test failed. Check system volume and permissions.",
      );
    }
  }, []);

  const onToggleListening = () => {
    if (typeof window === "undefined") {
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      void stopGeminiListening().catch(() => { });
      setLiveState((current) => (current === "interrupted" ? "playing" : current));
      return;
    }

    if (liveBidiEnabled) {
      if (!liveSessionReady) {
        setError(
          assistantState === "connecting"
            ? "Connecting to Gemini Live. Please wait..."
            : "Gemini Live session is not ready. Please refresh and try again.",
        );
        return;
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      recognitionRef.current?.stop();

      setError(null);
      setLiveAnswer(null);
      setLiveState("interrupted");

      void startGeminiListening().catch((err) => {
        setLiveState("playing");
        const msg =
          err instanceof Error
            ? err.message
            : String(err ?? "Unknown error");
        setError(
          msg || "Unable to stream microphone to Gemini Live. Falling back to browser speech capture.",
        );
      });
      return;
    }

    const speechRecognitionCtor = (
      window as Window & {
        SpeechRecognition?: BrowserSpeechRecognitionConstructor;
        webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
      }
    ).SpeechRecognition ??
      (
        window as Window & {
          SpeechRecognition?: BrowserSpeechRecognitionConstructor;
          webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
        }
      ).webkitSpeechRecognition;

    if (!speechRecognitionCtor) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    void stopGeminiListening();
    stopGeminiPlayback();

    const recognition = new speechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result?.[0]?.transcript ?? "")
        .join(" ")
        .trim();

      if (!transcript) {
        return;
      }

      void submitQuestion(transcript);
    };

    recognition.onerror = () => {
      setLiveState("playing");
      setError("Unable to capture microphone input. Please allow mic access and try again.");
    };

    recognition.onend = () => {
      setLiveState((current) => (current === "interrupted" ? "playing" : current));
    };

    try {
      setError(null);
      recognitionRef.current = recognition;
      setLiveState("interrupted");
      recognition.start();
    } catch {
      setLiveState("playing");
      setError("Failed to start microphone. Please retry.");
    }
  };

  return (
    <div className="h-[100dvh] overflow-hidden bg-[#F4F7FF] p-3 text-slate-900 md:p-6">
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-md border-b border-[#E2E8F0] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="CodeStory logo" width={108} height={30} priority />
          <div>
            <h1 className="text-base font-bold text-[#0F172A] leading-none">CodeStory</h1>
            <p className="text-[11px] font-medium text-[#64748B] mt-1 tracking-wide">Live Walkthrough</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-8 text-[13px] font-semibold text-[#64748B]">
          <button className="hover:text-[#0F172A] transition-colors">Dashboard</button>
          <button className="text-[#3B82F6]">Walkthroughs</button>
          <button className="hover:text-[#0F172A] transition-colors">Settings</button>
        </div>

        <div className="flex items-center gap-4">
          <button className="relative text-[#64748B] hover:text-[#0F172A] transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-[#EF4444] border-2 border-white"></span>
          </button>
          <div className="w-8 h-8 rounded-lg bg-[#F1F5F9] border border-[#E2E8F0] overflow-hidden flex items-center justify-center text-[#64748B] font-medium text-xs">
            <div className="w-full h-full bg-[#FDBA74] opacity-40"></div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid h-[calc(100dvh-84px)] max-w-[1400px] gap-4 lg:grid-cols-[320px_1fr] pt-18 relative">
        <aside className="rounded-[1.5rem] bg-white p-4 shadow-[0_2px_12px_rgb(0,0,0,0.03)] border border-[#E2E8F0] h-full flex flex-col relative z-10 overflow-hidden">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-5 h-5 text-[#334155]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                <h1 className="text-[15px] font-bold text-[#0F172A] tracking-tight">{job?.githubUrl?.split("/").pop() || "CodeStory"}</h1>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#64748B]">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>{job?.id?.slice(0, 7) || "latest"}</span>
              </div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase ${liveBidiEnabled ? "bg-[#ECFDF5] text-[#10B981]" : "bg-[#F0FDF4] text-[#16A34A]"
              }`}>
              {liveBidiEnabled ? "LIVE" : "MOCK"}
            </span>
          </div>

          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            Modules
          </p>

          <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-1 scrollbar-thin scrollbar-thumb-[#CBD5E1] scrollbar-track-transparent">
            <div className="space-y-1">
              {groupedModules.map((group, groupIndex) => {
                const isActive = groupIndex === activeModuleIndex;
                return (
                  <button
                    key={group.deckName}
                    type="button"
                    onClick={() => {
                      setActiveModuleIndex(groupIndex);
                      setActiveSlideIndex(group.entries[0]?.index ?? 0);
                    }}
                    className={`w-full group rounded-xl px-3 py-2.5 text-left transition-all duration-200 border border-transparent ${isActive ? "bg-[#EFF6FF] border-[#BFDBFE] shadow-sm" : "hover:bg-[#F8FAFC]"
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-[12px] font-semibold ${isActive ? "text-[#1D4ED8]" : "text-[#64748B]"}`}
                      >
                        {String(groupIndex + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3
                          className={`truncate text-[13px] font-semibold ${isActive ? "text-[#1D4ED8]" : "text-[#0F172A] group-hover:text-[#3B82F6]"
                            }`}
                        >
                          {formatSectionName(group.deckName)}
                        </h3>
                      </div>
                      {isActive ? <div className="w-2 h-2 rounded-full bg-[#3B82F6] shrink-0 animate-pulse" /> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

        </aside>

        <section className="flex flex-col h-full gap-3 relative overflow-hidden">
          <div className="flex shrink-0 justify-end">
            <div className="inline-flex rounded-full border border-[#E2E8F0] bg-white p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("slides")}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${viewMode === "slides" ? "bg-[#3B82F6] text-white" : "text-[#475569] hover:bg-[#F8FAFC]"
                  }`}
              >
                Slides
              </button>
              <button
                type="button"
                onClick={() => setViewMode("docs")}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${viewMode === "docs" ? "bg-[#3B82F6] text-white" : "text-[#475569] hover:bg-[#F8FAFC]"
                  }`}
              >
                Documentation
              </button>
            </div>
          </div>

          {error ? (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 rounded-full border border-red-200 bg-white/90 px-6 py-2 text-[13px] font-medium text-red-600 shadow-xl backdrop-blur-md">
              {error}
            </div>
          ) : null}

          <div className="relative flex-1 min-h-0 rounded-[1.5rem] flex flex-col overflow-hidden">
            {/* Very faint background decoration */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-50/50 rounded-full blur-[100px] pointer-events-none -z-10"></div>

            {viewMode === "slides" ? (
              <>
                <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20">
                  <button
                    type="button"
                    onClick={() => {
                      const prevIndex = activeModuleIndexes[activeSlideIndexInModule - 1];
                      if (prevIndex !== undefined) {
                        setActiveSlideIndex(prevIndex);
                      }
                    }}
                    disabled={activeSlideIndexInModule <= 0}
                    className="w-11 h-11 flex items-center justify-center rounded-full bg-white/95 shadow-[0_4px_20px_rgb(0,0,0,0.08)] text-[#64748B] hover:text-[#0F172A] disabled:opacity-0 transition-all border border-[#F1F5F9]"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                </div>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20">
                  <button
                    type="button"
                    onClick={() => {
                      const nextIndex = activeModuleIndexes[activeSlideIndexInModule + 1];
                      if (nextIndex !== undefined) {
                        setActiveSlideIndex(nextIndex);
                      }
                    }}
                    disabled={activeSlideIndexInModule >= activeModuleIndexes.length - 1}
                    className="w-11 h-11 flex items-center justify-center rounded-full bg-white/95 shadow-[0_4px_20px_rgb(0,0,0,0.08)] text-[#64748B] hover:text-[#0F172A] disabled:opacity-0 transition-all border border-[#F1F5F9]"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              </>
            ) : null}

            {viewMode === "slides" ? (
              <>
                <div className="flex-1 min-h-0 overflow-auto">
                  <SlideCanvas
                    module={activeModule}
                    currentSlideNumber={activeSlideIndexInModule + 1}
                    totalSlides={activeModuleIndexes.length}
                  />
                </div>
                <div className="shrink-0 px-4 pb-3 pt-2 border-t border-[#E2E8F0] bg-white/90 rounded-b-[1.25rem]">
                  {(captionText || liveAnswer) ? (
                    <CaptionBlock
                      text={liveAnswer ?? captionText ?? ""}
                      readProgress={
                        liveAnswer
                          ? liveState === "answering"
                            ? 0
                            : 1
                          : isNarratingSlides
                            ? narrationSegmentProgress
                            : 0
                      }
                      isLive={liveState === "answering"}
                      slidingTwoLines={!!(captionText || liveAnswer)}
                    />
                  ) : null}
                  {assistantState === "interrupted" ? (
                    <p className="text-xs font-medium text-amber-600 mt-1.5">[Interrupted]</p>
                  ) : null}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-medium text-[#64748B]">
                      <span>
                        {(
                          (progressByWords.totalDurationMs > 0
                            ? (isNarratingSlides
                              ? narrationElapsedMs
                              : progressByWords.cumulativeDurationMs[activeSlideIndexInModule] ?? 0)
                            : 0) / 60000
                        ).toFixed(2)}
                      </span>
                      <span>
                        {" "}
                        / {((progressByWords.totalDurationMs ?? 0) / 60000).toFixed(2)} min
                      </span>
                    </div>
                    <WalkthroughProgress
                      progress={(() => {
                        const totalMs = progressByWords.totalDurationMs;
                        if (totalMs <= 0) return 0;
                        const elapsed = isNarratingSlides
                          ? narrationElapsedMs
                          : progressByWords.cumulativeDurationMs[activeSlideIndexInModule] ?? 0;
                        const value = elapsed / totalMs;
                        return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
                      })()}
                      onSeek={(p) => {
                        const totalSlides = activeModuleIndexes.length;
                        const slideIndex =
                          progressByWords.totalWords > 0
                            ? progressByWords.progressToSlideIndex(p)
                            : Math.min(
                              totalSlides - 1,
                              Math.max(0, Math.floor(p * totalSlides)),
                            );
                        const globalIndex = activeModuleIndexes[slideIndex];
                        if (globalIndex === undefined) return;
                        setActiveSlideIndex(globalIndex);
                        if (isNarratingSlides) {
                          if (typeof window !== "undefined" && "speechSynthesis" in window) {
                            window.speechSynthesis.cancel();
                          }
                          if (narrationProgressIntervalRef.current) {
                            clearInterval(narrationProgressIntervalRef.current);
                            narrationProgressIntervalRef.current = null;
                          }
                          const cumMs = progressByWords.cumulativeDurationMs[slideIndex] ?? 0;
                          narrationStartTimeRef.current = Date.now() - cumMs;
                          setNarrationElapsedMs(cumMs);
                          speakSlide(globalIndex);
                        }
                      }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <DocsPreview markdown={activeDocForModule?.markdown ?? null} />
            )}
          </div>

          <div className="shrink-0 flex items-center justify-center gap-5 pt-2">
            <button
              type="button"
              onClick={onToggleListening}
              className={`h-11 w-11 flex items-center justify-center rounded-full border transition ${isListening
                ? "bg-[#EF4444] text-white border-[#EF4444]"
                : "bg-white text-[#64748B] border-[#E2E8F0] hover:text-[#0F172A] hover:border-[#CBD5E1]"
                }`}
              title={
                liveBidiEnabled
                  ? isListening
                    ? "Mic on. Speak anytime to ask or interrupt. Click to mute."
                    : "Mic off. Click to turn on (Gemini Live)."
                  : isListening
                    ? "Stop Microphone"
                    : "Start Microphone"
              }
            >
              <svg className={`w-5 h-5 ${isListening ? "animate-pulse" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={onToggleSlideNarration}
              className="h-12 min-w-[120px] px-5 inline-flex items-center justify-center gap-2 rounded-full bg-[#3B82F6] text-white text-[13px] font-semibold shadow-md shadow-blue-500/20 transition hover:bg-[#2563EB]"
              title={
                isNarratingSlides
                  ? "Stop narration"
                  : liveBidiEnabled
                    ? "Play narration with Gemini Live (speak anytime to interrupt)"
                    : "Play narration"
              }
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                  clipRule="evenodd"
                />
              </svg>
              {isNarratingSlides ? "Stop" : "Play"}
            </button>

            <button
              type="button"
              onClick={() => {
                if (narrationProgressIntervalRef.current) {
                  clearInterval(narrationProgressIntervalRef.current);
                  narrationProgressIntervalRef.current = null;
                }
                if (typeof window !== "undefined" && "speechSynthesis" in window) {
                  window.speechSynthesis.cancel();
                }
                void stopGeminiListening();
                stopGeminiPlayback();
                narrationRef.current = false;
                setIsNarratingSlides(false);
                setCaptionText(null);
              }}
              className="h-11 w-11 flex items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition hover:text-[#0F172A] hover:border-[#CBD5E1]"
              title="Stop voice output"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M11 5 6 9H3v6h3l5 4V5Z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 9v6M16 7v10" />
              </svg>
            </button>

            <button
              type="button"
              onClick={onTestSpeaker}
              className="rounded-full border border-[#E2E8F0] bg-white px-3 py-2 text-[11px] font-medium text-[#64748B] transition hover:border-[#CBD5E1] hover:text-[#0F172A]"
              title="Play a short tone and spoken phrase to verify audio"
            >
              Test speaker
            </button>
          </div>

          {liveAnswer ? (
            <div className="shrink-0 rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 text-[13px] text-[#334155] shadow-sm max-w-md">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                Voice reply
              </p>
              <p className="line-clamp-2 text-[#334155]">{liveAnswer}</p>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitIntoLines(text: string, maxCharsPerLine = 48): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (next.length <= maxCharsPerLine) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function CaptionBlock({
  text,
  readProgress,
  isLive,
  slidingTwoLines = false,
}: {
  text: string;
  readProgress: number;
  isLive: boolean;
  slidingTwoLines?: boolean;
}) {
  if (slidingTwoLines && text.trim()) {
    const lines = splitIntoLines(text);
    if (lines.length === 0) return null;
    const fullText = lines.join(" ");
    const totalChars = fullText.length;
    if (totalChars === 0) return null;
    const readCharIndex = Math.min(totalChars, Math.floor(readProgress * totalChars));

    const lineLengths = lines.map((l) => l.length);
    const cumulativeChars: number[] = [0];
    for (let i = 0; i < lineLengths.length; i++) {
      cumulativeChars.push(cumulativeChars[cumulativeChars.length - 1]! + lineLengths[i]! + (i < lineLengths.length - 1 ? 1 : 0));
    }

    const lastWindowStart = Math.max(0, lines.length - 2);
    const windowStart =
      lines.length <= 2
        ? 0
        : Math.min(
          lastWindowStart,
          Math.max(0, Math.floor(readProgress * (lines.length - 1))),
        );
    const blockStartChar = cumulativeChars[windowStart] ?? 0;
    const blockEndChar = cumulativeChars[windowStart + 2] ?? totalChars;
    const readInBlock = Math.max(
      0,
      Math.min(blockEndChar - blockStartChar, readCharIndex - blockStartChar),
    );
    const blockText = fullText.slice(blockStartChar, blockEndChar);
    let splitAt = readInBlock;
    while (splitAt < blockText.length && blockText[splitAt] !== " " && blockText[splitAt] !== "\n") {
      splitAt += 1;
    }
    const readPart = blockText.slice(0, splitAt);
    const unreadPart = blockText.slice(splitAt);

    return (
      <div className="mb-2 px-3 py-2 rounded-lg bg-black/80 backdrop-blur-sm min-h-[2.5rem] flex items-center">
        <p className="text-[13px] leading-relaxed line-clamp-2 text-white/95 w-full">
          {readPart ? <span className="text-blue-400">{readPart}</span> : null}
          {unreadPart ? <span className="text-white/95">{unreadPart}</span> : null}
        </p>
      </div>
    );
  }

  const words = text.trim().split(/\s+/).filter(Boolean);
  const readCount = Math.floor(readProgress * words.length);
  const readPart = words.slice(0, readCount).join(" ");
  const unreadPart = words.slice(readCount).join(" ");

  return (
    <div className="mb-2 px-3 py-2 rounded-lg bg-black/80 backdrop-blur-sm min-h-[2.5rem] flex items-center">
      {isLive ? (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse mr-2 shrink-0 align-middle" />
      ) : null}
      <p
        className="text-[13px] leading-relaxed line-clamp-2 text-white/95"
        style={{ display: "block" }}
      >
        {readPart ? (
          <span className="text-blue-400">{readPart}</span>
        ) : null}
        {readPart && unreadPart ? " " : null}
        {unreadPart ? (
          <span className="text-white/95">{unreadPart}</span>
        ) : null}
        {!readPart && !unreadPart ? (
          <span className="text-white/95">&nbsp;</span>
        ) : null}
      </p>
    </div>
  );
}

function normalizeLookupKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeSectionKey(value: string): string {
  return normalizeLookupKey(value).replace(/^\d+/, "").replace(/(documentation|docs|section|module)$/i, "");
}

function formatSectionName(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildSlideNarration(
  module: NonNullable<WalkthroughContentResponse["deck"]>["modules"][number],
): string {
  if (!module) return "";
  if (module.speaker_notes?.trim()) {
    return module.speaker_notes.trim();
  }
  const sections = module.sections ?? [];
  const sectionNarration = sections
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map((section) => {
      const title = section?.title ? `${section.title}. ` : "";

      if (section.type === "bullets" && section.items?.length) {
        return `${title}${section.items.join(". ")}`;
      }

      if (section.type === "code" && section.code) {
        return `${title}Code snippet: ${section.code.slice(0, 500)}`;
      }

      if (section.type === "mermaid" && section.code) {
        return `${title}Diagram explanation section.`;
      }

      if (section.type === "text" && section.text) {
        return `${title}${section.text}`;
      }

      if (section.type === "image" && section.urls?.length) {
        return `${title}Visual reference slide with supporting image.`;
      }

      return title.trim();
    })
    .filter(Boolean)
    .join(". ");

  return [module.title, module.subtitle, sectionNarration].filter(Boolean).join(". ");
}
