"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

type DocsPreviewProps = {
  markdown: string | null;
};

export function DocsPreview({ markdown }: DocsPreviewProps) {
  if (!markdown) {
    return (
      <section className="flex h-full min-h-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500">
        Select a documentation section to preview markdown.
      </section>
    );
  }

  const markdownComponents: Components = {
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold">
        {children}
      </th>
    ),
    td: ({ children }) => <td className="border-b border-slate-100 px-3 py-2 align-top">{children}</td>,
    code: ({ className, children }) => {
      const language = className?.replace("language-", "") ?? "";
      const content = String(children).replace(/\n$/, "");

      if (language === "mermaid") {
        return <MermaidBlock chart={content} />;
      }

      const isInline = !className;
      if (isInline) {
        return <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.92em]">{children}</code>;
      }

      return (
        <code className="block overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
          {content}
        </code>
      );
    },
    pre: ({ children }) => <div className="my-4">{children}</div>,
  };

  return (
    <section className="h-full min-h-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
      <article className="prose prose-slate max-w-none pb-10 prose-headings:text-slate-900 prose-p:text-slate-700 prose-li:text-slate-700">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {markdown}
        </ReactMarkdown>
      </article>
    </section>
  );
}

function MermaidBlock({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const id = useMemo(() => `mermaid-${Math.random().toString(36).slice(2, 10)}`, []);

  useEffect(() => {
    let cancelled = false;

    async function renderMermaid() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "default",
        });

        const rendered = await mermaid.render(id, chart);
        if (!cancelled) {
          setSvg(rendered.svg);
          setError(null);
        }
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : "Failed to render mermaid.");
        }
      }
    }

    void renderMermaid();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsExpanded(false);
      }
    }

    if (isExpanded) {
      window.addEventListener("keydown", onKeyDown);
    }

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isExpanded]);

  if (error) {
    return (
      <pre className="overflow-x-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        {chart}
      </pre>
    );
  }

  if (!svg) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
        Rendering diagram...
      </div>
    );
  }

  return (
    <>
      <div className="relative rounded-lg border border-slate-200 bg-white p-3">
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            aria-label="Expand diagram"
            title="Expand"
          >
            +
          </button>
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-400"
            aria-label="Collapse diagram"
            title="Collapse"
          >
            -
          </button>
        </div>
        <div
          className="overflow-x-auto pt-8"
          // Mermaid returns trusted SVG string generated from markdown docs.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      {isExpanded ? (
        <div className="fixed inset-0 z-50 bg-slate-950/60 p-4 md:p-8">
          <div className="mx-auto flex h-full w-full max-w-7xl flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">Mermaid Diagram</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400"
                  aria-label="Expand diagram"
                  title="Expand"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  aria-label="Collapse diagram"
                  title="Collapse"
                >
                  -
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 md:p-6">
              <div
                className="min-w-max rounded-lg border border-slate-200 bg-white p-4"
                // Mermaid returns trusted SVG string generated from markdown docs.
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
