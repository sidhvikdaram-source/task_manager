export type RectLike = Pick<DOMRect, "left" | "top" | "width" | "height">;

export function boundsWithin(container: RectLike, target: RectLike) {
  return {
    x: target.left - container.left,
    y: target.top - container.top,
    width: target.width,
    height: target.height,
  };
}
