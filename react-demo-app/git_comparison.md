# Git Commit Comparison

## Overview

| | Previous Commit | New Commit |
|---|---|---|
| **Hash** | `3fa9f0a` | `299c076` |
| **Full Hash** | `3fa9f0aad5960e1046deecd0c40b79089a8213e3` | `299c076d5888d46ec77eabfd532357b787e532ce` |
| **Author** | anish | Priya Kumbhar |
| **Email** | anish@example.com | priyakumbhar082@gmail.com |
| **Date** | Sat Mar 14 18:35:12 2026 +0530 | Sat Mar 14 22:39:15 2026 +0530 |
| **Message** | feat: CodeStory UI revamp with per-module docs, transcript panel, and polished layout | Fix presentation narration interruption, echo feedback loop, and slide timing |
| **Branch** | main (origin) | main (local — 1 commit ahead of origin) |

---

## Files Changed in New Commit (`299c076`)

```
4 files changed, 109 insertions(+), 35 deletions(-)
```

| File | Insertions | Deletions | Net |
|---|---|---|---|
| `public/audio-processors/playback.worklet.js` | +7 | 0 | +7 |
| `server.py` | +16 | -16 | 0 (rewrite) |
| `src/components/LiveAPIDemo.jsx` | +67 | -17 | +50 |
| `src/utils/media-utils.js` | +21 | 0 | +21 |

---

## File-by-File Exact Diff

---

### 1. `public/audio-processors/playback.worklet.js`

**Purpose of change:** Added a `"drained"` signal so the main thread knows exactly when audio playback finishes.

```diff
@@ -25,6 +25,8 @@ class PCMProcessor extends AudioWorkletProcessor {
     const channel = output[0];
     let outputIndex = 0;
 
+    const hadAudio = this.audioQueue.length > 0;
+
     // Fill the output buffer from the queue
     while (outputIndex < channel.length && this.audioQueue.length > 0) {
       const currentBuffer = this.audioQueue[0];
@@ -51,6 +53,11 @@ class PCMProcessor extends AudioWorkletProcessor {
       }
     }
 
+    // Notify main thread when queue transitions from non-empty to empty
+    if (hadAudio && this.audioQueue.length === 0) {
+      this.port.postMessage("drained");
+    }
+
     // Fill remaining output with silence
     while (outputIndex < channel.length) {
       channel[outputIndex++] = 0;
```

**What changed:**
- Line added before the queue-drain loop: `const hadAudio = this.audioQueue.length > 0;`
- Block added after the loop: if the queue was non-empty at the start of this `process()` call and is now empty, post `"drained"` to the main thread
- This fires **exactly once** per narration turn — the moment the last audio sample is output

---

### 2. `server.py`

**Purpose of change:** Replace Unicode box-drawing characters with plain ASCII to fix `UnicodeEncodeError` on Windows PowerShell.

```diff
@@ -620,22 +620,22 @@ async def main():
     print(f"""
-╔════════════════════════════════════════════════════════════╗
-║     Gemini Live API Proxy Server                          ║
-╠════════════════════════════════════════════════════════════╣
-║                                                            ║
-║  🔌 WebSocket Proxy:  ws://localhost:{WS_PORT:<5}                  ║
-║  📄 Content API:      GET  /content                       ║
-║  🚀 Run Pipeline:     POST /run-pipeline                  ║
-║  📊 Pipeline Status:  GET  /pipeline-status/<id>          ║
-║  🔍 Search Docs:      GET  /search-docs?q=<query>         ║
-║     All HTTP on:      http://localhost:{HTTP_PORT:<5}                 ║
-║                                                            ║
-║  Authentication:                                           ║
-║  • Uses Google Cloud default credentials                  ║
-║  • Run: gcloud auth application-default login             ║
-║                                                            ║
-╚════════════════════════════════════════════════════════════╝
++============================================================+
+|     Gemini Live API Proxy Server                          |
++------------------------------------------------------------+
+|                                                            |
+|  WebSocket Proxy:  ws://localhost:{WS_PORT:<5}                  |
+|  Content API:      GET  /content                           |
+|  Run Pipeline:     POST /run-pipeline                      |
+|  Pipeline Status:  GET  /pipeline-status/<id>              |
+|  Search Docs:      GET  /search-docs?q=<query>             |
+|  All HTTP on:      http://localhost:{HTTP_PORT:<5}                 |
+|                                                            |
+|  Authentication:                                           |
+|  - Uses Google Cloud default credentials                   |
+|  - Run: gcloud auth application-default login              |
+|                                                            |
++============================================================+
 """)
```

