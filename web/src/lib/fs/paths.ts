import path from "node:path";

export const workspaceRoot = path.resolve(process.cwd(), "..");

export const docsCandidates = [
  path.join(workspaceRoot, "documentation"),
  path.join(workspaceRoot, "code", "documentation"),
];

export const slidesRoot = path.join(workspaceRoot, "slides");
export const slidesJsonPath = path.join(slidesRoot, "slides.json");
export const slidesImagesRoot = path.join(slidesRoot, "images");
