import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/** In dev we use existing documentation/slides on disk; we never run agents. */
const isDevMode = process.env.NODE_ENV === "development";
/** Project root: parent of web/. Agents run from here in production. */
const projectRoot = path.resolve(process.cwd(), "..");

export type WalkthroughStage =
  | "idle"
  | "queued"
  | "generating_docs"
  | "generating_slides"
  | "ready"
  | "failed";

export type WalkthroughJob = {
  id: string;
  githubUrl: string;
  stage: WalkthroughStage;
  logs: string[];
  error?: string;
  startedAt: string;
  updatedAt: string;
};

const jobs = new Map<string, WalkthroughJob>();
let latestJobId: string | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function applyJobUpdate(
  jobId: string,
  updates: Partial<Omit<WalkthroughJob, "id" | "githubUrl" | "startedAt">>,
): WalkthroughJob | null {
  const current = jobs.get(jobId);
  if (!current) {
    return null;
  }

  const next: WalkthroughJob = {
    ...current,
    ...updates,
    logs: updates.logs ?? current.logs,
    updatedAt: nowIso(),
  };
  jobs.set(jobId, next);
  return next;
}

export function createJob(githubUrl: string): WalkthroughJob {
  const id = randomUUID();
  const job: WalkthroughJob = {
    id,
    githubUrl,
    stage: "queued",
    logs: ["Job queued"],
    startedAt: nowIso(),
    updatedAt: nowIso(),
  };
  jobs.set(id, job);
  latestJobId = id;
  return job;
}

export function getJob(jobId: string): WalkthroughJob | null {
  return jobs.get(jobId) ?? null;
}

export function getLatestJob(): WalkthroughJob | null {
  if (!latestJobId) {
    return null;
  }
  return jobs.get(latestJobId) ?? null;
}

export async function startJobPipeline(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) {
    return;
  }

  const docsCommand = process.env.AGENT1_DOCS_COMMAND;
  const slidesCommand = process.env.AGENT2_SLIDES_COMMAND;
  const envMockMode = process.env.MOCK_WALKTHROUGH === "true";
  const missingCommands = !docsCommand || !slidesCommand;
  const mockMode =
    isDevMode || envMockMode || missingCommands;

  try {
    if (mockMode) {
      const reason = isDevMode
        ? "Development mode: using existing documentation and slides"
        : envMockMode
          ? "MOCK_WALKTHROUGH=true"
          : "Missing AGENT1_DOCS_COMMAND/AGENT2_SLIDES_COMMAND";
      applyJobUpdate(jobId, {
        stage: "generating_docs",
        logs: [...(getJob(jobId)?.logs ?? []), `MOCK mode (${reason}): skipping docs CLI`],
      });
      await wait(800);
      applyJobUpdate(jobId, {
        stage: "generating_slides",
        logs: [...(getJob(jobId)?.logs ?? []), `MOCK mode (${reason}): skipping slides CLI`],
      });
      await wait(800);
      applyJobUpdate(jobId, {
        stage: "ready",
        logs: [...(getJob(jobId)?.logs ?? []), "Walkthrough generated (mock)"],
      });
      return;
    }

    applyJobUpdate(jobId, {
      stage: "generating_docs",
      logs: [...(getJob(jobId)?.logs ?? []), "Running docs generator"],
    });
    await runInterpolatedCommand(docsCommand, job.githubUrl, projectRoot);

    applyJobUpdate(jobId, {
      stage: "generating_slides",
      logs: [...(getJob(jobId)?.logs ?? []), "Running slide generator"],
    });
    await runInterpolatedCommand(slidesCommand, job.githubUrl, projectRoot);

    applyJobUpdate(jobId, {
      stage: "ready",
      logs: [...(getJob(jobId)?.logs ?? []), "Walkthrough generated successfully"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    applyJobUpdate(jobId, {
      stage: "failed",
      error: message,
      logs: [...(getJob(jobId)?.logs ?? []), `Failed: ${message}`],
    });
  }
}

async function runInterpolatedCommand(
  command: string,
  githubUrl: string,
  cwd: string,
): Promise<void> {
  const safeUrl = githubUrl.replaceAll('"', '\\"');
  const finalCommand = command.replaceAll("{githubUrl}", safeUrl);
  const { stdout, stderr } = await execAsync(finalCommand, {
    cwd,
    env: process.env,
    windowsHide: true,
  });
  if (stderr?.trim()) {
    // Some CLIs log progress to stderr; keep this non-fatal.
    console.warn(stderr.trim());
  }
  if (stdout?.trim()) {
    console.info(stdout.trim());
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
