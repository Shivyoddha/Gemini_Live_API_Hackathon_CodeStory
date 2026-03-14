import fs from "node:fs/promises";

import { NextResponse } from "next/server";

import { resolveSlideImage } from "@/lib/slides/loadDeck";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageName = searchParams.get("name");
  if (!imageName) {
    return NextResponse.json({ ok: false, error: "Missing image name." }, { status: 400 });
  }

  const resolved = await resolveSlideImage(imageName);
  if (!resolved) {
    return NextResponse.json({ ok: false, error: "Image not found." }, { status: 404 });
  }

  const buffer = await fs.readFile(resolved.absolutePath);
  const bytes = new Uint8Array(buffer);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": resolved.contentType,
      "Cache-Control": "no-store",
    },
  });
}
