import { FunctionCallDefinition } from "./gemini-api";
import { API_BASE, getSessionId } from "../config";

const SEARCH_API_URL = `${API_BASE}/search-docs`;

/**
 * Download Content Tool
 * Called by Gemini to trigger a download of the transcript or video recording
 * after the user confirms they want it.
 */
export class DownloadContentTool extends FunctionCallDefinition {
  constructor(onDownload) {
    super(
      "download_content",
      "Download the presentation transcript or video recording for the user. " +
        "Call this only after the user explicitly says they want to download. " +
        "Use type='transcript' for the text transcript (.md) or type='video' for the video recording (.webm).",
      {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["transcript", "video"],
            description:
              "'transcript' to download the conversation transcript as a markdown file, " +
              "or 'video' to download the screen recording as a webm video file.",
          },
        },
      },
      ["type"]
    );
    this.onDownload = onDownload;
  }

  functionToCall({ type }) {
    if (!type) return;
    console.log(`[DownloadContentTool] Downloading: ${type}`);
    if (this.onDownload) this.onDownload(type);
  }
}

/**
 * Search Documentation Tool
 * Called by Gemini when it needs detailed information from the full documentation
 * (handles large codebases where docs can't fit entirely in the system instruction).
 * Returns the top-3 most semantically relevant chunks from ChromaDB.
 */
export class SearchDocsTool extends FunctionCallDefinition {
  constructor(onResult) {
    super(
      "search_documentation",
      "Search the full project documentation for detailed information on a specific topic. " +
        "Call this when the system instructions don't contain enough detail to answer the question accurately.",
      {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The specific topic, component, function, or question to look up in the documentation.",
          },
        },
      },
      ["query"]
    );
    this.onResult = onResult;
  }

  functionToCall({ query }) {
    if (!query) return;
    console.log(`[SearchDocsTool] Searching for: "${query}"`);
    fetch(`${SEARCH_API_URL}?q=${encodeURIComponent(query)}&session_id=${encodeURIComponent(getSessionId())}`)
      .then((r) => r.json())
      .then((data) => {
        const chunks = data.chunks || [];
        console.log(`[SearchDocsTool] Got ${chunks.length} chunks`);
        if (this.onResult) {
          this.onResult(query, chunks);
        }
      })
      .catch((err) => {
        console.warn("[SearchDocsTool] Search failed:", err);
      });
  }
}

/**
 * Switch Slide Tool
 * Called by Gemini to navigate to a specific slide when it's relevant to answering a question.
 */
export class SwitchSlideTool extends FunctionCallDefinition {
  constructor(onSwitch) {
    super(
      "switch_slide",
      "Navigate to a specific slide in a module to visually show the user the relevant content. Call this only when a particular slide is directly relevant to the current question or topic being discussed.",
      {
        type: "object",
        properties: {
          module: {
            type: "string",
            description:
              "Exact module ID from the Available modules list in your context (e.g. '01_project_overview', '04_data_model__relationships'). Use the exact string from that list so the UI can navigate correctly.",
          },
          slide_number: {
            type: "integer",
            description: "1-based slide index within that module (1 = first slide)",
          },
        },
      },
      ["module", "slide_number"]
    );
    this.onSwitch = onSwitch;
  }

  functionToCall(parameters) {
    const moduleName = parameters.module ?? parameters.moduleName ?? "";
    const slideNumber = parseInt(parameters.slide_number ?? parameters.slideNumber, 10) || 1;
    console.log(`[SwitchSlideTool] module="${moduleName}", slide_number=${slideNumber}`);
    if (this.onSwitch) {
      this.onSwitch(moduleName, slideNumber);
    }
  }
}

/**
 * Show Alert Box Tool
 * Displays a browser alert dialog with a custom message
 */
export class ShowAlertTool extends FunctionCallDefinition {
  constructor() {
    super(
      "show_alert",
      "Displays an alert dialog box with a message to the user",
      {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The message to display in the alert box",
          },
          title: {
            type: "string",
            description: "Optional title prefix for the alert message",
          },
        },
      },
      ["message"]
    );
  }

  functionToCall(parameters) {
    const message = parameters.message || "Alert!";
    const title = parameters.title;

    // Construct the full alert message
    const fullMessage = title ? `${title}: ${message}` : message;

    // Show the alert
    alert(fullMessage);

    console.log(` Alert shown: ${fullMessage}`);
  }
}

/**
 * Add CSS Style Tool
 * Injects CSS styles into the current page with !important flag
 */
export class AddCSSStyleTool extends FunctionCallDefinition {
  constructor() {
    super(
      "add_css_style",
      "Injects CSS styles into the current page with !important flag",
      {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description:
              "CSS selector to target elements (e.g., 'body', '.class', '#id')",
          },
          property: {
            type: "string",
            description:
              "CSS property to set (e.g., 'background-color', 'font-size', 'display')",
          },
          value: {
            type: "string",
            description:
              "Value for the CSS property (e.g., 'red', '20px', 'none')",
          },
          styleId: {
            type: "string",
            description:
              "Optional ID for the style element (for updating existing styles)",
          },
        },
      },
      ["selector", "property", "value"]
    );
  }

  functionToCall(parameters) {
    const { selector, property, value, styleId } = parameters;

    // Create or find the style element
    let styleElement;
    if (styleId) {
      styleElement = document.getElementById(styleId);
      if (!styleElement) {
        styleElement = document.createElement("style");
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
      }
    } else {
      styleElement = document.createElement("style");
      document.head.appendChild(styleElement);
    }

    // Create the CSS rule with !important
    const cssRule = `${selector} { ${property}: ${value} !important; }`;

    // Add the CSS rule to the style element
    if (styleId) {
      // If using an ID, replace the content
      styleElement.textContent = cssRule;
    } else {
      // Otherwise append to any existing content
      styleElement.textContent += cssRule;
    }

    console.log(`🎨 CSS style injected: ${cssRule}`);
    console.log(
      `   Applied to ${document.querySelectorAll(selector).length} element(s)`
    );
  }
}

/**
 * Show Dynamic Slide Tool
 * Called by Gemini to render a temporary, generated slide in the Q&A view.
 * Use when the user's question is not covered by any existing module slide.
 * Supports rich markdown: headings, lists, code blocks, and ```mermaid diagrams.
 */
export class ShowDynamicSlideTool extends FunctionCallDefinition {
  constructor(onShow) {
    super(
      "show_dynamic_slide",
      "Render a temporary slide to visually explain a concept, show a code snippet, or draw a flowchart. " +
        "Use this when the user asks a question that is not covered by an existing module slide. " +
        "The slide content is markdown — use triple-backtick mermaid blocks for flowcharts/diagrams " +
        "and triple-backtick code blocks for code samples.",
      {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Short heading for the dynamic slide (e.g. 'How authentication works')",
          },
          content: {
            type: "string",
            description:
              "Full markdown body for the slide. May include headings, bullet lists, " +
              "fenced code blocks, and mermaid diagram blocks.",
          },
        },
      },
      ["title", "content"]
    );
    this.onShow = onShow;
  }

  functionToCall({ title, content }) {
    console.log(`[ShowDynamicSlideTool] Rendering dynamic slide: "${title}"`);
    if (this.onShow) this.onShow(title, content);
  }
}
