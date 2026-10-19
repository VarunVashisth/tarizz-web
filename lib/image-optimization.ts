import { IMAGE_OUTPUT } from "./upload-policy";

type OptimizedImage = {
  download: File;
  preview: File;
  originalBytes: number;
};

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The image could not be decoded.")); };
    image.src = url;
  });
}

function render(image: HTMLImageElement, maxDimension: number, quality: number) {
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Image optimization is unavailable in this browser.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error("Image optimization failed.")),
    "image/webp",
    quality,
  ));
}

export async function optimizeImage(file: File): Promise<OptimizedImage> {
  const image = await loadImage(file);
  const [previewBlob, downloadBlob] = await Promise.all([
    render(image, IMAGE_OUTPUT.preview.maxDimension, IMAGE_OUTPUT.preview.quality),
    render(image, IMAGE_OUTPUT.download.maxDimension, IMAGE_OUTPUT.download.quality),
  ]);
  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  return {
    preview: new File([previewBlob], `${base}-preview.webp`, { type: "image/webp" }),
    download: new File([downloadBlob], `${base}-optimized.webp`, { type: "image/webp" }),
    originalBytes: file.size,
  };
}

