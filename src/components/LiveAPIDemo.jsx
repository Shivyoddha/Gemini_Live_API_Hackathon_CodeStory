import React, { useState, useEffect, useRef, useCallback } from "react";
import { GeminiLiveAPI, MultimodalLiveResponseType } from "../utils/gemini-api";
import {
  AudioStreamer,
  ScreenCapture,
  AudioPlayer,
} from "../utils/media-utils";
import { ShowAlertTool, AddCSSStyleTool, SwitchSlideTool, SearchDocsTool, DownloadContentTool } from "../utils/tools";
import { BsMic, BsMicMute, BsVolumeDownFill, BsVolumeUpFill, BsDisplay, BsDisplayFill } from "react-icons/bs";
import SlideCanvas from "./SlideCanvas";
import "./LiveAPIDemo.css";

const CONTENT_API_URL = "http://localhost:8081/content";

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
  const [screenSharing, setScreenSharing] = useState(false);
  const [volume, setVolume] = useState(80);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [selectedMic, setSelectedMic] = useState("");

  // Chat State
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  // Walkthrough Content + Slide State
  const [walkthroughContent, setWalkthroughContent] = useState(null);
  const [activeModule, setActiveModule] = useState(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [contentStatus, setContentStatus] = useState("idle"); // "idle" | "loading" | "loaded" | "error"

  // Presentation Mode State
  const [presentationActive, setPresentationActive] = useState(false);
  const [presentingModule, setPresentingModule] = useState(null);
  const [sessionElapsed, setSessionElapsed] = useState(0);

  // Refs
  const clientRef = useRef(null);
  const audioStreamerRef = useRef(null);
  const screenCaptureRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Presentation refs (used in stale-closure handlers — mirrors of the state above)
  const presentationActiveRef = useRef(false);
  const presentationModuleRef = useRef(null);
  const activeSlideIndexRef = useRef(0);
  const walkthroughContentRef = useRef(null);
  const activeModuleRef = useRef(null);
  const sessionTimerRef = useRef(null);
  const renderIntervalRef = useRef(null);
  const recordCanvasRef = useRef(null);
  const recordingRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const presentationTranscriptRef = useRef([]);
  // Always-current reference to stopPresentation (avoids stale-closure issues in setTimeout)
  const stopPresentationRef = useRef(null);
  // Guard 1: prevents TURN_COMPLETE from auto-advancing right after a tool call
  const toolCallJustFiredRef = useRef(false);
  // Semantic gate: true only when we explicitly sent a slide-explanation prompt.
  // TURN_COMPLETE auto-advances ONLY when this is true.
  // Cleared when the user speaks (Q&A mode) — re-set when we re-send the slide prompt.
  const waitingForSlideExplanationRef = useRef(false);
  // Word count of OUTPUT_TRANSCRIPTION accumulated during the current explanation turn.
  const explanationWordCountRef = useRef(0);
  const MIN_EXPLANATION_WORDS = 40;
  // When INTERRUPTED fires during an explanation turn, we mark it so TURN_COMPLETE
  // always re-triggers the same slide (ignore word count). Prevents advancing after
  // server-side or spurious interrupts.
  const explanationTurnInterruptedRef = useRef(false);
  // Set true when the user finishes speaking during a presentation (INPUT_TRANSCRIPTION finished).
  // The Q&A branch of TURN_COMPLETE ONLY fires when this is true — prevents infinite agent loops.
  const userSpokeInPresentationRef = useRef(false);
  // Set by switch_slide callback; consumed by TURN_COMPLETE to send the explanation without a timer.
  const switchPendingRef = useRef(null); // { mod, idx, slidesLen }
  // Counts consecutive short/interrupted explanation re-triggers to break potential loops.
  const explanationRetryCountRef = useRef(0);

  // ── Mic mute helpers for presentation mode ────────────────────────────
  // During explanation turns the mic is muted so ambient noise can't trigger VAD.
  // These are plain functions (not useCallback) so we can call them inline anywhere.
  const muteMicForExplanation = () => {
    if (audioStreamerRef.current) audioStreamerRef.current.mute();
  };
  const unmuteMicForQA = () => {
    if (audioStreamerRef.current) audioStreamerRef.current.unmute();
  };

  // Initialize Media Devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioInputDevices(
          devices.filter((device) => device.kind === "audioinput")
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

        if (isFinished) {
          target.isFinished = true;
        }
        return newMessages;
      }

      // Don't create a new message with empty or whitespace-only text
      if (!text || text.trim().length === 0) return prev;

      return [...prev, { text: (text || "").trim(), type, isFinished }];
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
        break;
      case MultimodalLiveResponseType.INPUT_TRANSCRIPTION: {
        const userText = (message.data.text || "").trim();
        if (userText.length > 0) {
          addMessage(
            message.data.text,
            "user-transcript",
            "append",
            message.data.finished
          );
        }
        if (presentationActiveRef.current && message.data.finished && userText.length > 0) {
          presentationTranscriptRef.current.push({ role: "user", text: message.data.text });
          waitingForSlideExplanationRef.current = false;
          userSpokeInPresentationRef.current = true; // mark that real user speech arrived
          // Mute mic while the agent formulates and speaks its answer —
          // prevents ambient noise from triggering a new INTERRUPTED during the agent's response.
          muteMicForExplanation();
        }
        break;
      }
      case MultimodalLiveResponseType.OUTPUT_TRANSCRIPTION:
        addMessage(
          message.data.text,
          "assistant",
          "append",
          message.data.finished
        );
        if (presentationActiveRef.current && message.data.text) {
          // Accumulate word count for the current explanation turn.
          // All OUTPUT_TRANSCRIPTION fragments (finished or not) are counted so we get
          // an accurate total before TURN_COMPLETE fires.
          if (waitingForSlideExplanationRef.current) {
            const words = message.data.text.trim().split(/\s+/).filter(Boolean).length;
            explanationWordCountRef.current += words;
          }
          // Record finished segments to transcript
          if (message.data.finished) {
            presentationTranscriptRef.current.push({ role: "assistant", text: message.data.text });
          }
        }
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

        // Helper: sends explanation for a pending switch and resets state to State A.
        const _sendPendingExplanation = (pending) => {
          const content = walkthroughContentRef.current;
          const slidesInPending = (content?.slides || []).filter((s) => s.module === pending.mod);
          const slide = slidesInPending[pending.idx];
          if (!slide || !clientRef.current) return;
          const preview = (slide.text || "").split("\n").slice(0, 3).join(" ");
          // Update active slide state to match the pending destination
          setActiveModule(pending.mod);
          activeModuleRef.current = pending.mod;
          setActiveSlideIndex(pending.idx);
          activeSlideIndexRef.current = pending.idx;
          presentationModuleRef.current = pending.mod;
          // Enter State A
          switchPendingRef.current = null;
          waitingForSlideExplanationRef.current = true;
          explanationWordCountRef.current = 0;
          explanationTurnInterruptedRef.current = false;
          explanationRetryCountRef.current = 0;
          userSpokeInPresentationRef.current = false;
          muteMicForExplanation();
          console.log(`[Presentation] State C → A: explaining ${pending.mod} slide ${pending.idx + 1}`);
          clientRef.current.sendTextMessage(
            `IMPORTANT: Do NOT call switch_slide or any other tool. ` +
            `Please now explain slide ${pending.idx + 1} of ${pending.slidesLen}: ${preview}. ` +
            `Take your time — be thorough and engaging.`
          );
        };

        // Guard: tool call just fired — the tool response is its own turn.
        if (toolCallJustFiredRef.current) {
          toolCallJustFiredRef.current = false;
          if (presentationActiveRef.current) {
            if (switchPendingRef.current) {
              // switch_slide was called correctly (State B) → send explanation for new slide
              _sendPendingExplanation(switchPendingRef.current);
            } else if (waitingForSlideExplanationRef.current) {
              // switch_slide was suppressed (called during State A) — re-trigger current slide
              const content2 = walkthroughContentRef.current;
              const mod2 = presentationModuleRef.current;
              const slidesInMod2 = (content2?.slides || []).filter((s) => s.module === mod2);
              const idx2 = activeSlideIndexRef.current;
              const slide2 = slidesInMod2[idx2];
              if (slide2 && clientRef.current) {
                const preview2 = (slide2.text || "").split("\n").slice(0, 3).join(" ");
                explanationWordCountRef.current = 0;
                explanationTurnInterruptedRef.current = false;
                muteMicForExplanation();
                console.log(`[Presentation] Suppressed switch_slide in State A — re-triggering slide ${idx2 + 1}`);
                clientRef.current.sendTextMessage(
                  `IMPORTANT: Do NOT call switch_slide. Please continue explaining slide ${idx2 + 1} of ${slidesInMod2.length}: ${preview2}. ` +
                  `Take your time — be thorough and engaging.`
                );
              }
            }
          }
          break;
        }

        if (presentationActiveRef.current && presentationModuleRef.current) {
          const content = walkthroughContentRef.current;
          const mod = presentationModuleRef.current;
          const slidesInMod = (content?.slides || []).filter((s) => s.module === mod);
          const currentIdx = activeSlideIndexRef.current;

          // ── State C: navigation is pending (agent spoke after switch_slide before TURN_COMPLETE)
          if (switchPendingRef.current) {
            _sendPendingExplanation(switchPendingRef.current);
            break;
          }

          // ── State A: explanation turn
          if (waitingForSlideExplanationRef.current) {
            const words = explanationWordCountRef.current;
            const wasInterrupted = explanationTurnInterruptedRef.current;
            const retries = explanationRetryCountRef.current;
            explanationWordCountRef.current = 0;
            explanationTurnInterruptedRef.current = false;

            const shouldRetrigger = (wasInterrupted || words < MIN_EXPLANATION_WORDS) && retries < 3;

            if (shouldRetrigger) {
              explanationRetryCountRef.current = retries + 1;
              console.log(`[Presentation] Slide ${currentIdx + 1} short/interrupted (${words} words, retry ${retries + 1}/3) — re-triggering`);
              setTimeout(() => {
                if (!presentationActiveRef.current) return;
                const slide = slidesInMod[currentIdx];
                if (clientRef.current && slide) {
                  const preview = (slide.text || "").split("\n").slice(0, 3).join(" ");
                  explanationWordCountRef.current = 0;
                  explanationTurnInterruptedRef.current = false;
                  muteMicForExplanation();
                  clientRef.current.sendTextMessage(
                    `IMPORTANT: Do NOT call switch_slide or any other tool. ` +
                    `Please continue explaining slide ${currentIdx + 1} of ${slidesInMod.length}: ${preview}. ` +
                    `Take your time — be thorough and engaging.`
                  );
                }
              }, 1500);
            } else {
              // Explanation complete (sufficient words OR retry cap reached). Move to State B.
              explanationRetryCountRef.current = 0;
              waitingForSlideExplanationRef.current = false;
              // DO NOT unmute yet — keep mic muted while the agent speaks the consent question.
              // Unmute will happen in State B's TURN_COMPLETE once the agent finishes asking.
              console.log(`[Presentation] Slide ${currentIdx + 1} explained (${words} words) — entering State B (consent, mic still muted)`);

              if (clientRef.current) {
                if (currentIdx < slidesInMod.length - 1) {
                  const nextIdx = currentIdx + 1;
                  clientRef.current.sendTextMessage(
                    `You have finished explaining slide ${currentIdx + 1}. ` +
                    `Please ask the user if they have any questions about this slide. ` +
                    `For example: "Do you have any questions, or shall I move on to slide ${nextIdx + 1}?" ` +
                    `If they say no questions or are ready, call switch_slide with module="${mod}" slide_number=${nextIdx + 1}. ` +
                    `If they have a question, answer it, then ask again.`
                  );
                } else {
                  clientRef.current.sendTextMessage(
                    `You have finished explaining the final slide of the "${mod.replace(/_/g, " ")}" module. ` +
                    `Please congratulate the user and offer to download the transcript or video.`
                  );
                  setTimeout(() => {
                    if (!presentationActiveRef.current) return;
                    if (stopPresentationRef.current) stopPresentationRef.current();
                  }, 8000);
                }
              }
            }
            break;
          }

          // ── State B: consent / Q&A turn
          if (userSpokeInPresentationRef.current) {
            // User spoke and agent just finished responding — re-ask consent.
            // Mute mic while the agent speaks the follow-up consent question.
            userSpokeInPresentationRef.current = false;
            muteMicForExplanation();
            console.log(`[Presentation] State B: user answered, re-asking consent (mic muted for agent response)`);
            if (clientRef.current) {
              const nextIdx = currentIdx + 1;
              if (nextIdx < slidesInMod.length) {
                clientRef.current.sendTextMessage(
                  `Now ask the user if they have any more questions about slide ${currentIdx + 1}, ` +
                  `or if they're ready to move on to slide ${nextIdx + 1}. ` +
                  `If they're ready, call switch_slide with module="${mod}" slide_number=${nextIdx + 1}.`
                );
              } else {
                clientRef.current.sendTextMessage(
                  `Ask the user if they have any more questions about this final slide, ` +
                  `or if they're done. If done, congratulate them on completing the module.`
                );
              }
            }
          } else {
            // Agent just finished speaking its consent/follow-up question.
            // NOW it's safe to unmute — the agent is done, we're waiting for user input.
            unmuteMicForQA();
            console.log(`[Presentation] State B: agent finished asking consent — mic unmuted, waiting for user`);
          }
        }
        break;

      case MultimodalLiveResponseType.INTERRUPTED:
        addMessage("[Interrupted]", "system");
        if (audioPlayerRef.current) {
          audioPlayerRef.current.interrupt();
        }
        // So TURN_COMPLETE will re-trigger the same slide instead of advancing.
        if (presentationActiveRef.current && waitingForSlideExplanationRef.current) {
          explanationTurnInterruptedRef.current = true;
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
    setScreenSharing(false);
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
      const res = await fetch(CONTENT_API_URL);
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

When a specific slide is directly relevant to your answer, call the switch_slide tool to navigate \
to it so the user can see the visual content. Only call switch_slide when genuinely helpful.

When you need detailed information beyond these summaries, call the search_documentation tool \
with a precise query — it will return the most relevant chunks from the full documentation.

Available modules: ${moduleList}

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

        // Register switch_slide tool — Gemini calls this to navigate slides.
        // During presentation mode it also auto-kicks off the explanation of the new slide.
        const switchSlideTool = new SwitchSlideTool((moduleName, slideNumber) => {
          // ── Guard: suppress switch_slide during State A (explanation in progress).
          // The model sometimes calls this when interrupted mid-explanation. Suppressing
          // prevents the loop: interrupt → switch_slide → re-explain → interrupt → ...
          if (presentationActiveRef.current && waitingForSlideExplanationRef.current) {
            console.warn("[switch_slide] Suppressed during State A — TURN_COMPLETE will re-trigger the slide");
            return;
          }

          const slidesInModule = (contentData?.slides || []).filter(
            (s) => s.module === moduleName
          );
          const clampedIdx = Math.min(
            Math.max(0, slideNumber - 1),
            slidesInModule.length - 1
          );
          // Sync both React state AND the stale-closure refs
          setActiveModule(moduleName);
          activeModuleRef.current = moduleName;
          setActiveSlideIndex(clampedIdx);
          activeSlideIndexRef.current = clampedIdx;
          waitingForSlideExplanationRef.current = false;
          explanationTurnInterruptedRef.current = false;
          addMessage(`[Navigated to: ${moduleName} — slide ${slideNumber}]`, "system");

          // During State B (consent/Q&A), set a pending switch so TURN_COMPLETE can
          // send the explanation once the agent finishes its current turn.
          if (presentationActiveRef.current) {
            switchPendingRef.current = {
              mod: moduleName,
              idx: clampedIdx,
              slidesLen: slidesInModule.length,
            };
          }
        });
        clientRef.current.addFunction(switchSlideTool);

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

  const toggleScreen = async () => {
    if (!screenSharing) {
      try {
        if (!screenCaptureRef.current && clientRef.current) {
          screenCaptureRef.current = new ScreenCapture(clientRef.current);
        }

        if (screenCaptureRef.current) {
          await screenCaptureRef.current.start();
          setScreenSharing(true);
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
    waitingForSlideExplanationRef.current = false;
    explanationWordCountRef.current = 0;
    explanationTurnInterruptedRef.current = false;
    userSpokeInPresentationRef.current = false;
    switchPendingRef.current = null;
    explanationRetryCountRef.current = 0;

    // Restore mic — always unmute when presentation ends
    if (audioStreamerRef.current) audioStreamerRef.current.unmute();

    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
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

    // Reset state
    setPresentationActive(true);
    presentationActiveRef.current = true;
    setPresentingModule(moduleName);
    presentationModuleRef.current = moduleName;
    setActiveModule(moduleName);
    activeModuleRef.current = moduleName;
    setActiveSlideIndex(0);
    activeSlideIndexRef.current = 0;
    setSessionElapsed(0);
    presentationTranscriptRef.current = [];
    toolCallJustFiredRef.current = false;
    waitingForSlideExplanationRef.current = true;
    explanationWordCountRef.current = 0;
    explanationTurnInterruptedRef.current = false;
    userSpokeInPresentationRef.current = false;
    switchPendingRef.current = null;
    explanationRetryCountRef.current = 0;
    muteMicForExplanation();

    // Start timer
    sessionTimerRef.current = setInterval(() => setSessionElapsed((e) => e + 1), 1000);

    // Start recording
    startRecording();

    addMessage(`[▶ Presentation started: ${moduleName} — ${slidesInModule.length} slides]`, "system");

    // Kick off slide 1
    const slide1 = slidesInModule[0];
    const preview = (slide1?.text || "").split("\n").slice(0, 3).join(" ");
    clientRef.current.sendTextMessage(
      `You are now presenting the "${moduleName.replace(/_/g, " ")}" module (${slidesInModule.length} slides total). ` +
      `IMPORTANT: Do NOT call switch_slide — slide navigation is handled automatically. ` +
      `Please explain slide 1 of ${slidesInModule.length}: ${preview}. ` +
      `Take your time, be engaging and thorough. Cover all the key points on the slide.`
    );
  }, [connected, startRecording]); // addMessage and clientRef are stable

  const downloadTranscript = useCallback(() => {
    const mod = presentationModuleRef.current || "presentation";
    const lines = [
      `# Presentation Transcript\n`,
      `**Module:** ${mod.replace(/_/g, " ")}\n\n`,
      `---\n\n`,
    ];
    presentationTranscriptRef.current.forEach(({ role, text }) => {
      lines.push(`**${role === "user" ? "You" : "Agent"}:** ${text}\n\n`);
    });
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
          <h1>Gemini Live API React Demo</h1>
        </div>
        <div className="toolbar-center">
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

      {/* Dashboard body — sidebar + slide main + chat panel */}
      <div className="dashboard-body">
        {/* ── Left sidebar: module list ─────────────────────────────── */}
        <aside className="dashboard-sidebar">
          <div className="sidebar-header">
            <span className="sidebar-title">Modules</span>
            {contentStatus === "loaded" && walkthroughContent && (
              <span className="sidebar-badge">
                {walkthroughContent.docs.length}d · {walkthroughContent.slides.length}s
              </span>
            )}
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
                    onClick={() => { setActiveModule(mod); setActiveSlideIndex(0); }}
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

          {/* debug status at the bottom of sidebar */}
          <div className="sidebar-debug">{debugInfo}</div>
        </aside>

        {/* ── Right main: slide canvas + navigation ─────────────────── */}
        <main className="dashboard-slide-main">
          {walkthroughContent && activeModule ? (() => {
            const slidesInModule = walkthroughContent.slides.filter(
              (s) => s.module === activeModule
            );
            const currentSlide = slidesInModule[activeSlideIndex] ?? null;
            return (
              <>
                {/* top nav bar — always visible Prev/Next controls */}
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
                </div>

                {/* Session timer row — only visible during presentation */}
                {presentationActive && (
                  <div className="session-bar-row">
                    <span className="session-bar__dot" />
                    <span className="session-bar__time">{formatTime(sessionElapsed)}</span>
                    <span className="session-bar__label">LIVE</span>
                    <span className="session-bar__module">
                      {presentingModule?.replace(/__+/g, " & ").replace(/_+/g, " ")}
                    </span>
                    <button className="session-bar__stop" onClick={stopPresentation}>
                      ■ Stop
                    </button>
                  </div>
                )}

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

                {/* ── Control bar below the slide ──────────────────────── */}
                <div className="slide-controls">
                  {/* Mic toggle */}
                  <button
                    className={`ctrl-btn${audioStreaming ? " ctrl-btn--active" : ""}`}
                    title={audioStreaming ? "Mute microphone" : "Unmute microphone"}
                    onClick={toggleAudio}
                  >
                    {audioStreaming ? <BsMic size={20} /> : <BsMicMute size={20} />}
                  </button>

                  {/* Volume with popover */}
                  <div className="volume-wrap">
                    <button
                      className={`ctrl-btn${showVolumeSlider ? " ctrl-btn--active" : ""}`}
                      title="Output volume"
                      onClick={() => setShowVolumeSlider((v) => !v)}
                    >
                      {volume >= 50 ? <BsVolumeUpFill size={20} /> : <BsVolumeDownFill size={20} />}
                    </button>
                    {showVolumeSlider && (
                      <div className="volume-popover">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={volume}
                          onChange={handleVolumeChange}
                          orient="vertical"
                          style={{ writingMode: "vertical-lr", direction: "rtl" }}
                        />
                        <span className="volume-popover__label">{volume}%</span>
                      </div>
                    )}
                  </div>

                  {/* Screen share */}
                  <button
                    className={`ctrl-btn${screenSharing ? " ctrl-btn--active" : ""}`}
                    title={screenSharing ? "Stop sharing screen" : "Share screen"}
                    onClick={toggleScreen}
                  >
                    {screenSharing ? <BsDisplayFill size={20} /> : <BsDisplay size={20} />}
                  </button>
                </div>
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

        {/* ── Right chat panel ──────────────────────────────────────── */}
        <aside className="chat-panel">
          <div className="chat-panel-header">
            <span>Chat</span>
            {connected && <span className="chat-panel-status chat-panel-status--online" />}
          </div>
          <div className="chat-panel-messages" ref={chatContainerRef}>
            {chatMessages.length === 0 ? (
              <p className="chat-panel-empty">Connect to Gemini to start chatting</p>
            ) : (
              chatMessages.map((msg, idx) => (
                <div key={idx} className={`chat-panel-msg chat-panel-msg--${msg.type}`}>
                  {msg.text}
                </div>
              ))
            )}
          </div>
          <div className="chat-panel-input">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message…"
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
