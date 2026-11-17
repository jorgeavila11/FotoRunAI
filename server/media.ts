import crypto from 'crypto';
import sharp from 'sharp';
import { db, BUCKET_ORIGINALS, BUCKET_PREVIEWS } from './supabase';

/** Largura máxima da prévia pública. Pequena o suficiente para não servir como foto final. */
const PREVIEW_WIDTH = 1200;
const PREVIEW_QUALITY = 68;

function escapeXml(text: string) {
  return text.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string)
  );
}

/**
 * Gera a marca d'água em SVG: faixas diagonais + texto repetido.
 * As faixas garantem proteção visível mesmo em servidores sem fontes instaladas.
 */
function watermarkSvg(width: number, height: number, text: string, opacity: number) {
  // Opacidade configurada (10–80%) mapeada para uma faixa sempre visível (≈0,36–0,78).
  const alpha = 0.3 + Math.max(10, Math.min(80, opacity)) / 100 * 0.6;
  const label = escapeXml(text || 'FOTORUN PREVIEW');
  const fontSize = Math.round(Math.max(width, height) / 16);
  const stepX = fontSize * (label.length * 0.62 + 3);
  const stepY = fontSize * 3.2;

  let texts = '';
  for (let y = -height; y < height * 2; y += stepY) {
    const offset = (Math.round(y / stepY) % 2) * (stepX / 2);
    for (let x = -width; x < width * 2; x += stepX) {
      texts += `<text x="${x + offset}" y="${y}">${label}</text>`;
    }
  }

  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <pattern id="stripes" width="${fontSize * 2}" height="${fontSize * 2}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <rect width="${Math.max(2, fontSize / 6)}" height="${fontSize * 2}" fill="white" fill-opacity="${alpha * 0.22}"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#stripes)"/>
  <g transform="rotate(-30 ${width / 2} ${height / 2})"
     font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}"
     fill="white" fill-opacity="${alpha}" stroke="black" stroke-opacity="${alpha * 0.5}" stroke-width="${Math.max(1, fontSize / 28)}">
    ${texts}
  </g>
</svg>`);
}

/** Cria a prévia pública: reduzida, comprimida e com a marca d'água gravada nos pixels. */
export async function makePreview(original: Buffer, watermarkText: string, watermarkOpacity: number) {
  const resized = await sharp(original)
    .rotate() // respeita a orientação EXIF
    .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  const { width, height } = resized.info;
  const buffer = await sharp(resized.data)
    .composite([{ input: watermarkSvg(width, height, watermarkText, watermarkOpacity), top: 0, left: 0 }])
    .jpeg({ quality: PREVIEW_QUALITY, mozjpeg: true })
    .toBuffer();

  return { buffer, width, height };
}

/** Versão sem marca d'água e menor, usada só internamente para a IA ler números de peito e rostos. */
export async function makeAnalysisImage(original: Buffer, maxSize = 1600) {
  return sharp(original)
    .rotate()
    .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

export function previewPublicUrl(previewPath: string) {
  return db.storage.from(BUCKET_PREVIEWS).getPublicUrl(previewPath).data.publicUrl;
}

/**
 * Salva o original no bucket privado e a prévia com marca d'água no bucket público.
 * Retorna os caminhos e a resolução real do original.
 */
export async function storePhotoFiles(params: {
  original: Buffer;
  mimeType: string;
  photographerId: string;
  eventId: string;
  watermarkText: string;
  watermarkOpacity: number;
}) {
  const { original, mimeType, photographerId, eventId, watermarkText, watermarkOpacity } = params;
  const fileId = crypto.randomUUID();
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';

  const meta = await sharp(original).metadata();
  const originalPath = `${photographerId}/${eventId}/${fileId}.${ext}`;
  const previewPath = `${eventId}/${fileId}.jpg`;

  const up1 = await db.storage
    .from(BUCKET_ORIGINALS)
    .upload(originalPath, original, { contentType: mimeType, upsert: false });
  if (up1.error) throw new Error(`Falha ao salvar original: ${up1.error.message}`);

  const preview = await makePreview(original, watermarkText, watermarkOpacity);
  const up2 = await db.storage
    .from(BUCKET_PREVIEWS)
    .upload(previewPath, preview.buffer, { contentType: 'image/jpeg', upsert: false });
  if (up2.error) {
    await db.storage.from(BUCKET_ORIGINALS).remove([originalPath]);
    throw new Error(`Falha ao salvar prévia: ${up2.error.message}`);
  }

  const resolution =
    meta.width && meta.height ? `${meta.width} × ${meta.height} px` : 'Resolução original';

  return { originalPath, previewPath, resolution };
}

/** Capa de evento: redimensiona (sem marca d'água) e publica no bucket público. */
export async function storeEventCover(original: Buffer, eventId: string) {
  const buffer = await sharp(original)
    .rotate()
    .resize({ width: 1600, height: 1000, fit: 'cover', withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
  const coverPath = `covers/${eventId}-${crypto.randomUUID().slice(0, 8)}.jpg`;
  const { error } = await db.storage
    .from(BUCKET_PREVIEWS)
    .upload(coverPath, buffer, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(`Falha ao salvar capa: ${error.message}`);
  return previewPublicUrl(coverPath);
}

/** Link temporário (padrão 1 hora) para baixar o original comprado. */
export async function signedOriginalUrl(originalPath: string, downloadName: string, expiresIn = 3600) {
  const { data, error } = await db.storage
    .from(BUCKET_ORIGINALS)
    .createSignedUrl(originalPath, expiresIn, { download: downloadName });
  if (error || !data) throw new Error(`Falha ao gerar link de download: ${error?.message}`);
  return data.signedUrl;
}