**What changed:**
- All Unicode box-drawing characters (`╔ ║ ╠ ╚ •`) replaced with ASCII equivalents (`+ | + - -`)
- All emoji icons (`🔌 📄 🚀 📊 🔍`) removed from the banner
- Net line count change: 0 (16 replaced with 16)
- **Root cause fixed:** Windows PowerShell with `cp1252` (charmap) encoding threw `UnicodeEncodeError: character maps to <undefined>` on startup

---

### 3. `src/utils/media-utils.js`

**Purpose of change:** Add mic mute/unmute capability and an `onDrain` callback to `AudioPlayer`.

```diff
@@ -112,6 +112,16 @@ export class AudioStreamer {
     console.log("🛑 Audio streaming stopped");
   }
 
+  mute() {
+    this.isStreaming = false;
+  }
+
+  unmute() {
+    if (this.audioWorklet) {
+      this.isStreaming = true;
+    }
+  }
+
   /**
    * Convert Float32Array to PCM16 Int16Array
    */
@@ -394,6 +404,7 @@ export class AudioPlayer {
     this.isInitialized = false;
     this.volume = 1.0;
     this.sampleRate = 24000; // Gemini outputs at 24kHz
+    this.onDrain = null; // fired once when audio queue empties after playback
   }
 
   /**
@@ -420,6 +431,15 @@ export class AudioPlayer {
         "pcm-processor"
       );
 
+      // Listen for messages from the worklet (e.g. "drained" when queue empties)
+      this.workletNode.port.onmessage = (event) => {
+        if (event.data === "drained" && this.onDrain) {
+          const cb = this.onDrain;
+          this.onDrain = null;
+          cb();
+        }
+      };
+
       // Create gain node for volume control
       this.gainNode = this.audioContext.createGain();
       this.gainNode.gain.value = this.volume;
@@ -479,6 +499,7 @@ export class AudioPlayer {
     if (this.workletNode) {
       this.workletNode.port.postMessage("interrupt");
     }
+    this.onDrain = null; // cancel any pending drain callback
   }
```

**What changed (3 locations):**

| Location | Change |
|---|---|
| After `AudioStreamer.stop()` | Added `mute()` — sets `this.isStreaming = false` |
| After `AudioStreamer.stop()` | Added `unmute()` — sets `this.isStreaming = true` only if worklet is alive |
| `AudioPlayer` constructor | Added `this.onDrain = null` property |
| `AudioPlayer.init()` after worklet creation | Added `workletNode.port.onmessage` handler — calls `onDrain` once when `"drained"` received, then nulls it |
| `AudioPlayer.interrupt()` | Added `this.onDrain = null` — cancels pending drain callback on interruption |

---

### 4. `src/components/LiveAPIDemo.jsx`

**Purpose of change:** Fix narration interruption, echo feedback loop, infinite Q&A loop, and slide advance timing. This is the largest change.

#### 4a. New `drainFallbackRef` ref added

```diff
@@ -226,6 +226,8 @@ const LiveAPIDemo = () => {
   // Guard 3: counts audio chunks received in the current presentation turn.
   const currentTurnAudioCountRef = useRef(0);
+  // Stores the 12-second safety fallback timeout so INTERRUPTED can cancel it
+  const drainFallbackRef = useRef(null);
```

**Why:** The drain fallback `setTimeout` was previously a local variable — inaccessible from the `INTERRUPTED` handler. Moving it to a `useRef` makes it cancellable from anywhere in the component.

---

#### 4b. AUDIO handler — remove premature guard clear, add mic mute

```diff
@@ -335,11 +337,10 @@ const LiveAPIDemo = () => {
         if (audioPlayerRef.current) {
           audioPlayerRef.current.play(message.data);
         }
-        // Model is speaking — clear all guards
         toolCallJustFiredRef.current = false;
         if (presentationActiveRef.current) {
-          presentationInterruptedRef.current = false; // real speech resumed
           currentTurnAudioCountRef.current++;
+          audioStreamerRef.current?.mute(); // prevent echo feedback while Gemini speaks
         }
         break;
```

**What changed:**

| Line | Before | After |
|---|---|---|
| Comment | `// Model is speaking — clear all guards` | Removed |
| Guard reset | `presentationInterruptedRef.current = false;` | **Removed entirely** |
| New line | — | `audioStreamerRef.current?.mute();` |

**Why:**
- Removing the guard reset: `presentationInterruptedRef` was being cleared the moment Gemini's first audio chunk arrived — even if that audio was Gemini's *response to a false interruption*. This wiped the guard and allowed the slide to advance incorrectly.
- Adding `mute()`: Muting the mic on every AUDIO chunk prevents speaker audio from feeding back into Gemini's VAD — covering both narration and Q&A responses.

---

#### 4c. TURN_COMPLETE handler — replace fixed setTimeout with onDrain-based slide advance

