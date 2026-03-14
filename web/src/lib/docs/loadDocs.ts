import fs from "node:fs/promises";
import path from "node:path";

import { docsCandidates } from "@/lib/fs/paths";

export type DocFile = {
  filename: string;
  sectionName: string;
  path: string;
  markdown: string;
};

function toSectionName(filename: string): string {
  const withoutExt = filename.replace(/\.md$/i, "");
  return withoutExt.replace(/_/g, " ");
}

async function resolveDocsRoot(): Promise<string | null> {
  for (const candidate of docsCandidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function listDocFiles(): Promise<DocFile[]> {
  const docsRoot = await resolveDocsRoot();
  if (!docsRoot) {
    return [];
  }

  const entries = await fs.readdir(docsRoot, { withFileTypes: true });
  const markdownFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const docs = await Promise.all(
    markdownFiles.map(async (filename) => {
      const filePath = path.join(docsRoot, filename);
      const markdown = await fs.readFile(filePath, "utf8");
      return {
        filename,
        sectionName: toSectionName(filename),
        path: filePath,
        markdown,
      };
    }),
  );

  return docs;
}

export async function getDocByFilename(filename: string): Promise<DocFile | null> {
  const safeFilename = path.basename(filename);
  const docs = await listDocFiles();
  return docs.find((doc) => doc.filename === safeFilename) ?? null;
}
