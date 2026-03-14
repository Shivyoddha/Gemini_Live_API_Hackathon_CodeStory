import { NextResponse } from "next/server";

import { listDocFiles } from "@/lib/docs/loadDocs";
import { loadSlideDeck } from "@/lib/slides/loadDeck";

export async function GET() {
  const [docs, deck] = await Promise.all([listDocFiles(), loadSlideDeck()]);

  return NextResponse.json({
    ok: true,
    docs: docs.map((doc) => ({
      filename: doc.filename,
      sectionName: doc.sectionName,
      markdown: doc.markdown,
    })),
    deck,
  });
}
