"use client";

import { useCallback, useRef, useState } from "react";

type WalkthroughProgressProps = {
  /** 0..1 progress (evenly by caption/content), 0 = start of first slide */
  progress: number;
  onSeek?: (progress: number) => void;
  disabled?: boolean;
};

export function WalkthroughProgress({
  progress,
  onSeek,
  disabled = false,
}: WalkthroughProgressProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const percent = Math.min(100, Math.max(0, progress * 100));

  const updateFromClientX = useCallback(
    (clientX: number) => {
      if (disabled || !onSeek || !barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const p = Math.min(1, Math.max(0, x / rect.width));
      onSeek(p);
    },
    [disabled, onSeek],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !onSeek) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setIsDragging(true);
      updateFromClientX(e.clientX);
    },
    [disabled, onSeek, updateFromClientX],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      updateFromClientX(e.clientX);
    },
    [isDragging, updateFromClientX],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled || !onSeek) return;
      updateFromClientX(e.clientX);
    },
    [disabled, onSeek, updateFromClientX],
  );

  return (
    <div
      ref={barRef}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Progress"
      className="relative h-3 w-full cursor-pointer select-none rounded-full bg-[#E2E8F0] transition-colors hover:bg-[#CBD5E1]"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-[#3B82F6] transition-all duration-150 ease-out pointer-events-none"
        style={{ width: `${percent}%` }}
      />
      <div
        className="absolute top-1/2 w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#3B82F6] shadow-md transition-all hover:scale-110 pointer-events-none"
        style={{ left: `${percent}%` }}
      />
    </div>
  );
}
