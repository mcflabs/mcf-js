"use strict";

// Return one concrete web origin, never a wildcard, path, or opaque origin.
function readOrigin(value) {
  if (typeof value !== "string" || value.trim() !== value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.hostname.includes("*") ||
        url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

module.exports = { readOrigin };
