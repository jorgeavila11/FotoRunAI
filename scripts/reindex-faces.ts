/**
 * Analisa os rostos das fotos que ainda não passaram pelo reconhecimento facial.
 * Uso:
 *   npm run faces:reindex            -> só fotos ainda não analisadas
 *   npm run faces:reindex -- --all   -> reanalisa TODAS as fotos (ex.: depois de trocar o modelo)
 */
import 'dotenv/config';
import { db, BUCKET_ORIGINALS } from '../server/supabase';
import { indexPhotoFaces } from '../server/face-index';
import { faceModelsAvailable } from '../server/faces';

const all = process.argv.includes('--all');

async function main() {
  if (!faceModelsAvailable()) {
    console.error('❌ Modelos não encontrados. Rode antes: npm run models:download');
    process.exit(1);
  }

  let query = db.from('photos').select('id, event_id, filename, original_path').order('created_at');
  if (!all) query = query.is('faces_indexed_at', null);
  const { data: photos, error } = await query;
  if (error) throw error;

  if (!photos || photos.length === 0) {
    console.log('✅ Nenhuma foto pendente. Todas já foram analisadas.');
    return;
  }
  console.log(`Analisando ${photos.length} foto(s)...\n`);

  let faces = 0;
  let failed = 0;
  for (const [i, p] of photos.entries()) {
    try {
      const file = await db.storage.from(BUCKET_ORIGINALS).download(p.original_path);
      if (file.error || !file.data) throw file.error || new Error('arquivo não encontrado');
      const result = await indexPhotoFaces(p.id, p.event_id, Buffer.from(await file.data.arrayBuffer()));
      faces += result.count;
      console.log(`[${i + 1}/${photos.length}] ${p.filename}: ${result.count} rosto(s)`);
    } catch (err) {
      failed++;
      console.error(`[${i + 1}/${photos.length}] ${p.filename}: FALHOU — ${(err as Error).message}`);
    }
  }
  console.log(`\nPronto: ${faces} rosto(s) indexado(s) em ${photos.length - failed} foto(s).${failed ? ` ${failed} falha(s).` : ''}`);
}

main().catch((err) => {
  console.error('Falha na reindexação:', err);
  process.exit(1);
});
