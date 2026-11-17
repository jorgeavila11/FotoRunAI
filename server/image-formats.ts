/**
 * Formatos de imagem aceitos no envio que o "sharp" não lê sozinho.
 *
 * JPEG XL (.jxl): decodificado com jxl-oxide (WebAssembly, licença MIT/Apache-2.0) e convertido
 * para JPEG de alta qualidade. Assim o atleta recebe um arquivo que abre em qualquer celular ou computador.
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import initJxl, { JxlImage } from 'jxl-oxide-wasm';

const JPEG_QUALITY = 95;

let jxlReady: Promise<unknown> | null = null;
function ensureJxl() {
  if (!jxlReady) {
    const wasmPath = fileURLToPath(import.meta.resolve('jxl-oxide-wasm/module.wasm'));
    jxlReady = initJxl({ module_or_path: fs.readFileSync(wasmPath) });
    jxlReady.catch(() => {
      jxlReady = null;
    });
  }
  return jxlReady;
}

/** JPEG XL: código bruto começa com FF 0A; formato "container" começa com a caixa "JXL ". */
export function isJpegXl(buf: Buffer) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0x0a) return true;
  const container = Buffer.from([0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]);
  return buf.length >= 12 && buf.subarray(0, 12).equals(container);
}

async function jxlToJpeg(buf: Buffer) {
  await ensureJxl();
  const image = new JxlImage();
  try {
    image.forceSrgb = true; // cores padronizadas para a web
    image.feedBytes(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    // "loaded" existe na biblioteca, mas não está nas definições de tipo dela
    const status = image as unknown as { loaded: boolean };
    if (!image.tryInit() || !status.loaded) throw new Error('Arquivo JPEG XL incompleto ou corrompido.');
    // encodeToPng consome o resultado e já libera a memória dele
    const png = Buffer.from(image.render().encodeToPng());
    return await sharp(png).jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  } finally {
    image.free();
  }
}

/** Remove o prefixo "data:...;base64," de qualquer tipo (o Windows às vezes não informa o tipo do .jxl). */
export function decodeDataUrl(data: string) {
  return Buffer.from(data.replace(/^data:[^,]*;base64,/, ''), 'base64');
}

/**
 * Prepara uma imagem enviada: converte formatos especiais (JPEG XL) e devolve
 * o arquivo pronto para o restante do sistema, com tipo e nome ajustados.
 */
export async function normalizeImage(buf: Buffer, filename = 'foto.jpg', mimeType = 'image/jpeg') {
  if (isJpegXl(buf)) {
    return {
      buffer: await jxlToJpeg(buf),
      mimeType: 'image/jpeg',
      filename: filename.replace(/\.jxl$/i, '') + '.jpg',
      convertedFrom: 'jxl' as const,
    };
  }
  const safeMime = ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType) ? mimeType : 'image/jpeg';
  return { buffer: buf, mimeType: safeMime, filename, convertedFrom: null };
}
