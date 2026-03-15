import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BsMicFill, BsMicMuteFill, BsVolumeUpFill, BsDisplay, BsFileText, BsChatDots } from "react-icons/bs";
import { GeminiLiveAPI, MultimodalLiveResponseType } from "../utils/gemini-api";
import {
  AudioStreamer,
  VideoStreamer,
  ScreenCapture,
  AudioPlayer,
} from "../utils/media-utils";
import { ShowAlertTool, AddCSSStyleTool, SwitchSlideTool, SearchDocsTool, DownloadContentTool, ShowDynamicSlideTool } from "../utils/tools";
import SlideCanvas from "./SlideCanvas";
import { API_BASE, getSessionId } from "../config";
import "./LiveAPIDemo.css";

const CONTENT_API_URL = `${API_BASE}/content`;

/** Renders a Mermaid diagram from chart source (used in doc view for ```mermaid code blocks). */
function MermaidBlock({ chart }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(null);
  const id = useMemo(() => `mermaid-${Math.random().toString(36).slice(2, 10)}`, []);

  useEffect(() => {
    let cancelled = false;
    async function renderMermaid() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: "default",
        });
        const { svg: renderedSvg } = await mermaid.render(id, chart);
        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to render diagram");
        }
      }
    }
    renderMermaid();
    return () => { cancelled = true; };
  }, [chart, id]);

  if (error) {
    return (
      <pre className="doc-view-mermaid-fallback">
        <code>{chart}</code>
      </pre>
    );
  }
  if (!svg) {
    return <div className="doc-view-mermaid-loading">Rendering diagram…</div>;
  }
  return (
    <div className="doc-view-mermaid-wrap">
      <div className="doc-view-mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

function SlideControlBar({ audioStreaming, toggleAudio, screenSharing, toggleScreen, volume, handleVolumeChange, showVolumeSlider, setShowVolumeSlider }) {
  return (
    <div className="slide-controls">
      {/* Mic */}
      <button
        type="button"
        className={`slide-control-btn${audioStreaming ? " slide-control-btn--active" : ""}`}
        onClick={toggleAudio}
        title={audioStreaming ? "Mic on" : "Mic off"}
      >
        {audioStreaming ? <BsMicFill size={19} /> : <BsMicMuteFill size={19} />}
      </button>

      {/* Volume */}
      <div className="slide-control-volume">
        {showVolumeSlider && (
          <div className="slide-control-volume__slider">
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              title={`Volume ${volume}%`}
            />
            <span className="slide-control-volume__pct">{volume}%</span>
          </div>
        )}
        <button
          type="button"
          className={`slide-control-btn${showVolumeSlider ? " slide-control-btn--active" : ""}`}
          onClick={() => setShowVolumeSlider((v) => !v)}
          title={`Volume ${volume}%`}
        >
          <BsVolumeUpFill size={19} />
        </button>
      </div>

      {/* Share screen */}
      <button
        type="button"
        className={`slide-control-btn${screenSharing ? " slide-control-btn--active" : ""}`}
        onClick={toggleScreen}
        title={screenSharing ? "Stop sharing" : "Share screen"}
      >
        <BsDisplay size={19} />
      </button>
    </div>
  );
}

const LiveAPIDemo = () => {
  // Connection State
  const [connected, setConnected] = useState(false);
  const [debugInfo, setDebugInfo] = useState("Ready to connect...");
  const [setupJson, setSetupJson] = useState(null);

  // Configuration State
  const [proxyUrl, setProxyUrl] = useState(
    localStorage.getItem("proxyUrl") || "ws://localhost:8080"
  );
  const [projectId, setProjectId] = useState(
    localStorage.getItem("projectId") || ""
  );
  const [model, setModel] = useState(
    localStorage.getItem("model") ||
      "gemini-live-2.5-flash-native-audio"
  );

  useEffect(() => {
    localStorage.setItem("proxyUrl", proxyUrl);
    localStorage.setItem("projectId", projectId);
    localStorage.setItem("model", model);
  }, [proxyUrl, projectId, model]);
  const [systemInstructions, setSystemInstructions] = useState(
    "You are a helpful assistant. Be concise and friendly."
  );
  const [voice, setVoice] = useState("Puck");
  const [temperature, setTemperature] = useState(1.0);
  const [enableProactiveAudio, setEnableProactiveAudio] = useState(true);
  const [enableGrounding, setEnableGrounding] = useState(false);
  const [enableAffectiveDialog, setEnableAffectiveDialog] = useState(true);
  const [enableAlertTool, setEnableAlertTool] = useState(true);
  const [enableCssStyleTool, setEnableCssStyleTool] = useState(true);
  const [enableInputTranscription, setEnableInputTranscription] =
    useState(true);
  const [enableOutputTranscription, setEnableOutputTranscription] =
    useState(true);

  // Activity Detection State
  const [disableActivityDetection, setDisableActivityDetection] =
    useState(false);
  const [silenceDuration, setSilenceDuration] = useState(500);
  const [prefixPadding, setPrefixPadding] = useState(500);
  const [endSpeechSensitivity, setEndSpeechSensitivity] = useState(
    "END_SENSITIVITY_UNSPECIFIED"
  );
  const [startSpeechSensitivity, setStartSpeechSensitivity] = useState(
    "START_SENSITIVITY_UNSPECIFIED"
  );

  // Media State
  const [audioStreaming, setAudioStreaming] = useState(false);
  const [videoStreaming, setVideoStreaming] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [volume, setVolume] = useState(80);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [videoInputDevices, setVideoInputDevices] = useState([]);
  const [selectedMic, setSelectedMic] = useState("");
  const [selectedCamera, setSelectedCamera] = useState("");

  // Chat State
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  // Walkthrough Content + Slide State
  const [walkthroughContent, setWalkthroughContent] = useState(null);
  const [activeModule, setActiveModule] = useState(null);
  // Main view: "slide" | "doc" | "qa"
  const [mainView, setMainView] = useState("slide");
  const [docViewTitle, setDocViewTitle] = useState("");
  const [docViewContent, setDocViewContent] = useState("");
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [contentStatus, setContentStatus] = useState("idle"); // "idle" | "loading" | "loaded" | "error"

  // Dynamic Q&A slide — set by Gemini's show_dynamic_slide tool; null = placeholder
  const [dynamicSlide, setDynamicSlide] = useState(null); // { title, content }

  // Presentation Mode State
  const [presentationActive, setPresentationActive] = useState(false);
  const [presentingModule, setPresentingModule] = useState(null);
  const [sessionElapsed, setSessionElapsed] = useState(0);

  // Refs
  const clientRef = useRef(null);
  const audioStreamerRef = useRef(null);
  const videoStreamerRef = useRef(null);
  const screenCaptureRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Presentation refs (used in stale-closure handlers — mirrors of the state above)
  const presentationActiveRef = useRef(false);
  const presentationModuleRef = useRef(null);
  const activeSlideIndexRef = useRef(0);
  const walkthroughContentRef = useRef(null);
  const activeModuleRef = useRef(null);
  // Q&A view refs — track current view and where to return after switch_slide
  const mainViewRef = useRef("slide");   // always mirrors mainView
  const prevViewRef = useRef("slide");   // remembers view before switch_slide navigated away

  /** Resolve agent's module name to an actual module key (exact or fuzzy match). */
  const resolveModuleName = useCallback((moduleName, availableModules) => {
    if (!moduleName || !Array.isArray(availableModules) || availableModules.length === 0)
      return null;
    const normalized = String(moduleName).trim().toLowerCase();
    // Exact match
    if (availableModules.includes(moduleName)) return moduleName;
    if (availableModules.includes(normalized)) return normalized;
    // Fuzzy: agent may send "project_overview" or "project overview" vs "01_project_overview"
    const normalizedNoDigits = normalized.replace(/^\d+_?/, "").replace(/\s+/g, "_");
    for (const mod of availableModules) {
      const modLower = mod.toLowerCase();
      const modNoDigits = modLower.replace(/^\d+_?/, "");
      if (modLower === normalized || modNoDigits === normalizedNoDigits) return mod;
      if (modLower.includes(normalized) || normalized.includes(modNoDigits)) return mod;
    }
    return null;
  }, []);
  const sessionTimerRef = useRef(null);
  const renderIntervalRef = useRef(null);
  const recordCanvasRef = useRef(null);
  const recordingRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const presentationTranscriptRef = useRef([]);
  /** True from startPresentation until downloadTranscript or next startPresentation — so we capture the whole session including post-stop exchange. */
  const presentationSessionRef = useRef(false);
  // Always-current reference to stopPresentation (avoids stale-closure issues in setTimeout)
  const stopPresentationRef = useRef(null);
  // Guard 1: prevents TURN_COMPLETE from auto-advancing right after a tool call
  // (cleared when the first AUDIO chunk arrives)
  const toolCallJustFiredRef = useRef(false);
  // Guard 2: set true when INTERRUPTED fires during presentation, cleared by next AUDIO chunk
  // — prevents the INTERRUPTED→TURN_COMPLETE cycle from racing through slides
  const presentationInterruptedRef = useRef(false);
  // Guard 3: counts audio chunks received in the current presentation turn.
  // A real slide explanation produces many chunks; a spurious TURN_COMPLETE produces 0–2.
  const currentTurnAudioCountRef = useRef(0);
  // Stores the 12-second safety fallback timeout so INTERRUPTED can cancel it
  const drainFallbackRef = useRef(null);
  // Stores the 3-second interrupt-window timeout so INTERRUPTED can cancel advance to next slide
  const interruptWindowTimeoutRef = useRef(null);

  // Initialize Media Devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioInputDevices(
          devices.filter((device) => device.kind === "audioinput")
        );
        setVideoInputDevices(
          devices.filter((device) => device.kind === "videoinput")
        );
      } catch (error) {
        console.error("Error enumerating devices:", error);
      }
    };
    getDevices();
  }, []);

  // Keep stale-closure refs in sync with state
  useEffect(() => { presentationActiveRef.current = presentationActive; }, [presentationActive]);
  useEffect(() => { presentationModuleRef.current = presentingModule; }, [presentingModule]);
  useEffect(() => { activeSlideIndexRef.current = activeSlideIndex; }, [activeSlideIndex]);
  useEffect(() => { walkthroughContentRef.current = walkthroughContent; }, [walkthroughContent]);
  useEffect(() => { activeModuleRef.current = activeModule; }, [activeModule]);
  useEffect(() => { mainViewRef.current = mainView; }, [mainView]);

  // Doc view: custom Markdown components so ```mermaid blocks render as diagrams
  const docMarkdownComponents = useMemo(() => ({
    code: ({ className, children, ...rest }) => {
      const language = (className || "").replace("language-", "");
      const content = String(children ?? "").replace(/\n$/, "");
      if (language === "mermaid") {
        return <MermaidBlock chart={content} />;
      }
      const isInline = !className;
      if (isInline) {
        return <code className={className} {...rest}>{children}</code>;
      }
      return (
        <code className={className} {...rest}>
          {content}
        </code>
      );
    },
    pre: ({ children }) => <div className="doc-view-pre">{children}</div>,
  }), []);

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Load content on mount so the slide panel is visible before connecting
  useEffect(() => {
    fetchContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addMessage = (text, type, mode = "add", isFinished = false) => {
    setChatMessages((prev) => {
      // Check if we can modify the last message
      if (
        mode !== "add" &&
        prev.length > 0 &&
        prev[prev.length - 1].type === type &&
        !prev[prev.length - 1].isFinished
      ) {
        const newMessages = [...prev];
        // Create a shallow copy of the message to avoid mutating state directly
        const target = { ...newMessages[newMessages.length - 1] };
        newMessages[newMessages.length - 1] = target;

        if (mode === "append") {
          target.text += text;
        } else if (mode === "replace") {
          // Only replace if text is provided and not just whitespace
          if (text && text.trim().length > 0) {
            target.text = text;
          }
        }

        if (isFinished) target.isFinished = true;

        // Mirror append to transcript (same bubble). Skip appending for assistant when we already have long text (from TEXT) to avoid duplicating with OUTPUT_TRANSCRIPTION.
        const isTranscriptType = type === "user" || type === "assistant" || type === "user-transcript";
        if (presentationSessionRef.current && isTranscriptType && presentationTranscriptRef.current.length > 0) {
          const lastEntry = presentationTranscriptRef.current[presentationTranscriptRef.current.length - 1];
          const isAssistantAppend = type === "assistant";
          const alreadyHasLongText = lastEntry.text.length > 300;
          if (!isAssistantAppend || !alreadyHasLongText) {
            lastEntry.text += text || "";
          }
        }
        return newMessages;
      }

      // Create new message
      if ((!text || text.trim().length === 0) && !isFinished) return prev;

      // Mirror new bubble to transcript. If this is assistant and the last entry is assistant with shorter text, replace it (TEXT arrived after OUTPUT_TRANSCRIPTION chunks) to avoid duplicate.
      const isTranscriptType = type === "user" || type === "assistant" || type === "user-transcript";
      if (presentationSessionRef.current && isTranscriptType && (text || "").trim().length > 0) {
        const role = type === "user-transcript" ? "user" : type;
        const trimmed = (text || "").trim();
        const transcript = presentationTranscriptRef.current;
        if (type === "assistant" && transcript.length > 0 && transcript[transcript.length - 1].role === "assistant" && transcript[transcript.length - 1].text.length < trimmed.length * 0.9) {
          transcript[transcript.length - 1].text = trimmed;
        } else {
          transcript.push({ role, text: trimmed });
        }
      }
      return [...prev, { text: text || "", type, isFinished }];
    });
  };

  const handleMessage = (message) => {
    setDebugInfo(`Message: ${message.type}`);

    switch (message.type) {
      case MultimodalLiveResponseType.TEXT:
        addMessage(message.data, "assistant");
        break;
      case MultimodalLiveResponseType.AUDIO:
        if (audioPlayerRef.current) {
          audioPlayerRef.current.play(message.data);
        }
        toolCallJustFiredRef.current = false;
        if (presentationActiveRef.current) {
          currentTurnAudioCountRef.current++;
          // Do not mute during narration — allow user to interrupt anytime (echo handled by AEC)
        }
        break;
      case MultimodalLiveResponseType.INPUT_TRANSCRIPTION:
        addMessage(
          message.data.text,
          "user-transcript",
          "append",
          message.data.finished
        );
        break;
      case MultimodalLiveResponseType.OUTPUT_TRANSCRIPTION:
        addMessage(
          message.data.text,
          "assistant",
          "append",
          message.data.finished
        );
        break;
      case MultimodalLiveResponseType.SETUP_COMPLETE:
        addMessage("Ready!", "system");
        if (clientRef.current && clientRef.current.lastSetupMessage) {
          setSetupJson(clientRef.current.lastSetupMessage);
        }
        break;
      case MultimodalLiveResponseType.TOOL_CALL: {
        const functionCalls = message.data.functionCalls;
        // Mark that a tool just fired — guards TURN_COMPLETE from advancing slides
        toolCallJustFiredRef.current = true;
        functionCalls.forEach((functionCall) => {
          const { id, name, args } = functionCall;
          console.log(
            `Calling function ${name} with parameters: ${JSON.stringify(args)}`
          );
          clientRef.current.callFunction(name, args);
          if (clientRef.current) {
            clientRef.current.sendToolResponse(id, name, { output: { success: true } });
          }
        });
        break;
      }
      case MultimodalLiveResponseType.TURN_COMPLETE:
        setDebugInfo("Turn complete");

        // Guard 1: tool call fired with no speech yet — skip
        if (toolCallJustFiredRef.current) {
          toolCallJustFiredRef.current = false;
          break;
        }

        // Auto-advance presentation to next slide
        if (presentationActiveRef.current && presentationModuleRef.current) {
          const audioChunks = currentTurnAudioCountRef.current;
          currentTurnAudioCountRef.current = 0; // reset for next turn

          // Guard 2: turn was interrupted (no follow-up speech) — skip advance.
          // This blocks the spurious INTERRUPTED→TURN_COMPLETE racing pattern.
          if (presentationInterruptedRef.current) {
            presentationInterruptedRef.current = false;
            break;
          }

          // Guard 3: too few audio chunks — the model barely spoke, likely a spurious turn.
          // A genuine slide explanation produces at least ~8 audio messages.
          if (audioChunks < 8) {
            break;
          }

          presentationInterruptedRef.current = false;

          const content = walkthroughContentRef.current;
          const mod = presentationModuleRef.current;
          const slidesInModule = (content?.slides || []).filter((s) => s.module === mod);
          const currentIdx = activeSlideIndexRef.current;

          if (currentIdx < slidesInModule.length - 1) {
            const nextIdx = currentIdx + 1;

            // Wait for audio playback to fully drain, then open the interrupt window.
            // A 12-second safety fallback fires in case the drain event never arrives.
            const startInterruptWindow = () => {
              if (!presentationActiveRef.current) return;
              // 3-second window: if user spoke (Gemini responded), don't auto-advance
              interruptWindowTimeoutRef.current = setTimeout(() => {
                interruptWindowTimeoutRef.current = null;
                if (!presentationActiveRef.current) return;
                if (presentationInterruptedRef.current || currentTurnAudioCountRef.current > 0) {
                  presentationInterruptedRef.current = false;
                  return;
                }
                presentationInterruptedRef.current = false;
                setActiveSlideIndex(nextIdx);
                activeSlideIndexRef.current = nextIdx;
                currentTurnAudioCountRef.current = 0;
                const nextSlide = slidesInModule[nextIdx];
                if (clientRef.current && nextSlide) {
                  const preview = (nextSlide.text || "").split("\n").slice(0, 3).join(" ");
                  clientRef.current.sendTextMessage(
                    `Please explain slide ${nextIdx + 1} of ${slidesInModule.length}: ${preview}. ` +
                    `Narrate the slide content and stop immediately after. ` +
                    `Do NOT add closing remarks, questions, or ask if the user wants to continue. ` +
                    `IMPORTANT: Do NOT ask to move to the next slide — slide navigation is handled automatically.`
                  );
                }
              }, 3000);
            };

            drainFallbackRef.current = setTimeout(startInterruptWindow, 12000);
            if (audioPlayerRef.current) {
              audioPlayerRef.current.onDrain = () => {
                clearTimeout(drainFallbackRef.current);
                drainFallbackRef.current = null;
                audioStreamerRef.current?.unmute(); // open mic for interrupt window
                startInterruptWindow();
              };
            }
          } else {
            // All slides done — wrap up after audio finishes
            drainFallbackRef.current = setTimeout(() => {
              if (!presentationActiveRef.current) return;
              if (stopPresentationRef.current) stopPresentationRef.current();
            }, 12000);
            if (audioPlayerRef.current) {
              audioPlayerRef.current.onDrain = () => {
                clearTimeout(drainFallbackRef.current);
                drainFallbackRef.current = null;
                setTimeout(() => {
                  if (!presentationActiveRef.current) return;
                  if (stopPresentationRef.current) stopPresentationRef.current();
                }, 2000);
              };
            }
          }
        }

        // After the agent finishes a turn: if switch_slide was called from the Q&A view,
        // auto-return to it now that the explanation is complete.
        if (prevViewRef.current === "qa") {
          prevViewRef.current = "slide"; // reset so subsequent turns don't trigger again
          setMainView("qa");
        }
        break;

      case MultimodalLiveResponseType.INTERRUPTED:
        addMessage("[Interrupted]", "system");
        if (audioPlayerRef.current) {
          audioPlayerRef.current.interrupt();
        }
        // Cancel the drainFallback and 3s interrupt-window timeout so we don't advance to next slide
        clearTimeout(drainFallbackRef.current);
        drainFallbackRef.current = null;
        clearTimeout(interruptWindowTimeoutRef.current);
        interruptWindowTimeoutRef.current = null;
        // Unmute so user's voice can be heard
        audioStreamerRef.current?.unmute();
        // Flag so TURN_COMPLETE knows this turn was cut short — don't auto-advance
        if (presentationActiveRef.current) {
          presentationInterruptedRef.current = true;
        }
        break;
      default:
        break;
    }
  };

  const disconnect = () => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }

    if (audioStreamerRef.current) {
      audioStreamerRef.current.stop();
      audioStreamerRef.current = null;
    }
    if (videoStreamerRef.current) {
      videoStreamerRef.current.stop();
      videoStreamerRef.current = null;
    }
    if (screenCaptureRef.current) {
      screenCaptureRef.current.stop();
      screenCaptureRef.current = null;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.destroy();
      audioPlayerRef.current = null;
    }

    setConnected(false);
    setAudioStreaming(false);
    setVideoStreaming(false);
    setScreenSharing(false);

    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
      videoPreviewRef.current.hidden = true;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  /**
   * Fetch docs + slides from the local content API and build a system instruction
   * string that gives Gemini full knowledge of the project.
   * Returns { contentData, systemInstruction } or null on failure.
   */
  const fetchContent = async () => {
    setContentStatus("loading");
    try {
      const sid = getSessionId();
      const res = await fetch(`${CONTENT_API_URL}?session_id=${encodeURIComponent(sid)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setWalkthroughContent(data);

      // Set initial active module to first one found
      const modules = [...new Set((data.slides || []).map((s) => s.module))].sort();
      if (modules.length > 0 && !activeModule) {
        setActiveModule(modules[0]);
        setActiveSlideIndex(0);
      }

      setContentStatus("loaded");

      // Build system instruction: project knowledge from docs + slides
      const projectName = data.project_name || "this project";

      // Docs: include only a short summary (~300 chars) per file.
      // Full text is stored in ChromaDB — Gemini retrieves details via search_documentation().
      const docSection = (data.docs || [])
        .map((d) => {
          const summary = d.text.slice(0, 300).replace(/\n+/g, " ").trim();
          return `--- ${d.filename} (summary) ---\n${summary}…`;
        })
        .join("\n\n");

      // Slides: always included in full (already concise markdown).
      const slideSection = (data.slides || [])
        .map((s) => `[${s.module} / ${s.filename}]\n${s.text}`)
        .join("\n\n");

      const moduleList = modules.join(", ");

      const builtInstruction = `You are an expert explainer for ${projectName}. \
You have complete knowledge of the project's documentation and slide content below. \
Use this knowledge to answer any questions the user asks about the project.

When a user asks a question:
- If an existing slide is directly relevant, call switch_slide with the exact module ID from the list below and the 1-based slide number (1 = first slide). The UI will navigate so the user sees that slide. After you finish explaining, the UI will automatically return to the Q&A view.
- If no existing slide covers the question, call show_dynamic_slide with a clear title and rich markdown content. Use triple-backtick mermaid blocks for diagrams and triple-backtick code blocks for code snippets.
- You may call show_dynamic_slide multiple times in a session to update the dynamic slide as the conversation evolves.
- Do not call show_dynamic_slide when switch_slide is sufficient.

When you need detailed information beyond these summaries, call the search_documentation tool \
with a precise query — it will return the most relevant chunks from the full documentation.

Available modules (use these exact IDs in switch_slide): ${moduleList}

=== DOCUMENTATION SUMMARIES ===
${docSection}

=== SLIDES (full content) ===
${slideSection}

Rules:
- Answer concisely and naturally as a voice assistant.
- After answering, stop and wait for the next question.
- If interrupted, stop speaking immediately.`;

      return { contentData: data, systemInstruction: builtInstruction };
    } catch (err) {
      console.warn("[Content] Failed to fetch content:", err);
      setContentStatus("error");
      return null;
    }
  };

  const connect = async () => {
    if (!proxyUrl && !projectId) {
      alert("Please provide either a Proxy URL and Project ID");
      return;
    }

    try {
      // Fetch docs + slides fresh on every connect so we always use the latest content
      const contentResult = await fetchContent();
      const finalSystemInstruction = contentResult
        ? contentResult.systemInstruction
        : systemInstructions;
      const contentData = contentResult ? contentResult.contentData : null;

      if (contentResult) {
        addMessage(`[Content loaded: ${contentData.docs.length} docs, ${contentData.slides.length} slides]`, "system");
      } else {
        addMessage("[Content API unavailable — using default system instructions]", "system");
      }

      clientRef.current = new GeminiLiveAPI(proxyUrl, projectId, model);

      clientRef.current.systemInstructions = finalSystemInstruction;
      clientRef.current.inputAudioTranscription = enableInputTranscription;
      clientRef.current.outputAudioTranscription = enableOutputTranscription;
      clientRef.current.googleGrounding = enableGrounding;
      clientRef.current.enableAffectiveDialog = enableAffectiveDialog;
      clientRef.current.responseModalities = ["AUDIO"];
      clientRef.current.voiceName = voice;
      clientRef.current.temperature = parseFloat(temperature);
      clientRef.current.proactivity = {
        proactiveAudio: enableProactiveAudio,
      };
      clientRef.current.automaticActivityDetection = {
        disabled: disableActivityDetection,
        silence_duration_ms: parseInt(silenceDuration),
        prefix_padding_ms: parseInt(prefixPadding),
        end_of_speech_sensitivity: endSpeechSensitivity,
        start_of_speech_sensitivity: startSpeechSensitivity,
      };

      if (!enableGrounding) {
        if (enableAlertTool) {
          clientRef.current.addFunction(new ShowAlertTool());
        }
        if (enableCssStyleTool) {
          clientRef.current.addFunction(new AddCSSStyleTool());
        }

        // Register switch_slide tool — Gemini will call this to navigate slides
        const switchSlideTool = new SwitchSlideTool((moduleName, slideNumber) => {
          const slides = walkthroughContentRef.current?.slides || contentData?.slides || [];
          const availableModules = [...new Set(slides.map((s) => s.module))].sort();
          const resolvedModule = resolveModuleName(moduleName, availableModules);

          if (!resolvedModule) {
            addMessage(`[Could not find module "${moduleName}". Available: ${availableModules.slice(0, 5).join(", ")}${availableModules.length > 5 ? "…" : ""}]`, "system");
            return;
          }

          // Remember where we came from so we can auto-return after explanation
          prevViewRef.current = mainViewRef.current;

          const slidesInModule = slides.filter((s) => s.module === resolvedModule);
          const oneBased = Math.max(1, parseInt(slideNumber, 10) || 1);
          const clampedIdx = Math.min(
            Math.max(0, oneBased - 1),
            Math.max(0, slidesInModule.length - 1)
          );

          setActiveModule(resolvedModule);
          setActiveSlideIndex(clampedIdx);
          activeModuleRef.current = resolvedModule;
          activeSlideIndexRef.current = clampedIdx;
          setMainView("slide");
          addMessage(`[Navigated to: ${resolvedModule} — slide ${clampedIdx + 1} of ${slidesInModule.length}]`, "system");
        });
        clientRef.current.addFunction(switchSlideTool);

        // Register show_dynamic_slide tool — Gemini generates a temporary Q&A slide
        const dynamicSlideTool = new ShowDynamicSlideTool((title, content) => {
          setDynamicSlide({ title, content });
          setMainView("qa");
          addMessage(`[Dynamic slide: "${title}"]`, "system");
        });
        clientRef.current.addFunction(dynamicSlideTool);

        // Register search_documentation tool for large-codebase RAG retrieval
        const searchDocsTool = new SearchDocsTool((query, chunks) => {
          if (chunks.length > 0) {
            const preview = chunks.map((c) => c.source).join(", ");
            addMessage(`[Docs searched: "${query}" → ${preview}]`, "system");
          }
        });
        clientRef.current.addFunction(searchDocsTool);

        // Register download_content tool — Gemini calls this after user confirms download
        const downloadContentTool = new DownloadContentTool((type) => {
          if (type === "transcript") {
            downloadTranscript();
            addMessage(`[Transcript downloaded]`, "system");
          } else if (type === "video") {
            downloadVideo();
            addMessage(`[Video downloaded]`, "system");
          }
        });
        clientRef.current.addFunction(downloadContentTool);
      }

      clientRef.current.onReceiveResponse = handleMessage;
      clientRef.current.onErrorMessage = (error) => {
        console.error("Error:", error);
        setDebugInfo("Error: " + error);
      };
      clientRef.current.onConnectionStarted = () => {
        setConnected(true);
      };
      clientRef.current.onClose = () => {
        setConnected(false);
        disconnect();
      };

      await clientRef.current.connect();

      audioStreamerRef.current = new AudioStreamer(clientRef.current);
      videoStreamerRef.current = new VideoStreamer(clientRef.current);
      screenCaptureRef.current = new ScreenCapture(clientRef.current);
      audioPlayerRef.current = new AudioPlayer();
      await audioPlayerRef.current.init();
      audioPlayerRef.current.setVolume(volume / 100);

      setDebugInfo("Connected successfully");
    } catch (error) {
      console.error("Connection failed:", error);
      setDebugInfo("Error: " + error.message);
    }
  };

  const toggleAudio = async () => {
    if (!audioStreaming) {
      try {
        if (!audioStreamerRef.current && clientRef.current) {
          audioStreamerRef.current = new AudioStreamer(clientRef.current);
        }

        if (audioStreamerRef.current) {
          await audioStreamerRef.current.start(selectedMic);
          setAudioStreaming(true);
          addMessage("[Microphone on]", "system");
        } else {
          addMessage("[Connect to Gemini first]", "system");
        }
      } catch (error) {
        addMessage("[Audio error: " + error.message + "]", "system");
      }
    } else {
      if (audioStreamerRef.current) audioStreamerRef.current.stop();
      setAudioStreaming(false);
      addMessage("[Microphone off]", "system");
    }
  };

  const toggleVideo = async () => {
    if (!videoStreaming) {
      try {
        if (!videoStreamerRef.current && clientRef.current) {
          videoStreamerRef.current = new VideoStreamer(clientRef.current);
        }

        if (videoStreamerRef.current) {
          const video = await videoStreamerRef.current.start({
            deviceId: selectedCamera,
          });
          setVideoStreaming(true);
          if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = video.srcObject;
            videoPreviewRef.current.hidden = false;
          }
          addMessage("[Camera on]", "system");
        } else {
          addMessage("[Connect to Gemini first]", "system");
        }
      } catch (error) {
        addMessage("[Video error: " + error.message + "]", "system");
      }
    } else {
      if (videoStreamerRef.current) videoStreamerRef.current.stop();
      setVideoStreaming(false);
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = null;
        videoPreviewRef.current.hidden = true;
      }
      addMessage("[Camera off]", "system");
    }
  };

  const toggleScreen = async () => {
    if (!screenSharing) {
      try {
        if (!screenCaptureRef.current && clientRef.current) {
          screenCaptureRef.current = new ScreenCapture(clientRef.current);
        }

        if (screenCaptureRef.current) {
          const video = await screenCaptureRef.current.start();
          setScreenSharing(true);
          if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = video.srcObject;
            videoPreviewRef.current.hidden = false;
          }
          addMessage("[Screen sharing on]", "system");
        } else {
          addMessage("[Connect to Gemini first]", "system");
        }
      } catch (error) {
        addMessage("[Screen share error: " + error.message + "]", "system");
      }
    } else {
      if (screenCaptureRef.current) screenCaptureRef.current.stop();
      setScreenSharing(false);
      if (!videoStreaming && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = null;
        videoPreviewRef.current.hidden = true;
      }
      addMessage("[Screen sharing off]", "system");
    }
  };

  const sendMessage = () => {
    if (!chatInput.trim()) return;

    if (clientRef.current) {
      addMessage(chatInput, "user");
      clientRef.current.sendTextMessage(chatInput);
      setChatInput("");
    } else {
      addMessage("[Connect to Gemini first]", "system");
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = e.target.value;
    setVolume(newVolume);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.setVolume(newVolume / 100);
    }
  };

  // ── Presentation helpers ──────────────────────────────────────────────

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  /** Draw the current slide frame onto the hidden recording canvas */
  const renderSlideToCanvas = useCallback(() => {
    const canvas = recordCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#ffffff");
    bg.addColorStop(1, "#F8FAFF");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Left accent bar
    const bar = ctx.createLinearGradient(0, 0, 0, H);
    bar.addColorStop(0, "#3B82F6");
    bar.addColorStop(1, "#6366F1");
    ctx.fillStyle = bar;
    ctx.fillRect(0, 0, 8, H);

    const content = walkthroughContentRef.current;
    const mod = activeModuleRef.current;
    const idx = activeSlideIndexRef.current;
    const slidesInMod = mod ? (content?.slides || []).filter((s) => s.module === mod) : [];
    const slide = slidesInMod[idx];

    const modLabel = mod
      ? mod.replace(/__+/g, " & ").replace(/_+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "";

    if (!slide) {
      ctx.fillStyle = "#94A3B8";
      ctx.font = "32px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No slide loaded", W / 2, H / 2);
      return;
    }

    // Parse slide markdown
    const lines = (slide.text || "").split("\n");
    let title = "";
    const items = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      const m = t.match(/^#{2,4}\s+(?:Slide\s+\d+:\s+)?(.+)$/i);
      if (m && !title) { title = m[1]; continue; }
      if (t.startsWith("- ") || t.startsWith("* ")) items.push(t.slice(2));
    }

    // Counter badge
    const countTxt = `Slide ${String(idx + 1).padStart(2, "0")} of ${String(slidesInMod.length).padStart(2, "0")}`;
    ctx.fillStyle = "#F1F5F9";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(W - 200, 16, 180, 34, 8);
    else ctx.rect(W - 200, 16, 180, 34);
    ctx.fill();
    ctx.fillStyle = "#475569";
    ctx.font = "14px monospace";
    ctx.textAlign = "center";
    ctx.fillText(countTxt, W - 110, 38);

    // Module label
    ctx.fillStyle = "#3B82F6";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(modLabel.toUpperCase(), 44, 68);

    // Title
    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 40px sans-serif";
    ctx.fillText(title || "Untitled", 44, 136, W - 240);

    // Divider
    ctx.strokeStyle = "#F1F5F9";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(44, 158);
    ctx.lineTo(W - 44, 158);
    ctx.stroke();

    // Bullet items
    let y = 206;
    items.slice(0, 7).forEach((item) => {
      // Circle
      ctx.fillStyle = "#EFF6FF";
      ctx.beginPath();
      ctx.arc(62, y - 7, 13, 0, Math.PI * 2);
      ctx.fill();
      // Check
      ctx.strokeStyle = "#3B82F6";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(56, y - 7);
      ctx.lineTo(60, y - 3);
      ctx.lineTo(68, y - 13);
      ctx.stroke();
      // Text
      const clean = item.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1");
      ctx.fillStyle = "#334155";
      ctx.font = "18px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(clean, 86, y, W - 130);
      y += 54;
    });

    // Footer
    ctx.fillStyle = "#F8FAFC";
    ctx.fillRect(0, H - 48, W, 48);
    ctx.strokeStyle = "#F1F5F9";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H - 48);
    ctx.lineTo(W, H - 48);
    ctx.stroke();
    ctx.fillStyle = "#94A3B8";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(modLabel.toUpperCase(), 44, H - 17);
    ctx.fillStyle = "#3B82F6";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("CodeStory", W - 44, H - 17);
  }, []); // all dependencies are refs — no state deps needed

  const stopRecording = useCallback(() => {
    if (renderIntervalRef.current) {
      clearInterval(renderIntervalRef.current);
      renderIntervalRef.current = null;
    }
    if (recordingRef.current && recordingRef.current.state !== "inactive") {
      recordingRef.current.stop();
      recordingRef.current = null;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.destroyRecordingStream();
    }
  }, []);

  const startRecording = useCallback(() => {
    try {
      const canvas = recordCanvasRef.current;
      if (!canvas || !audioPlayerRef.current) return;

      recordedChunksRef.current = [];
      renderSlideToCanvas();
      renderIntervalRef.current = setInterval(renderSlideToCanvas, 100);

      const audioStream = audioPlayerRef.current.createRecordingStream();
      const canvasStream = canvas.captureStream(10);

      const tracks = [...canvasStream.getVideoTracks()];
      if (audioStream) tracks.push(...audioStream.getAudioTracks());
      const combined = new MediaStream(tracks);

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";

      const recorder = new MediaRecorder(combined, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => { /* chunks available via recordedChunksRef — agent calls download_content */ };
      recorder.start(1000);
      recordingRef.current = recorder;
      console.log("[Recording] Started");
    } catch (err) {
      console.warn("[Recording] Failed to start:", err);
    }
  }, [renderSlideToCanvas]);

  const stopPresentation = useCallback(() => {
    const mod = presentationModuleRef.current;

    setPresentationActive(false);
    presentationActiveRef.current = false;
    setPresentingModule(null);
    presentationModuleRef.current = null;

    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    clearTimeout(drainFallbackRef.current);
    drainFallbackRef.current = null;
    clearTimeout(interruptWindowTimeoutRef.current);
    interruptWindowTimeoutRef.current = null;
    if (audioPlayerRef.current) audioPlayerRef.current.onDrain = null;
    audioStreamerRef.current?.unmute();
    stopRecording();
    addMessage("[Presentation ended]", "system");

    // Ask the agent to offer download options — the agent uses the download_content tool
    if (clientRef.current) {
      clientRef.current.sendTextMessage(
        `The presentation for "${(mod || "this module").replace(/_/g, " ")}" is now complete! ` +
        `Please congratulate the user and ask them whether they'd like to download ` +
        `the transcript (.md) or the video recording (.webm) of this session. ` +
        `When they confirm, call the download_content tool with their choice.`
      );
    }
  }, [stopRecording]);

  // Keep stopPresentationRef current so the stale TURN_COMPLETE closure can call it
  stopPresentationRef.current = stopPresentation;

  const startPresentation = useCallback((moduleName) => {
    if (!connected) {
      addMessage("[Connect to Gemini first to start presentation]", "system");
      return;
    }
    const content = walkthroughContentRef.current;
    const slidesInModule = (content?.slides || []).filter((s) => s.module === moduleName);
    if (slidesInModule.length === 0) {
      addMessage(`[No slides found in module: ${moduleName}]`, "system");
      return;
    }

    // Always start from the first slide and show the slide view (in case user was on doc/qa or another slide)
    setMainView("slide");
    setActiveModule(moduleName);
    setActiveSlideIndex(0);
    activeModuleRef.current = moduleName;
    activeSlideIndexRef.current = 0;

    // Reset presentation state
    setPresentationActive(true);
    presentationActiveRef.current = true;
    setPresentingModule(moduleName);
    presentationModuleRef.current = moduleName;
    setSessionElapsed(0);
    presentationTranscriptRef.current = [];
    presentationSessionRef.current = true; // capture until download or next start
    presentationInterruptedRef.current = false;
    currentTurnAudioCountRef.current = 0;
    toolCallJustFiredRef.current = false;

    // Start timer
    sessionTimerRef.current = setInterval(() => setSessionElapsed((e) => e + 1), 1000);

    // Start recording
    startRecording();

    // Keep mic open so user can interrupt during narration (echo cancellation is enabled in streamer)
    audioStreamerRef.current?.unmute();

    addMessage(`[▶ Presentation started: ${moduleName} — ${slidesInModule.length} slides]`, "system");

    // Kick off slide 1
    const slide1 = slidesInModule[0];
    const preview = (slide1?.text || "").split("\n").slice(0, 3).join(" ");
    clientRef.current.sendTextMessage(
      `You are now presenting the "${moduleName.replace(/_/g, " ")}" module (${slidesInModule.length} slides total). ` +
      `IMPORTANT: Do NOT call switch_slide — slide navigation is handled automatically. ` +
      `Do NOT ask to move to the next slide — that is handled automatically. ` +
      `After explaining each slide, stop speaking immediately. Do NOT add closing remarks, questions, or ask if the user wants to continue. ` +
      `Please explain slide 1 of ${slidesInModule.length}: ${preview}. ` +
      `Be engaging and thorough. Cover all the key points on the slide.`
    );
  }, [connected, startRecording]); // addMessage and clientRef are stable

  const downloadTranscript = useCallback(() => {
    const mod = presentationModuleRef.current || "presentation";
    const lines = [
      `# Presentation Transcript\n`,
      `**Module:** ${mod.replace(/_/g, " ")}\n\n`,
      `---\n\n`,
    ];
    const transcript = presentationTranscriptRef.current || [];
    transcript.forEach(({ role, text }) => {
      const t = (text || "").trim();
      if (t.length > 0) {
        lines.push(`**${role === "user" ? "You" : "Agent"}:** ${t}\n\n`);
      }
    });
    presentationSessionRef.current = false; // session ended after download
    const blob = new Blob([lines.join("")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${mod}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const downloadVideo = useCallback(() => {
    if (recordedChunksRef.current.length === 0) return;
    const mod = presentationModuleRef.current || "presentation";
    const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `presentation-${mod}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="live-api-demo">
      <div className="toolbar">
        <div className="toolbar-left">
          <img src="/logo.png" alt="CodeStory" className="toolbar-logo" />
        </div>
        <div className="toolbar-right">
          <div className="dropdown">
            <button className="dropbtn">Configuration ▾</button>
            <div className="dropdown-content config-dropdown">
              {/* API Configuration Section */}
              <div className="control-group">
                <h3>Connection Settings</h3>
                <div className="input-group">
                  <label>Proxy WebSocket URL:</label>
                  <input
                    type="text"
                    value={proxyUrl}
                    onChange={(e) => setProxyUrl(e.target.value)}
                    placeholder="ws://localhost:8080"
                    disabled={connected}
                  />
                </div>
                <div className="input-group">
                  <label>Project ID:</label>
                  <input
                    type="text"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    disabled={connected}
                  />
                </div>
                <div className="input-group">
                  <label>Model ID:</label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={connected}
                  />
                </div>
                <div className="input-group">
                  <label>Microphone:</label>
                  <select
                    value={selectedMic}
                    onChange={(e) => setSelectedMic(e.target.value)}
                  >
                    <option value="">Default Microphone</option>
                    {audioInputDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${device.deviceId}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="control-group">
                <h3>Gemini Behavior</h3>
                <div className="input-group">
                  <label>System Instructions:</label>
                  <textarea
                    rows="3"
                    value={systemInstructions}
                    onChange={(e) => setSystemInstructions(e.target.value)}
                    disabled={connected}
                  />
                </div>
                <div className="input-group">
                  <label>Voice:</label>
                  <select
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    disabled={connected}
                  >
                    <option value="Puck">Puck (Default)</option>
                    <option value="Charon">Charon</option>
                    <option value="Kore">Kore</option>
                    <option value="Fenrir">Fenrir</option>
                    <option value="Aoede">Aoede</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Temperature: {temperature}</label>
                  <input
                    type="range"
                    min="0.1"
                    max="2.0"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    disabled={connected}
                  />
                </div>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={enableProactiveAudio}
                    onChange={(e) => setEnableProactiveAudio(e.target.checked)}
                    disabled={connected}
                  />
                  <label>Enable proactive audio</label>
                </div>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={enableGrounding}
                    onChange={(e) => setEnableGrounding(e.target.checked)}
                    disabled={connected}
                  />
                  <label>Enable Google grounding</label>
                </div>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={enableAffectiveDialog}
                    onChange={(e) => setEnableAffectiveDialog(e.target.checked)}
                    disabled={connected}
                  />
                  <label>Enable affective dialog</label>
                </div>
              </div>

              <div className="control-group">
                <h3>Custom Tools</h3>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={enableAlertTool}
                    onChange={(e) => setEnableAlertTool(e.target.checked)}
                    disabled={connected || enableGrounding}
                  />
                  <label>Show Alert Box</label>
                </div>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={enableCssStyleTool}
                    onChange={(e) => setEnableCssStyleTool(e.target.checked)}
                    disabled={connected || enableGrounding}
                  />
                  <label>Add CSS Style</label>
                </div>
              </div>

              <div className="control-group">
                <h3>Transcription Settings</h3>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={enableInputTranscription}
                    onChange={(e) =>
                      setEnableInputTranscription(e.target.checked)
                    }
                    disabled={connected}
                  />
                  <label>Enable input transcription</label>
                </div>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={enableOutputTranscription}
                    onChange={(e) =>
                      setEnableOutputTranscription(e.target.checked)
                    }
                    disabled={connected}
                  />
                  <label>Enable output transcription</label>
                </div>
              </div>

              <div className="control-group">
                <h3>Activity Detection Settings</h3>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={disableActivityDetection}
                    onChange={(e) =>
                      setDisableActivityDetection(e.target.checked)
                    }
                    disabled={connected}
                  />
                  <label>Disable automatic activity detection</label>
                </div>
                <div className="input-group">
                  <label>Silence duration (ms):</label>
                  <input
                    type="number"
                    value={silenceDuration}
                    onChange={(e) => setSilenceDuration(e.target.value)}
                    min="500"
                    max="10000"
                    step="100"
                    disabled={connected}
                  />
                </div>
                <div className="input-group">
                  <label>Prefix padding (ms):</label>
                  <input
                    type="number"
                    value={prefixPadding}
                    onChange={(e) => setPrefixPadding(e.target.value)}
                    min="0"
                    max="2000"
                    step="100"
                    disabled={connected}
                  />
                </div>
                <div className="input-group">
                  <label>End of speech sensitivity:</label>
                  <select
                    value={endSpeechSensitivity}
                    onChange={(e) => setEndSpeechSensitivity(e.target.value)}
                    disabled={connected}
                  >
                    <option value="END_SENSITIVITY_UNSPECIFIED">Default</option>
                    <option value="END_SENSITIVITY_HIGH">High</option>
                    <option value="END_SENSITIVITY_LOW">Low</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Start of speech sensitivity:</label>
                  <select
                    value={startSpeechSensitivity}
                    onChange={(e) => setStartSpeechSensitivity(e.target.value)}
                    disabled={connected}
                  >
                    <option value="START_SENSITIVITY_UNSPECIFIED">
                      Default
                    </option>
                    <option value="START_SENSITIVITY_HIGH">High</option>
                    <option value="START_SENSITIVITY_LOW">Low</option>
                  </select>
                </div>
              </div>

              {setupJson && (
                <div className="control-group">
                  <h3>Setup Message JSON</h3>
                  <pre className="setup-json-display">
                    {JSON.stringify(setupJson, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={connected ? disconnect : connect}
            className={connected ? "disconnect" : "active"}
          >
            {connected ? "Disconnect" : "Connect"}
          </button>
        </div>
      </div>

      {/* Dashboard body — sidebar | slides/doc | chat panel */}
      <div className="dashboard-body">
        {/* ── Left sidebar: module list ─────────────────────────────── */}
        <aside className="dashboard-sidebar">
          <div className="sidebar-header">
            <span className="sidebar-title">Modules</span>
            {contentStatus === "loading" && (
              <span className="sidebar-badge sidebar-badge--loading">loading…</span>
            )}
          </div>

          {walkthroughContent ? (
            <div className="sidebar-modules">
              {[...new Set(walkthroughContent.slides.map((s) => s.module))].sort().map((mod, idx) => (
                <div key={mod} className={`sidebar-module-row${activeModule === mod ? " sidebar-module-row--active" : ""}`}>
                  <button
                    className={`sidebar-module-btn${activeModule === mod ? " sidebar-module-btn--active" : ""}`}
                    onClick={() => { setMainView("slide"); setActiveModule(mod); setActiveSlideIndex(0); }}
                  >
                    <span className="sidebar-module-btn__num">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="sidebar-module-btn__name">
                      {mod.replace(/__+/g, " & ").replace(/_+/g, " ")}
                    </span>
                    {activeModule === mod && !presentationActive && (
                      <span className="sidebar-module-btn__pulse" />
                    )}
                  </button>
                  {/* Doc button: show docs for this module only */}
                  {walkthroughContent.docs?.length > 0 && (
                    <button
                      type="button"
                      className={`sidebar-doc-btn${mainView === "doc" && docViewTitle === mod.replace(/__+/g, " & ").replace(/_+/g, " ") ? " sidebar-doc-btn--active" : ""}`}
                      title={`View documentation for ${mod}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const moduleLabel = mod.replace(/__+/g, " & ").replace(/_+/g, " ");
                        // Normalize both sides: lowercase, replace _and_ with __ (matches server key derivation)
                        const normalise = (s) => s.toLowerCase().replace(/_and_/g, "__").replace(/\.md$/, "");
                        const filtered = (walkthroughContent.docs || []).filter(
                          (d) => {
                            if (d.module != null) return d.module === mod;
                            // Fallback: compare normalised filename against module id
                            return normalise(d.filename) === mod || normalise(d.filename).startsWith(mod.slice(0, 10));
                          }
                        );
                        setMainView("doc");
                        setDocViewTitle(moduleLabel);
                        setDocViewContent(
                          filtered.length > 0
                            ? filtered.map((d) => `## ${d.filename}\n\n${d.text}`).join("\n\n---\n\n")
                            : "*No documentation for this module.*"
                        );
                      }}
                    >
                      <BsFileText size={14} />
                    </button>
                  )}
                  {/* Play / Stop button */}
                  <button
                    className={`sidebar-play-btn${presentingModule === mod ? " sidebar-play-btn--active" : ""}`}
                    title={presentingModule === mod ? "Stop presentation" : "Start presentation"}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (presentingModule === mod) {
                        stopPresentation();
                      } else {
                        startPresentation(mod);
                      }
                    }}
                  >
                    {presentingModule === mod ? "■" : "▶"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="sidebar-empty">
              {contentStatus === "loading" ? (
                <p>Loading content…</p>
              ) : (
                <p>Connect to load slides</p>
              )}
            </div>
          )}

          {/* Ask a Question — dynamic Q&A slide entry */}
          <div className="sidebar-qa-entry">
            <button
              type="button"
              className={`sidebar-qa-btn${mainView === "qa" ? " sidebar-qa-btn--active" : ""}`}
              onClick={() => setMainView("qa")}
              title="Open dynamic Q&A slide"
            >
              <BsChatDots size={15} />
              <span>Ask a Question</span>
            </button>
          </div>

          {/* debug status at the bottom of sidebar */}
          <div className="sidebar-debug">{debugInfo}</div>
        </aside>

        {/* ── Right main: slide canvas OR documentation view ─────────────────── */}
        <main className="dashboard-slide-main">
          {mainView === "doc" ? (
            <>
              <div className="doc-view-wrap">
                <div className="doc-view-header">
                  <button type="button" className="doc-view-back" onClick={() => setMainView("slide")}>
                    ← Back to slides
                  </button>
                  <h2 className="doc-view-title">{docViewTitle}</h2>
                </div>
                <div className="doc-view-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={docMarkdownComponents}>
                    {docViewContent}
                  </ReactMarkdown>
                </div>
              </div>
              <SlideControlBar
                audioStreaming={audioStreaming} toggleAudio={toggleAudio}
                screenSharing={screenSharing} toggleScreen={toggleScreen}
                volume={volume} handleVolumeChange={handleVolumeChange}
                showVolumeSlider={showVolumeSlider} setShowVolumeSlider={setShowVolumeSlider}
              />
            </>
          ) : mainView === "qa" ? (
            <>
              {/* top bar — mirrors slide-topbar */}
              <div className="slide-topbar">
                <button
                  type="button"
                  className="slide-nav-btn"
                  onClick={() => { setMainView("slide"); setDynamicSlide(null); }}
                >
                  ← Back to slides
                </button>
                <span className="slide-nav-info" style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
                  {dynamicSlide ? dynamicSlide.title : "Q&A Slide"}
                </span>
                {dynamicSlide && (
                  <button
                    type="button"
                    className="slide-nav-btn"
                    style={{ color: "#DC2626", borderColor: "#FECACA" }}
                    onClick={() => setDynamicSlide(null)}
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* slide stage — same framing as regular slides */}
              <div className="slide-canvas-wrap">
                <div className={`sc-stage qa-sc-stage${!dynamicSlide ? " sc-stage--empty" : ""}`}>
                  {dynamicSlide ? (
                    <>
                      <span className="sc-counter">
                        <span className="sc-counter__num">Q&amp;A</span>
                        <span className="sc-counter__sep">·</span>
                        dynamic
                      </span>
                      <div className="sc-card qa-sc-card">
                        <div className="sc-module-label">dynamic slide</div>
                        <h2 className="sc-title">{dynamicSlide.title}</h2>
                        <div className="qa-sc-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={docMarkdownComponents}>
                            {dynamicSlide.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                      <div className="sc-footer">
                        <span className="sc-footer__module">Ask a Question</span>
                        <span className="sc-footer__brand">CodeStory</span>
                      </div>
                    </>
                  ) : (
                    <div className="sc-empty">
                      <div className="sc-empty__icon">
                        <BsChatDots size={40} style={{ opacity: 0.35 }} />
                      </div>
                      <p className="sc-empty__title">Ask a Question</p>
                      <p className="sc-empty__hint">
                        Speak or type a question. If no module slide covers it, Gemini will generate a visual explanation here.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <SlideControlBar
                audioStreaming={audioStreaming} toggleAudio={toggleAudio}
                screenSharing={screenSharing} toggleScreen={toggleScreen}
                volume={volume} handleVolumeChange={handleVolumeChange}
                showVolumeSlider={showVolumeSlider} setShowVolumeSlider={setShowVolumeSlider}
              />
            </>
          ) : walkthroughContent && activeModule ? (() => {
            const slidesInModule = walkthroughContent.slides.filter(
              (s) => s.module === activeModule
            );
            const currentSlide = slidesInModule[activeSlideIndex] ?? null;
            return (
              <>
                {/* top nav bar */}
                <div className="slide-topbar">
                  <button
                    className="slide-nav-btn"
                    disabled={activeSlideIndex <= 0}
                    onClick={() => {
                      const newIdx = Math.max(0, activeSlideIndex - 1);
                      setActiveSlideIndex(newIdx);
                      activeSlideIndexRef.current = newIdx;
                    }}
                  >
                    ← Prev
                  </button>
                  <span className="slide-nav-info">
                    Slide {activeSlideIndex + 1} / {slidesInModule.length}
                  </span>
                  <button
                    className="slide-nav-btn"
                    disabled={activeSlideIndex >= slidesInModule.length - 1}
                    onClick={() => {
                      const newIdx = Math.min(slidesInModule.length - 1, activeSlideIndex + 1);
                      setActiveSlideIndex(newIdx);
                      activeSlideIndexRef.current = newIdx;
                    }}
                  >
                    Next →
                  </button>

                  {/* Session timer — visible only during presentation */}
                  {presentationActive && (
                    <div className="session-bar">
                      <span className="session-bar__dot" />
                      <span className="session-bar__time">{formatTime(sessionElapsed)}</span>
                      <span className="session-bar__label">LIVE</span>
                      <button className="session-bar__stop" onClick={stopPresentation}>
                        ■ Stop
                      </button>
                    </div>
                  )}
                </div>

                {/* slide canvas fills remaining space */}
                <div className="slide-canvas-wrap">
                  <SlideCanvas
                    moduleName={activeModule}
                    slideFilename={currentSlide?.filename}
                    content={currentSlide?.text}
                    slideNumber={activeSlideIndex + 1}
                    totalSlides={slidesInModule.length}
                  />
                </div>

                {/* Mic, volume, share screen below slides */}
                <SlideControlBar
                  audioStreaming={audioStreaming} toggleAudio={toggleAudio}
                  screenSharing={screenSharing} toggleScreen={toggleScreen}
                  volume={volume} handleVolumeChange={handleVolumeChange}
                  showVolumeSlider={showVolumeSlider} setShowVolumeSlider={setShowVolumeSlider}
                />
              </>
            );
          })() : (
            <div className="slide-placeholder">
              <div className="slide-placeholder__icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="3" width="20" height="14" rx="2" stroke="#CBD5E1" strokeWidth="1.5"/>
                  <path d="M8 21h8M12 17v4" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="slide-placeholder__title">No slide selected</p>
              <p className="slide-placeholder__sub">
                {walkthroughContent
                  ? "Select a module from the left panel."
                  : "Slides will appear here once content is loaded."}
              </p>
            </div>
          )}
        </main>

        {/* ── Right panel: chat ─────────────────────────────────────── */}
        <aside className="dashboard-chat-panel">
          <div className="chat-container" ref={chatContainerRef}>
            {chatMessages.length === 0 && (
              <div className="chat-empty">Conversation will appear here once connected</div>
            )}
            {chatMessages.map((msg, index) => (
              <div key={index} className={`message ${msg.type}`}>
                {msg.text}
              </div>
            ))}
          </div>
          <div className="chat-input-area">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message..."
            />
            <button onClick={sendMessage}>Send</button>
          </div>
        </aside>
      </div>

      {/* Hidden offscreen canvas for recording — zero visual size */}
      <canvas
        ref={recordCanvasRef}
        width={1280}
        height={720}
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          opacity: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      />

      {/* Downloads are triggered by the agent via the download_content tool — no modal needed */}
    </div>
  );
};

export default LiveAPIDemo;
