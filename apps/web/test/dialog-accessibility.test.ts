import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmSubmit } from "../src/ui/ConfirmSubmit";
import { ZoomableImage } from "../src/components/ZoomableImage";

test("confirmation dialogs expose the action name without relying on their buttons", () => {
  const html = renderToStaticMarkup(createElement(ConfirmSubmit, {
    label: "Delete entry", question: "Delete this entry?", confirmLabel: "Delete",
  }));
  assert.match(html, /<dialog[^>]+aria-label="Delete entry"/);
  assert.match(html, /<button[^>]+type="button"[^>]*>Cancel<\/button>/);
});

test("scan previews have a named native button and keep full-size images unloaded until opened", () => {
  const html = renderToStaticMarkup(createElement(ZoomableImage, {
    src: "/thumb.jpg", fullSrc: "/full.jpg", alt: "Airframe page 1", className: "h-12 w-12",
  }));
  assert.match(html, /<button[^>]+type="button"[^>]+aria-label="Open Airframe page 1"[^>]+aria-haspopup="dialog"/);
  assert.match(html, /<dialog[^>]+aria-label="Airframe page 1"/);
  assert.doesNotMatch(html, /src="\/full.jpg"/);
});
