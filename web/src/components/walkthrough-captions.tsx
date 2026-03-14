"use client";

type WalkthroughCaptionsProps = {
  text: string | null;
  /** When true, show a subtle "live" indicator */
  isLive?: boolean;
};

export function WalkthroughCaptions({ text, isLive = false }: WalkthroughCaptionsProps) {
  if (!text?.trim()) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 px-4 py-3 bg-black/75 backdrop-blur-sm rounded-b-[1.25rem]">
      <div className="flex items-center gap-2 mb-1">
        {isLive ? (
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-pulse" />
            Live
          </span>
        ) : null}
      </div>
      <p className="text-[13px] leading-relaxed text-white/95 max-h-16 overflow-y-auto">
        {text}
      </p>
    </div>
  );
}
