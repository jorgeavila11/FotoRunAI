/**
 * Reconhecimento facial gratuito e de uso comercial liberado (Apache-2.0):
 *   - YuNet  (OpenCV Zoo) — encontra os rostos e 5 pontos do rosto (olhos, nariz, cantos da boca)
 *   - SFace  (OpenCV Zoo) — transforma cada rosto alinhado em uma "impressão digital" de 128 números
 *
 * Tudo roda no próprio servidor via onnxruntime-node, sem serviços pagos.
 * Os arquivos .onnx ficam na pasta /models (baixe com "npm run models:download").
 */
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';

const MODELS_DIR = process.env.FACE_MODELS_DIR || path.resolve(process.cwd(), 'models');
export const YUNET_FILE = 'face_detection_yunet_2023mar.onnx';
export const SFACE_FILE = 'face_recognition_sface_2021dec.onnx';

const DET_SIZE = 640; // entrada fixa do YuNet
const DET_STRIDES = [8, 16, 32];
const ANALYSIS_MAX_SIDE = Number(process.env.FACE_ANALYSIS_MAX_SIDE) || 1600;
const TILE_STEP = 480; // pedaços de 640 px com sobreposição de 160 px
const SCORE_THRESHOLD = Number(process.env.FACE_DET_THRESHOLD) || 0.6;
const NMS_IOU = 0.3;
/** Rostos menores que isso (na imagem de análise) geram impressões pouco confiáveis e são ignorados. */
const MIN_FACE_PX = Number(process.env.FACE_MIN_SIZE) || 28;
/**
 * Semelhança mínima (cosseno) para considerar o mesmo rosto.
 * 0,36 é o valor de referência do SFace. Aumente (ex.: 0,40) se aparecerem fotos de outras pessoas;
 * diminua (ex.: 0,32) se fotos da própria pessoa ficarem de fora.
 */
export const FACE_MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD) || 0.36;

/** Pontos de referência do rosto alinhado 112x112 usados pelo SFace (mesmo padrão do OpenCV). */
const ALIGN_TEMPLATE: Array<[number, number]> = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

export interface DetectedFace {
  /** Caixa em pixels da imagem de análise */
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
  /** 5 pontos: olho, olho, nariz, canto da boca, canto da boca */
  landmarks: Array<[number, number]>;
}

export interface FaceResult {
  /** Caixa em porcentagem da imagem (0-100), usada na interface */
  box: { top: number; left: number; width: number; height: number };
  score: number;
  /** Tamanho do rosto em pixels na imagem de análise (lado menor da caixa) */
  facePx: number;
  /** Vetor de 128 números, normalizado (comprimento 1) */
  embedding: number[];
}

let sessions: Promise<{ det: ort.InferenceSession; rec: ort.InferenceSession }> | null = null;

export function faceModelsAvailable() {
  return fs.existsSync(path.join(MODELS_DIR, YUNET_FILE)) && fs.existsSync(path.join(MODELS_DIR, SFACE_FILE));
}

function loadSessions() {
  if (!sessions) {
    if (!faceModelsAvailable()) {
      throw new Error(
        `Modelos de reconhecimento facial não encontrados em ${MODELS_DIR}. Rode "npm run models:download".`
      );
    }
    const opts: ort.InferenceSession.SessionOptions = { logSeverityLevel: 3 };
    sessions = Promise.all([
      ort.InferenceSession.create(path.join(MODELS_DIR, YUNET_FILE), opts),
      ort.InferenceSession.create(path.join(MODELS_DIR, SFACE_FILE), opts),
    ]).then(([det, rec]) => ({ det, rec }));
    sessions.catch(() => {
      sessions = null;
    });
  }
  return sessions;
}

// ---------------------------------------------------------------------------
// Imagem
// ---------------------------------------------------------------------------

interface RawImage {
  data: Buffer; // RGB, 3 bytes por pixel
  width: number;
  height: number;
}

async function decode(image: Buffer, maxSide: number): Promise<RawImage> {
  const { data, info } = await sharp(image)
    .rotate() // respeita a orientação EXIF do celular/câmera
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Converte um recorte RGB 640x640 no tensor que o YuNet espera (BGR, CHW, 0-255). */
function toDetTensor(rgb: Buffer) {
  const plane = DET_SIZE * DET_SIZE;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    out[i] = rgb[i * 3 + 2]; // B
    out[plane + i] = rgb[i * 3 + 1]; // G
    out[2 * plane + i] = rgb[i * 3]; // R
  }
  return new ort.Tensor('float32', out, [1, 3, DET_SIZE, DET_SIZE]);
}

// ---------------------------------------------------------------------------
// Detecção (YuNet)
// ---------------------------------------------------------------------------

