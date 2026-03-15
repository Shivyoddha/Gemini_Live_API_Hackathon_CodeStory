import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./SlideCanvas.css";

/**
 * Parses a raw slide markdown string into structured data.
 *
 * Expected format produced by the pipeline:
 *   ### Slide N: Slide Title
 *   - **Key**: description text
 *   - **Key**: description text
 *
 * Returns { title, items: string[] }
 */
function parseSlide(raw) {
  if (!raw) return { title: "", items: [] };

  const lines = raw.split("\n");
  let title = "";
  const items = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Extract title from "### Slide N: Title" or "## Title"
    const titleMatch = trimmed.match(/^#{2,4}\s+(?:Slide\s+\d+:\s+)?(.+)$/i);
    if (titleMatch && !title) {
      title = titleMatch[1].trim();
      continue;
    }

    // Collect bullet items (- text or * text)
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      items.push(trimmed.slice(2).trim());
    } else if (trimmed.startsWith("**") || items.length > 0) {
      // continuation line — append to last item
      if (items.length > 0) {
        items[items.length - 1] += " " + trimmed;
      } else {
        items.push(trimmed);
      }
    }
  }

  return { title, items };
}

function formatModuleName(name) {
  if (!name) return "";
  return name
    .replace(/__+/g, " & ")
    .replace(/_+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Check icon for bullet items ────────────────────────────────────────
function CheckIcon() {
  return (
    <svg
      className="sc-check-icon"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={3}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

// ── Inline markdown renderer (no wrapping <p> so it stays inline) ──────
function InlineMd({ children }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // suppress the wrapping <p> so bullet text flows inline
        p: ({ children }) => <span>{children}</span>,
        strong: ({ children }) => (
          <strong className="sc-bold">{children}</strong>
        ),
        em: ({ children }) => <em>{children}</em>,
        code: ({ children }) => (
          <code className="sc-inline-code">{children}</code>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="sc-link">
            {children}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

// ── Main component ─────────────────────────────────────────────────────
export default function SlideCanvas({
  moduleName,
  slideFilename,
  content,
  slideNumber,
  totalSlides,
}) {
  const slide = useMemo(() => parseSlide(content), [content]);

  if (!content) {
    return (
      <div className="sc-stage sc-stage--empty">
        <div className="sc-empty">
          <div className="sc-empty__icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="3" width="20" height="14" rx="2" stroke="#CBD5E1" strokeWidth="1.5" />
              <path d="M8 21h8M12 17v4" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="sc-empty__title">No slide loaded yet</p>
          <p className="sc-empty__hint">
            Select a module from the sidebar, or ask Gemini a question — it will
            navigate to the relevant slide automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="sc-stage">
      <div className="sc-card">
        {/* ── top-right counter badge ── */}
        <div className="sc-counter">
          Slide{" "}
          <span className="sc-counter__num">
            {String(slideNumber).padStart(2, "0")}
          </span>{" "}
          <span className="sc-counter__sep">of</span>{" "}
          <span className="sc-counter__num">
            {String(totalSlides).padStart(2, "0")}
          </span>
        </div>

        {/* ── module label ── */}
        <div className="sc-module-label">{formatModuleName(moduleName)}</div>

        {/* ── slide title ── */}
        {slide.title && <h2 className="sc-title">{slide.title}</h2>}

        {/* ── bullet list ── */}
        {slide.items.length > 0 && (
          <ul className="sc-list">
            {slide.items.map((item, i) => (
              <li key={i} className="sc-item">
                <div className="sc-item__icon-wrap">
                  <CheckIcon />
                </div>
                <div className="sc-item__text">
                  <InlineMd>{item}</InlineMd>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* ── fallback: render raw markdown if parser found nothing ── */}
        {slide.items.length === 0 && !slide.title && (
          <div className="sc-raw">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}

        {/* ── bottom bar: module name watermark ── */}
        <div className="sc-footer">
          <span className="sc-footer__module">{formatModuleName(moduleName)}</span>
          <span className="sc-footer__brand">CodeStory</span>
        </div>
      </div>
    </div>
  );
}
