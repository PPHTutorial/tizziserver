#!/usr/bin/env node
// Cheap alternative to reading a rendered PNG: walks a Figma frame's node
// tree (already downloaded to nodes/Page-1.json) and prints every TEXT
// node's content in top-to-bottom reading order, plus the name of each
// notable container (frames/components/instances), indented by depth.
// Usage: node scripts/figma-frame-text.mjs <frameId> [frameId2 ...]
import { readFileSync } from "node:fs";

const file = JSON.parse(
  readFileSync(new URL("../docs/design/Untitled/nodes/Page-1.json", import.meta.url), "utf8"),
);

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("Usage: node scripts/figma-frame-text.mjs <frameId> [frameId2 ...]");
  process.exit(1);
}

function walk(node, depth, lines) {
  const y = node.absoluteBoundingBox?.y ?? 0;
  const indent = "  ".repeat(depth);
  if (node.type === "TEXT" && node.characters) {
    lines.push({ y, text: `${indent}"${node.characters.replace(/\n/g, " / ")}"` });
  } else if (["FRAME", "COMPONENT", "INSTANCE", "GROUP"].includes(node.type) && node.name) {
    const hint = node.type === "INSTANCE" || node.type === "COMPONENT" ? ` [${node.type}]` : "";
    lines.push({ y, text: `${indent}<${node.name}>${hint}` });
  }
  for (const child of node.children ?? []) walk(child, depth + 1, lines);
}

for (const id of ids) {
  const root = file[id]?.document;
  if (!root) {
    console.log(`\n=== ${id}: NOT FOUND ===`);
    continue;
  }
  console.log(`\n=== ${id}  "${root.name}"  ${Math.round(root.absoluteBoundingBox?.width ?? 0)}x${Math.round(root.absoluteBoundingBox?.height ?? 0)} ===`);
  const lines = [];
  walk(root, 0, lines);
  // Children are already in z-order from the API; keep document order rather
  // than re-sorting by y, since Figma's own child order is normally already
  // top-to-bottom for a stacked mobile layout.
  for (const l of lines) console.log(l.text);
}