async function runDetector(det: ort.InferenceSession, rgb640: Buffer, scale: number, offX: number, offY: number) {
  const out = await det.run({ input: toDetTensor(rgb640) });
  const faces: DetectedFace[] = [];

  for (const stride of DET_STRIDES) {
    const cls = out[`cls_${stride}`].data as Float32Array;
    const obj = out[`obj_${stride}`].data as Float32Array;
    const bbox = out[`bbox_${stride}`].data as Float32Array;
    const kps = out[`kps_${stride}`].data as Float32Array;
    const cols = DET_SIZE / stride;
    const rows = DET_SIZE / stride;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const clsScore = Math.min(1, Math.max(0, cls[idx]));
        const objScore = Math.min(1, Math.max(0, obj[idx]));
        const score = Math.sqrt(clsScore * objScore);
        if (score < SCORE_THRESHOLD) continue;

        const cx = (c + bbox[idx * 4]) * stride;
        const cy = (r + bbox[idx * 4 + 1]) * stride;
        const w = Math.exp(bbox[idx * 4 + 2]) * stride;
        const h = Math.exp(bbox[idx * 4 + 3]) * stride;

        const landmarks: Array<[number, number]> = [];
        for (let n = 0; n < 5; n++) {
          landmarks.push([
            ((kps[idx * 10 + 2 * n] + c) * stride) / scale + offX,
            ((kps[idx * 10 + 2 * n + 1] + r) * stride) / scale + offY,
          ]);
        }
        faces.push({
          x: (cx - w / 2) / scale + offX,
          y: (cy - h / 2) / scale + offY,
          w: w / scale,
          h: h / scale,
          score,
          landmarks,
        });
      }
    }
  }
  return faces;
}

function iou(a: DetectedFace, b: DetectedFace) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
}

function nms(faces: DetectedFace[]) {
  const sorted = [...faces].sort((a, b) => b.score - a.score);
  const kept: DetectedFace[] = [];
  for (const f of sorted) {
    if (kept.every((k) => iou(k, f) < NMS_IOU)) kept.push(f);
  }
  return kept;
}

/** Extrai um recorte 640x640 da imagem (preenchendo com preto fora da borda). */
function crop640(img: RawImage, left: number, top: number) {
  const out = Buffer.alloc(DET_SIZE * DET_SIZE * 3);
  for (let y = 0; y < DET_SIZE; y++) {
    const sy = top + y;
    if (sy < 0 || sy >= img.height) continue;
    const x0 = Math.max(0, left);
    const x1 = Math.min(img.width, left + DET_SIZE);
    if (x1 <= x0) continue;
    img.data.copy(out, (y * DET_SIZE + (x0 - left)) * 3, (sy * img.width + x0) * 3, (sy * img.width + x1) * 3);
  }
  return out;
}

/**
 * Encontra todos os rostos da imagem.
 * 1) A foto inteira reduzida para 640 px (rostos grandes).
 * 2) Se a foto for maior, pedaços de 640 px sobrepostos na resolução de análise (rostos pequenos ao fundo).
 */
async function detectFaces(img: RawImage): Promise<DetectedFace[]> {
  const { det } = await loadSessions();
  const all: DetectedFace[] = [];

  // Passo 1: imagem inteira
  const scale = DET_SIZE / Math.max(img.width, img.height);
  const fullW = Math.max(1, Math.round(img.width * scale));
  const fullH = Math.max(1, Math.round(img.height * scale));
  const full = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 3 } })
    .resize(fullW, fullH, { fit: 'fill' })
    .extend({ right: DET_SIZE - fullW, bottom: DET_SIZE - fullH, background: { r: 0, g: 0, b: 0 } })
    .raw()
    .toBuffer();
  all.push(...(await runDetector(det, full, scale, 0, 0)));

  // Passo 2: pedaços sobrepostos
  if (Math.max(img.width, img.height) > DET_SIZE) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = 0; ; x += TILE_STEP) {
      xs.push(Math.min(x, Math.max(0, img.width - DET_SIZE)));
      if (x + DET_SIZE >= img.width) break;
    }
    for (let y = 0; ; y += TILE_STEP) {
      ys.push(Math.min(y, Math.max(0, img.height - DET_SIZE)));
      if (y + DET_SIZE >= img.height) break;
    }
    for (const top of new Set(ys)) {
      for (const left of new Set(xs)) {
        all.push(...(await runDetector(det, crop640(img, left, top), 1, left, top)));
      }
    }
  }

  return nms(all).filter((f) => Math.min(f.w, f.h) >= MIN_FACE_PX);
}

// ---------------------------------------------------------------------------
// Alinhamento + reconhecimento (SFace)
// ---------------------------------------------------------------------------

