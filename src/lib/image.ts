export interface ImageCompressionOptions {
  maxDimension?: number;
  maxBytes?: number;
  quality?: number;
}

export interface CompressedImage {
  file: File;
  width: number;
  height: number;
  originalBytes: number;
}

const loadImage = (file: File): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(objectUrl);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error("无法读取图片"));
  };
  image.src = objectUrl;
});

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error("图片压缩失败"));
  }, "image/webp", quality);
});

export async function compressImage(
  file: File,
  { maxDimension = 2400, maxBytes = 2.5 * 1024 * 1024, quality = 0.86 }: ImageCompressionOptions = {},
): Promise<CompressedImage> {
  if (typeof window === "undefined") throw new Error("图片压缩只能在浏览器中执行");

  const image = await loadImage(file);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持图片压缩");
  context.drawImage(image, 0, 0, width, height);

  let currentQuality = quality;
  let blob = await canvasToBlob(canvas, currentQuality);
  while (blob.size > maxBytes && currentQuality > 0.55) {
    currentQuality -= 0.08;
    blob = await canvasToBlob(canvas, currentQuality);
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return {
    file: new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: Date.now() }),
    width,
    height,
    originalBytes: file.size,
  };
}

/**
 * 为 Supabase Storage 图片 URL 添加缩略图转换参数。
 * 在列表展示中使用，减少加载数据量，提升页面性能。
 * 详情页和 Lightbox 大图不使用此函数，保持原图质量。
 */
export function getThumbnailUrl(
  url: string,
  options: { width?: number; height?: number; resize?: "cover" | "contain" | "fill"; quality?: number } = {}
): string {
  // 跳过未解析的私有图片标记和 data URL
  if (!url || url.startsWith("private://") || url.startsWith("data:") || url.startsWith("blob:")) return url;

  try {
    const urlObj = new URL(url);
    // 只处理 Supabase Storage 的图片 URL
    if (!urlObj.hostname.includes("supabase.co")) return url;

    const { width = 400, resize = "cover", quality = 80 } = options;
    if (width) urlObj.searchParams.set("width", String(width));
    if (options.height) urlObj.searchParams.set("height", String(options.height));
    urlObj.searchParams.set("resize", resize);
    urlObj.searchParams.set("quality", String(quality));

    return urlObj.toString();
  } catch {
    return url;
  }
}

