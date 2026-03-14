"use client";

type LiveControlsProps = {
  question: string;
  onQuestionChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  isListening: boolean;
  onToggleListening: () => void;
  liveState: "playing" | "interrupted" | "answering" | "resuming" | "idle";
  answer: string | null;
  showMicButton?: boolean;
};

export function LiveControls({
  question,
  onQuestionChange,
  onSend,
  isListening,
  onToggleListening,
  liveState,
  answer,
  showMicButton = true,
}: LiveControlsProps) {
  return (
    <section className="relative">
      <div className="flex items-center gap-3">
        {showMicButton ? (
          <button
            type="button"
            onClick={onToggleListening}
            className={`w-[52px] h-[52px] flex items-center justify-center rounded-full shadow-lg transition-all ${
              isListening
                ? "bg-[#EF4444] text-white hover:bg-[#DC2626] shadow-red-500/20"
                : "bg-[#3B82F6] text-white hover:bg-[#2563EB] shadow-blue-500/20"
            }`}
            title={isListening ? "Stop Microphone" : "Start Microphone"}
          >
            {isListening ? (
              <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            )}
          </button>
        ) : null}

        {/* Input Bar */}
        <div className="flex-1 flex items-center rounded-full bg-white border border-[#E2E8F0] shadow-sm p-1.5 focus-within:border-[#3B82F6] focus-within:ring-4 focus-within:ring-[#3B82F6]/10 transition-all">
          <input
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            placeholder="Ask about this repository..."
            className="flex-1 bg-transparent px-5 py-2.5 text-[15px] text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!question.trim()}
            className="flex items-center gap-2 rounded-full bg-[#3B82F6] px-5 py-2.5 text-[14px] font-bold text-white shadow-sm transition-all hover:bg-[#2563EB] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
            <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
          </button>
        </div>

        {/* Status Indicator Badge */}
        <div className="absolute right-6 -top-10 flex items-center gap-1.5 bg-[#F0FDF4] px-3 py-1.5 rounded-full border border-[#DCFCE7] shadow-sm">
          <svg className="w-3.5 h-3.5 text-[#10B981]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
          <span className="text-[10px] font-bold tracking-widest text-[#059669] uppercase">
            {liveState === "playing" || liveState === "idle" ? "AI Agent Ready" : liveState}
          </span>
        </div>
      </div>

      {answer ? (
        <div className="absolute bottom-full mb-4 left-16 right-4 rounded-[1.25rem] border border-[#E2E8F0] bg-white p-5 text-[14px] text-[#334155] shadow-lg shadow-black/5 leading-relaxed">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3B82F6] to-[#2563EB] flex items-center justify-center text-white shrink-0 mt-0.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <div>
              <p className="font-semibold text-[#0F172A] mb-1">CodeStory AI</p>
              {answer}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
