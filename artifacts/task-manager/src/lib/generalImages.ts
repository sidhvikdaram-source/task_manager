export type GeneralImage = { name: string; dataUrl: string };
export const GENERAL_IMAGE_CHARS = 180000;
export function validGeneralImages(value: unknown): value is GeneralImage[] {
  return (
    Array.isArray(value) &&
    value.length <= 1 &&
    value.every(
      (image) =>
        image &&
        typeof image.name === "string" &&
        image.name.length <= 100 &&
        typeof image.dataUrl === "string" &&
        image.dataUrl.length <= GENERAL_IMAGE_CHARS &&
        /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          image.dataUrl,
        ),
    )
  );
}
export async function prepareGeneralImage(file: File): Promise<GeneralImage> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw Error("Choose a PNG, JPEG or WebP image.");
  if (file.size > 10000000) throw Error("Choose an image smaller than 10 MB.");
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error("This image could not be read."));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(Error("This image could not be opened."));
    image.src = original;
  });
  if (!image.naturalWidth || !image.naturalHeight)
    throw Error("This image has no usable dimensions.");
  const name = file.name.slice(0, 100);
  if (
    original.length <= GENERAL_IMAGE_CHARS &&
    Math.max(image.naturalWidth, image.naturalHeight) <= 2000
  )
    return { name, dataUrl: original };
  let longest = Math.min(
    2000,
    Math.max(image.naturalWidth, image.naturalHeight),
  );
  for (let round = 0; round < 4; round++) {
    const scale = longest / Math.max(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw Error("Your browser could not prepare this image.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.92, 0.82, 0.72]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= GENERAL_IMAGE_CHARS) return { name, dataUrl };
    }
    longest = Math.round(longest * 0.75);
  }
  throw Error(
    "This image is too large to save clearly. Crop it to the section you want analyzed.",
  );
}
