import { NextResponse } from "next/server";
import { z } from "zod";

import { createJob, startJobPipeline } from "@/lib/walkthrough/jobs";

const bodySchema = z.object({
  githubUrl: z.string().url().regex(/github\.com/i, "Must be a GitHub URL"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid request body. Provide a valid GitHub URL.",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const job = createJob(parsed.data.githubUrl);
    void startJobPipeline(job.id);

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      stage: job.stage,
      message: "Walkthrough generation started",
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON request body." },
      { status: 400 },
    );
  }
}
