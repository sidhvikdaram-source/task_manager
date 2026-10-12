import test from "node:test";
import assert from "node:assert/strict";
import { validGeneralImages } from "../../task-manager/src/lib/generalImages.ts";

test("saved chat attachments accept bounded inline raster images and reject remote or executable content", () => {
  const image = { name: "chart.png", dataUrl: "data:image/png;base64,YWJj" };
  assert.equal(validGeneralImages([image]), true);
  assert.equal(validGeneralImages([]), true);
  for (const value of [
    null,
    [image, image],
    [{ ...image, dataUrl: "https://example.com/private.png" }],
    [{ ...image, dataUrl: "data:image/svg+xml;base64,YWJj" }],
    [{ ...image, name: "x".repeat(101) }],
    [{ ...image, dataUrl: "data:image/png;base64," + "a".repeat(180000) }],
  ])
    assert.equal(validGeneralImages(value), false);
});