```diff
@@ -424,26 +425,60 @@ const LiveAPIDemo = () => {
 
           if (currentIdx < slidesInModule.length - 1) {
             const nextIdx = currentIdx + 1;
-            setTimeout(() => {
+
+            // Wait for audio playback to fully drain, then open the interrupt window.
+            // A 12-second safety fallback fires in case the drain event never arrives.
+            const startInterruptWindow = () => {
               if (!presentationActiveRef.current) return;
-              setActiveSlideIndex(nextIdx);
-              activeSlideIndexRef.current = nextIdx;
-              currentTurnAudioCountRef.current = 0;
-              const nextSlide = slidesInModule[nextIdx];
-              if (clientRef.current && nextSlide) {
-                const preview = (nextSlide.text || "").split("\n").slice(0, 3).join(" ");
-                clientRef.current.sendTextMessage(
-                  `Please explain slide ${nextIdx + 1} of ${slidesInModule.length}: ${preview}. ` +
-                  `Take your time — be thorough and engaging.`
-                );
-              }
-            }, 4000);
+              // 3-second window: if user spoke (Gemini responded), don't auto-advance
+              setTimeout(() => {
+                if (!presentationActiveRef.current) return;
+                if (presentationInterruptedRef.current || currentTurnAudioCountRef.current > 0) {
+                  presentationInterruptedRef.current = false;
+                  return;
+                }
+                presentationInterruptedRef.current = false;
+                setActiveSlideIndex(nextIdx);
+                activeSlideIndexRef.current = nextIdx;
+                currentTurnAudioCountRef.current = 0;
+                const nextSlide = slidesInModule[nextIdx];
+                if (clientRef.current && nextSlide) {
+                  const preview = (nextSlide.text || "").split("\n").slice(0, 3).join(" ");
+                  clientRef.current.sendTextMessage(
+                    `Please explain slide ${nextIdx + 1} of ${slidesInModule.length}: ${preview}. ` +
+                    `Narrate the slide content and stop immediately after. ` +
+                    `Do NOT add closing remarks, questions, or ask if the user wants to continue. ` +
+                    `IMPORTANT: Do NOT ask to move to the next slide — slide navigation is handled automatically.`
+                  );
+                }
+              }, 3000);
+            };
+
+            drainFallbackRef.current = setTimeout(startInterruptWindow, 12000);
+            if (audioPlayerRef.current) {
+              audioPlayerRef.current.onDrain = () => {
+                clearTimeout(drainFallbackRef.current);
+                drainFallbackRef.current = null;
+                audioStreamerRef.current?.unmute(); // open mic for interrupt window
+                startInterruptWindow();
+              };
+            }
           } else {
-            // All slides done — wrap up
-            setTimeout(() => {
+            // All slides done — wrap up after audio finishes
+            drainFallbackRef.current = setTimeout(() => {
               if (!presentationActiveRef.current) return;
               if (stopPresentationRef.current) stopPresentationRef.current();
-            }, 3000);
+            }, 12000);
+            if (audioPlayerRef.current) {
+              audioPlayerRef.current.onDrain = () => {
+                clearTimeout(drainFallbackRef.current);
+                drainFallbackRef.current = null;
+                setTimeout(() => {
+                  if (!presentationActiveRef.current) return;
+                  if (stopPresentationRef.current) stopPresentationRef.current();
+                }, 2000);
+              };
+            }
           }
```

**Key differences:**

| Aspect | Before | After |
|---|---|---|
| Timing trigger | `setTimeout(4000)` from `TURN_COMPLETE` | `onDrain` callback (audio physically finishes) + 12s safety fallback |
| Fallback storage | Local `const drainFallback` (not cancellable) | `drainFallbackRef.current` (cancellable from INTERRUPTED) |
| Interrupt check | No check — always advanced | Checks `presentationInterruptedRef` and `currentTurnAudioCountRef > 0` |
| Mic state | Not managed here | Unmuted inside `onDrain` to open 3-second interrupt window |
| Delay before advance | 4000ms fixed | 3000ms after audio drain (correct timing) |
| Narration prompt | `"Take your time — be thorough and engaging."` | Added: `"Narrate the slide content and stop immediately after. Do NOT add closing remarks..."` |
| Presentation wrap-up fallback | `setTimeout(3000)` local var | `drainFallbackRef.current = setTimeout(12000)` + `onDrain` clears it and calls after 2000ms |

---

#### 4d. INTERRUPTED handler — cancel fallback + unmute mic

```diff
@@ -488,6 +488,11 @@ const LiveAPIDemo = () => {
         if (audioPlayerRef.current) {
           audioPlayerRef.current.interrupt();
         }
+        // Cancel the drainFallback so it doesn't fire a slide advance after user interrupted
+        clearTimeout(drainFallbackRef.current);
+        drainFallbackRef.current = null;
+        // Unmute so user's voice can be heard
+        audioStreamerRef.current?.unmute();
         // Flag so TURN_COMPLETE knows this turn was cut short — don't auto-advance
         if (presentationActiveRef.current) {
           presentationInterruptedRef.current = true;
```

