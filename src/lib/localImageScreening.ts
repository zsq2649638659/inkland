"use client";

export type LocalImageFinding = {
  image_index: number;
  category: string;
  score: number;
};

export type LocalImageScreening = {
  outcome: "approved" | "flagged";
  findings: LocalImageFinding[];
  predictions: Array<{ className: string; probability: number }>;
};

type NSFWModel = {
  classify: (input: HTMLImageElement, topK?: number) => Promise<Array<{ className: string; probability: number }>>;
};

let modelPromise: Promise<NSFWModel> | null = null;
const LOCAL_MODEL_URL = "/models/nsfwjs/mobilenet_v2/model.json";

async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      tf.enableProdMode();
      const nsfwjs = await import("nsfwjs/core");
      return nsfwjs.load(LOCAL_MODEL_URL) as Promise<NSFWModel>;
    })().catch((error) => {
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片无法读取"));
    };
    image.src = url;
  });
}

export async function screenImageLocally(file: File, imageIndex: number): Promise<LocalImageScreening> {
  const [model, image] = await Promise.all([getModel(), loadImage(file)]);
  const predictions = await model.classify(image, 5);
  const probability = (name: string) => predictions.find((item) => item.className === name)?.probability || 0;
  const porn = probability("Porn");
  const hentai = probability("Hentai");
  const sexy = probability("Sexy");
  const adultScore = Math.max(porn, hentai);
  const findings: LocalImageFinding[] = [];

  if (porn >= 0.45) findings.push({ image_index: imageIndex, category: "porn", score: porn });
  if (hentai >= 0.45) findings.push({ image_index: imageIndex, category: "hentai", score: hentai });
  if (sexy >= 0.7) findings.push({ image_index: imageIndex, category: "sexy", score: sexy });

  return {
    outcome: adultScore >= 0.45 || sexy >= 0.7 ? "flagged" : "approved",
    findings,
    predictions,
  };
}
