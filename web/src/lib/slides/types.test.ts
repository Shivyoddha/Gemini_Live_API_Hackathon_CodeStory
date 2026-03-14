import test from "node:test";
import assert from "node:assert/strict";

import { slideDeckSchema } from "@/lib/slides/types";

test("slideDeckSchema parses expected deck payload", () => {
  const payload = {
    deck_title: "Verify Run - JSON Export",
    version: "1.0",
    updated_at: "2026-02-28T19:01:23.269195+00:00",
    modules: [
      {
        slide: "1",
        title: "API Layer",
        subtitle: "## API Layer",
        list_description: "## API Layer",
        speaker_notes: "Present key points from API Layer.",
        sections: [
          {
            type: "bullets",
            title: "Overview",
            items: ["## API Layer", "A markdown bullet section"],
          },
        ],
        images: [],
      },
    ],
  };

  const parsed = slideDeckSchema.parse(payload);
  assert.equal(parsed.modules.length, 1);
  assert.equal(parsed.modules[0]?.title, "API Layer");
});
