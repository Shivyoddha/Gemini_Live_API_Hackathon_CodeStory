import test from "node:test";
import assert from "node:assert/strict";

import { listDocFiles } from "@/lib/docs/loadDocs";

test("listDocFiles discovers section markdown documents", async () => {
  const docs = await listDocFiles();
  assert.ok(Array.isArray(docs));
  assert.ok(docs.length > 0, "Expected at least one markdown section file");
  assert.ok(docs[0]?.filename.endsWith(".md"));
  assert.ok(Boolean(docs[0]?.markdown.trim().length));
});
