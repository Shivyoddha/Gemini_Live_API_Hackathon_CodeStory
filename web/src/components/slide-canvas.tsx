"use client";

import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { SlideModule, SlideSection } from "@/lib/slides/types";

type SlideCanvasProps = {
  module: SlideModule | null;
  currentSlideNumber: number;
  totalSlides: number;
};

export function SlideCanvas({ module, currentSlideNumber, totalSlides }: SlideCanvasProps) {
  if (!module) {
    return (
      <section className="flex min-h-[420px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500">
        No slide loaded yet.
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-[1.5rem] bg-white p-5 shadow-[0_2px_12px_rgb(0,0,0,0.03)] border border-[#F1F5F9] relative overflow-hidden">
      <div className="absolute top-5 right-5 bg-[#F1F5F9] text-[#64748B] text-[11px] font-mono tracking-wider px-3 py-1 rounded-lg">
        Slide {String(currentSlideNumber).padStart(2, "0")} <span className="text-[#94A3B8] mx-0.5">of</span>{" "}
        {String(totalSlides).padStart(2, "0")}
      </div>

      <div className="mb-5 mt-1 max-w-2xl shrink-0">
        <h2 className="text-[1.55rem] font-bold text-[#0F172A] tracking-tight leading-tight">{module.title}</h2>
        {module.subtitle ? <p className="mt-2 text-[0.95rem] text-[#64748B] max-w-[500px] leading-relaxed">{module.subtitle}</p> : null}
      </div>

      <div className="space-y-4 max-w-3xl flex-1 overflow-hidden">
        {module.sections.map((section, index) => (
          <article
            key={`${module.slide}-${section.title ?? "section"}-${index}`}
            className="group"
          >
            {section.title ? <h3 className="text-[12px] font-bold text-[#3B82F6] uppercase tracking-[0.12em] mb-2">{section.title}</h3> : null}
            <div className="">{renderSlideSection(section)}</div>
          </article>
        ))}
      </div>

      {module.images.length ? (
        <div className="mt-4 grid grid-cols-2 gap-3 shrink-0">
          {module.images.map((imageName) => (
            <Image
              key={imageName}
              src={`/api/slides/image?name=${encodeURIComponent(imageName)}`}
              alt={imageName}
              width={640}
              height={320}
              unoptimized
              className="h-44 w-full rounded-2xl border border-[#E2E8F0] shadow-sm object-cover transition-transform duration-300 hover:scale-[1.01]"
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function renderSlideSection(section: SlideSection) {
  if (section.type === "image" && section.urls.length) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {section.urls.map((imagePath) => (
          <Image
            key={imagePath}
            src={`/api/slides/image?name=${encodeURIComponent(imagePath)}`}
            alt={imagePath}
            width={640}
            height={320}
            unoptimized
            className="h-40 w-full rounded-lg border border-slate-200 object-cover"
          />
        ))}
      </div>
    );
  }

  if (section.type === "code" && section.code) {
    return (
      <div className="relative overflow-hidden rounded-[1.25rem] bg-[#111827] shadow-lg shadow-black/5">
        <div className="absolute top-0 w-full h-8 bg-[#1F2937] border-b border-white/5 flex items-center px-4">
          <div className="flex space-x-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400/20"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400/20"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/20"></div>
          </div>
          <span className="text-[10px] text-white/30 ml-4 font-mono">{"// Code snippet"}</span>
        </div>
        <pre className="overflow-x-auto p-5 pt-12 text-[13px] leading-tight text-emerald-300 font-mono">
          <code>{section.code}</code>
        </pre>
      </div>
    );
  }

  if (section.type === "mermaid" && section.code) {
    return (
      <div className="relative overflow-hidden rounded-[1.25rem] bg-[#111827] shadow-lg shadow-black/5">
        <pre className="overflow-x-auto p-5 text-[13px] leading-tight text-emerald-300 font-mono">
          <code>{section.code}</code>
        </pre>
      </div>
    );
  }

  if (section.type === "text") {
    return (
      <div className="text-[14px] leading-relaxed text-[#334155]">
        <MarkdownText content={section.text?.trim() || " "} />
      </div>
    );
  }

  if (section.items.length) {
    return (
      <ul className="space-y-4">
        {section.items.map((item, index) => (
          <li key={`${item}-${index}`}>{renderSlideItem(item)}</li>
        ))}
      </ul>
    );
  }

  return <p className="text-sm text-slate-400 italic">No section content.</p>;
}

function renderSlideItem(item: string) {
  const trimmed = item.trim();
  if (trimmed.startsWith("### ")) {
    return <p className="font-semibold text-slate-900">{trimmed.replace("### ", "")}</p>;
  }
  if (trimmed.startsWith("## ")) {
    return <p className="font-semibold text-base text-slate-900">{trimmed.replace("## ", "")}</p>;
  }
  if (trimmed.startsWith("```")) {
    return (
      <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
        <code>{trimmed}</code>
      </pre>
    );
  }
  return (
    <div className="flex items-start gap-4">
      <div className="flex-shrink-0 mt-1 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#EFF6FF]">
        <svg className="h-3.5 w-3.5 text-[#3B82F6]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
      </div>
      <div className="flex-1 text-[14px] leading-relaxed text-[#334155]">
        <MarkdownText content={item} />
      </div>
    </div>
  );
}

function MarkdownText({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="m-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-[#0F172A]">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children }) => (
          <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.9em] text-slate-800">{children}</code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
