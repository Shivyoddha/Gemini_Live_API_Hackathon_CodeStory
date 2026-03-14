import type { SlideDeck } from "@/lib/slides/types";

export type WalkthroughDoc = {
  filename: string;
  sectionName: string;
  markdown: string;
};

export type WalkthroughContentResponse = {
  ok: boolean;
  docs: WalkthroughDoc[];
  deck: SlideDeck | null;
};

export type WalkthroughStatusResponse = {
  ok: boolean;
  job?: {
    id: string;
    githubUrl: string;
    stage:
      | "idle"
      | "queued"
      | "generating_docs"
      | "generating_slides"
      | "ready"
      | "failed";
    error?: string;
    logs: string[];
    startedAt?: string;
    updatedAt?: string;
  };
  error?: string;
};
