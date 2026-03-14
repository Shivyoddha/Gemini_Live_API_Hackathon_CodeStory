import JSZip from "jszip";
import { NextResponse } from "next/server";

import { getDocByFilename, listDocFiles } from "@/lib/docs/loadDocs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const downloadAll = searchParams.get("all") === "1";
  const file = searchParams.get("file");

  if (downloadAll) {
    const docs = await listDocFiles();
    if (!docs.length) {
      return NextResponse.json(
        { ok: false, error: "No documentation files found to download." },
        { status: 404 },
      );
    }

    const zip = new JSZip();
    for (const doc of docs) {
      zip.file(doc.filename, doc.markdown);
    }
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const zipBytes = new Uint8Array(zipBuffer);

    return new NextResponse(zipBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="codestory-docs.zip"',
      },
    });
  }

  if (!file) {
    return NextResponse.json(
      { ok: false, error: "Provide `file` or `all=1` query params." },
      { status: 400 },
    );
  }

  const doc = await getDocByFilename(file);
  if (!doc) {
    return NextResponse.json(
      { ok: false, error: "Requested markdown file was not found." },
      { status: 404 },
    );
  }

  return new NextResponse(doc.markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${doc.filename}"`,
    },
  });
}
