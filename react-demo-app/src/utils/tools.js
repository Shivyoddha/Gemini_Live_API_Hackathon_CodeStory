import { FunctionCallDefinition } from "./gemini-api";

const SEARCH_API_URL = "http://localhost:8081/search-docs";

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
    fetch(`${SEARCH_API_URL}?q=${encodeURIComponent(query)}`)
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
              "The module/topic name matching one of the available modules (e.g. 'project_overview', 'api_layer', 'system_architecture', 'technology_stack')",
          },
          slide_number: {
            type: "integer",
            description: "1-based slide number within the specified module",
          },
        },
      },
      ["module", "slide_number"]
    );
    this.onSwitch = onSwitch;
  }

  functionToCall(parameters) {
    const moduleName = parameters.module;
    const slideNumber = parseInt(parameters.slide_number) || 1;
    console.log(`Switching to module "${moduleName}", slide ${slideNumber}`);
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