/** Transformação de similaridade (escala + rotação + deslocamento) por mínimos quadrados. */
function similarityTransform(src: Array<[number, number]>, dst: Array<[number, number]>) {
  const n = src.length;
  let msx = 0, msy = 0, mdx = 0, mdy = 0;
  for (let i = 0; i < n; i++) {
    msx += src[i][0]; msy += src[i][1]; mdx += dst[i][0]; mdy += dst[i][1];
  }
  msx /= n; msy /= n; mdx /= n; mdy /= n;
  let num1 = 0, num2 = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const x = src[i][0] - msx, y = src[i][1] - msy;
    const u = dst[i][0] - mdx, v = dst[i][1] - mdy;
    num1 += x * u + y * v;
    num2 += x * v - y * u;
    den += x * x + y * y;
  }
  const a = num1 / (den || 1);
  const b = num2 / (den || 1);
  // dst = [a -b; b a] * src + t
  const tx = mdx - (a * msx - b * msy);
  const ty = mdy - (b * msx + a * msy);
  return { a, b, tx, ty };
}

/** Recorta o rosto alinhado 112x112 (interpolação bilinear) e monta o tensor do SFace (RGB, CHW, 0-255). */
function alignedFaceTensor(img: RawImage, landmarks: Array<[number, number]>) {
  const { a, b, tx, ty } = similarityTransform(landmarks, ALIGN_TEMPLATE);
  const det = a * a + b * b || 1;
  const size = 112;
  const plane = size * size;
  const out = new Float32Array(3 * plane);

  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      // inversa: src = M^-1 (dst - t)
      const du = u - tx;
      const dv = v - ty;
      const sx = (a * du + b * dv) / det;
      const sy = (-b * du + a * dv) / det;

      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const fx = sx - x0, fy = sy - y0;
      const o = v * size + u;
      for (let ch = 0; ch < 3; ch++) {
        let acc = 0;
        for (const [dx, dy, wgt] of [
          [0, 0, (1 - fx) * (1 - fy)],
          [1, 0, fx * (1 - fy)],
          [0, 1, (1 - fx) * fy],
          [1, 1, fx * fy],
        ] as const) {
          const px = x0 + dx, py = y0 + dy;
          if (px >= 0 && py >= 0 && px < img.width && py < img.height) {
            acc += img.data[(py * img.width + px) * 3 + ch] * wgt;
          }
        }
        out[ch * plane + o] = acc;
      }
    }
  }
  return new ort.Tensor('float32', out, [1, 3, size, size]);
}

function normalize(v: Float32Array) {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return Array.from(v, (x) => x / n);
}

async function embedFace(img: RawImage, face: DetectedFace) {
  const { rec } = await loadSessions();
  const out = await rec.run({ data: alignedFaceTensor(img, face.landmarks) });
  return normalize(out.fc1.data as Float32Array);
}

export function cosineSimilarity(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// ---------------------------------------------------------------------------
// API usada pelo servidor
// ---------------------------------------------------------------------------

/** Analisa uma foto de evento: devolve todos os rostos com caixa (%) e impressão digital. */
export async function analyzePhotoFaces(image: Buffer, maxFaces = 60): Promise<FaceResult[]> {
  const img = await decode(image, ANALYSIS_MAX_SIDE);
  const faces = (await detectFaces(img)).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, maxFaces);
  const results: FaceResult[] = [];
  for (const f of faces) {
    results.push({
      box: {
        top: Math.max(0, (f.y / img.height) * 100),
        left: Math.max(0, (f.x / img.width) * 100),
        width: Math.min(100, (f.w / img.width) * 100),
        height: Math.min(100, (f.h / img.height) * 100),
      },
      score: f.score,
      facePx: Math.round(Math.min(f.w, f.h)),
      embedding: await embedFace(img, f),
    });
  }
  return results;
}

/** Selfie: usa o MAIOR rosto da imagem. Devolve null se nenhum rosto for encontrado. */
export async function embedSelfie(image: Buffer): Promise<FaceResult | null> {
  const faces = await analyzePhotoFaces(image, 1);
  return faces[0] ?? null;
}

/** Converte a similaridade (cosseno) em uma "confiança" de 0 a 100 para exibir na tela. */
export function similarityToConfidence(similarity: number, threshold: number) {
  // limiar -> 60%, similaridade 0,75 ou mais -> 99%
  const t = Math.min(1, Math.max(0, (similarity - threshold) / (0.75 - threshold)));
  return Math.round((60 + t * 39) * 10) / 10;
}

/** Formato aceito pelo pgvector: "[0.1,0.2,...]" */
export function toPgVector(v: number[]) {
  return `[${v.map((x) => x.toFixed(6)).join(',')}]`;
}
