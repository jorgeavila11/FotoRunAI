import { db } from './supabase';
import { analyzePhotoFaces, faceModelsAvailable, toPgVector } from './faces';

export { FACE_MATCH_THRESHOLD } from './faces';

/**
 * Encontra os rostos de uma foto, grava as impressões digitais em photo_faces
 * e marca a foto como analisada. Substitui análises anteriores da mesma foto.
 */
export async function indexPhotoFaces(photoId: string, eventId: string, image: Buffer) {
  if (!faceModelsAvailable()) {
    console.warn('[rostos] modelos não encontrados — rode "npm run models:download". Foto salva sem análise facial.');
    return { count: 0, largestBox: null as null | { top: number; left: number; width: number; height: number } };
  }

  const faces = await analyzePhotoFaces(image);

  const { error: delError } = await db.from('photo_faces').delete().eq('photo_id', photoId);
  if (delError) throw delError;

  if (faces.length > 0) {
    const { error } = await db.from('photo_faces').insert(
      faces.map((f) => ({
        photo_id: photoId,
        event_id: eventId,
        embedding: toPgVector(f.embedding),
        box: f.box,
        face_px: f.facePx,
        det_score: f.score,
      }))
    );
    if (error) throw error;
  }

  const largestBox = faces[0]?.box ?? null; // analyzePhotoFaces já ordena do maior para o menor
  const { error: updError } = await db
    .from('photos')
    .update({
      faces_indexed_at: new Date().toISOString(),
      faces_count: faces.length,
      ...(largestBox ? { face_box: largestBox } : {}),
    })
    .eq('id', photoId);
  if (updError) throw updError;

  return { count: faces.length, largestBox };
}
