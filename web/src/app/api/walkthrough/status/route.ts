import { NextResponse } from "next/server";

import { getJob, getLatestJob } from "@/lib/walkthrough/jobs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const job = jobId ? getJob(jobId) : getLatestJob();

  if (!job) {
    return NextResponse.json(
      { ok: false, error: "No walkthrough job found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, job });
}
