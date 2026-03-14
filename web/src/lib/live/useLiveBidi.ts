/**
 * Single entry point for Gemini Live bidi: fetches config and runs the voice assistant.
 * Use this in the app; do not create a second WebSocket or session.
 */
import { useEffect, useState } from "react";
import { fetchLiveConfig, isBidiEnabled } from "./config";
import { useLiveVoiceAssistant } from "./useLiveVoiceAssistant";

export function useLiveBidi() {
  const [apiKey, setApiKey] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [bidiEnabled, setBidiEnabled] = useState(false);
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLiveConfig()
      .then((data) => {
        if (cancelled) return;
        setConfigReady(true);
        setBidiEnabled(isBidiEnabled(data));
        if (data.bidi?.apiKey && data.bidi?.model) {
          setApiKey(data.bidi.apiKey);
          setModel(data.bidi.model);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConfigReady(true);
          setBidiEnabled(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const assistant = useLiveVoiceAssistant({ apiKey, liveModel: model });

  return {
    ...assistant,
    bidiEnabled,
    configReady,
  };
}
