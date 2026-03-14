import path from "node:path";
import type { NextConfig } from "next";

// Load project root .env so one file works for both web app and Python agents.
// Use __dirname so path resolves correctly regardless of which directory next is
// launched from (e.g. project root vs web/).
require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env"),
});

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
    resolveAlias: {
      tailwindcss: path.join(__dirname, "node_modules", "tailwindcss"),
      "@tailwindcss/postcss": path.join(__dirname, "node_modules", "@tailwindcss", "postcss"),
    },
  },
  webpack: (config) => {
    // Force resolution context to this app so "tailwindcss" and other deps resolve from web/node_modules
    // even when Next/Turbopack use project root elsewhere (e.g. PostCSS plugin resolution).
    config.context = path.join(__dirname);
    const webNodeModules = path.join(__dirname, "node_modules");
    const existing = Array.isArray(config.resolve.modules) ? config.resolve.modules : [];
    config.resolve.modules = [webNodeModules].concat(existing);
    config.resolve.alias = Object.assign({}, config.resolve.alias, {
      tailwindcss: path.join(__dirname, "node_modules", "tailwindcss"),
    });
    return config;
  },
};

export default nextConfig;
