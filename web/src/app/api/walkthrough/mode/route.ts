import { NextResponse } from "next/server";

export async function GET() {
  const isDevMode = process.env.NODE_ENV === "development";
  const docsCommand = process.env.AGENT1_DOCS_COMMAND;
  const slidesCommand = process.env.AGENT2_SLIDES_COMMAND;
  const envMockMode = process.env.MOCK_WALKTHROUGH === "true";
  const hasCliCommands = Boolean(docsCommand && slidesCommand);

  const mode =
    isDevMode || envMockMode || !hasCliCommands ? "mock" : "real-cli";

  const reason = isDevMode
    ? "Development: using existing documentation and slides"
    : envMockMode
      ? "MOCK_WALKTHROUGH=true"
      : hasCliCommands
        ? "CLI commands configured"
        : "CLI commands missing";

  return NextResponse.json({
    ok: true,
    mode,
    reason,
  });
}
