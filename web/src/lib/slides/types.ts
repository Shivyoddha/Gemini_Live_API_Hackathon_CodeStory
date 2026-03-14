import { z } from "zod";

export const slideSectionSchema = z.object({
  type: z.string(),
  title: z.string().nullable().optional().default(""),
  layout: z.string().optional(),
  items: z.array(z.string()).optional().default([]),
  urls: z.array(z.string()).optional().default([]),
  language: z.string().optional(),
  code: z.string().optional(),
  text: z.string().optional(),
});

export const slideModuleSchema = z.object({
  slide: z.coerce.string(),
  title: z.string(),
  source_deck: z.string().optional().default(""),
  subtitle: z.string().optional().default(""),
  list_description: z.string().optional().default(""),
  speaker_notes: z.string().optional().default(""),
  sections: z.array(slideSectionSchema),
  images: z.array(z.string()).optional().default([]),
});

export const slideDeckSchema = z.object({
  deck_title: z.string(),
  version: z.string(),
  updated_at: z.string(),
  modules: z.array(slideModuleSchema),
});

export type SlideSection = z.infer<typeof slideSectionSchema>;
export type SlideModule = z.infer<typeof slideModuleSchema>;
export type SlideDeck = z.infer<typeof slideDeckSchema>;