**What changed:**
- Added `clearTimeout(drainFallbackRef.current)` + null reset — cancels any pending slide-advance fallback
- Added `audioStreamerRef.current?.unmute()` — immediately re-enables the mic so the user's question can be captured by Gemini's VAD

---

#### 4e. `stopPresentation()` — cleanup on end

```diff
@@ -1039,6 +1039,10 @@ const LiveAPIDemo = () => {
       clearInterval(sessionTimerRef.current);
       sessionTimerRef.current = null;
     }
+    clearTimeout(drainFallbackRef.current);
+    drainFallbackRef.current = null;
+    if (audioPlayerRef.current) audioPlayerRef.current.onDrain = null;
+    audioStreamerRef.current?.unmute();
     stopRecording();
     addMessage("[Presentation ended]", "system");
```

**What changed:**
- `clearTimeout(drainFallbackRef.current)` — cancels any slide-advance timer still pending
- `audioPlayerRef.current.onDrain = null` — cancels any pending drain callback
- `audioStreamerRef.current?.unmute()` — ensures mic is always active after presentation ends for normal conversation

---

#### 4f. `startPresentation()` — hardened slide 1 prompt

```diff
@@ -1101,8 +1101,10 @@ const LiveAPIDemo = () => {
     clientRef.current.sendTextMessage(
       `You are now presenting the "${moduleName.replace(/_/g, " ")}" module (${slidesInModule.length} slides total). ` +
       `IMPORTANT: Do NOT call switch_slide — slide navigation is handled automatically. ` +
+      `Do NOT ask to move to the next slide — that is handled automatically. ` +
+      `After explaining each slide, stop speaking immediately. Do NOT add closing remarks, questions, or ask if the user wants to continue. ` +
       `Please explain slide 1 of ${slidesInModule.length}: ${preview}. ` +
-      `Take your time, be engaging and thorough. Cover all the key points on the slide.`
+      `Be engaging and thorough. Cover all the key points on the slide.`
     );
```

**What changed:**
- Added two new sentences to the system prompt explicitly preventing Gemini from generating closing questions or asking to advance
- Removed `"Take your time,"` from the closing instruction (minor phrasing tightening)

---

## Summary Table

| # | Change | File | Lines | Root Problem Solved |
|---|---|---|---|---|
| 1 | `"drained"` message from worklet when queue empties | `playback.worklet.js` | +7 | Slide advance triggered at wrong time (generation vs playback) |
| 2 | `mute()` / `unmute()` methods on `AudioStreamer` | `media-utils.js` | +10 | No way to silence mic without stopping the stream |
| 3 | `AudioPlayer.onDrain` callback + worklet message handler | `media-utils.js` | +10, +1 | No event for "audio finished playing" |
| 4 | `cancel onDrain` in `interrupt()` | `media-utils.js` | +1 | Drain callback fired after user interrupted |
| 5 | ASCII banner replaces Unicode in `server.py` | `server.py` | 0 net | `UnicodeEncodeError` on Windows PowerShell startup |
| 6 | `drainFallbackRef` useRef | `LiveAPIDemo.jsx` | +2 | Fallback timer was local — not cancellable |
| 7 | Remove `presentationInterruptedRef = false` from AUDIO handler | `LiveAPIDemo.jsx` | -2 | Guard wiped prematurely by Gemini's response audio |
| 8 | `mute()` on every AUDIO chunk during presentation | `LiveAPIDemo.jsx` | +1 | Echo feedback loop during Q&A responses |
| 9 | `onDrain`-based slide advance replacing fixed `setTimeout` | `LiveAPIDemo.jsx` | +34, -10 | Slide advanced while previous slide audio still playing |
| 10 | `clearTimeout` + `unmute` in INTERRUPTED handler | `LiveAPIDemo.jsx` | +4 | Fallback fired spurious slide advance post-interruption |
| 11 | Cleanup in `stopPresentation()` | `LiveAPIDemo.jsx` | +4 | Stale timers/callbacks leaked after presentation ended |
| 12 | Hardened narration prompts (slide 1 + subsequent) | `LiveAPIDemo.jsx` | +4, -1 | Gemini generated "Shall we continue?" questions spontaneously |

---

## Branch Status

```
On branch main
Your branch is ahead of 'origin/main' by 1 commit.
  (use "git push" to publish your local commits)

nothing to commit, working tree clean
```

Commit `299c076` exists only locally and has **not been pushed** to the remote (`origin/main`) yet.
