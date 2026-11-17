/**
 * Testa o reconhecimento facial com arquivos do seu computador, sem usar o banco.
 * Uso: npm run faces:test -- caminho/selfie.jpg caminho/foto1.jpg caminho/foto2.jpg ...
 * Mostra, para cada foto, quantos rostos foram achados e a semelhança de cada um com a selfie.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { analyzePhotoFaces, cosineSimilarity, embedSelfie, FACE_MATCH_THRESHOLD } from '../server/faces';

const [selfiePath, ...photoPaths] = process.argv.slice(2);
if (!selfiePath || photoPaths.length === 0) {
  console.log('Uso: npm run faces:test -- selfie.jpg foto1.jpg foto2.jpg ...');
  process.exit(1);
}

const selfie = await embedSelfie(fs.readFileSync(selfiePath));
if (!selfie) {
  console.log('❌ Nenhum rosto encontrado na selfie.');
  process.exit(1);
}
console.log(`Selfie: rosto de ${selfie.facePx}px. Limiar atual: ${FACE_MATCH_THRESHOLD} (rostos < 64px precisam de +0,09)\n`);

for (const p of photoPaths) {
  const faces = await analyzePhotoFaces(fs.readFileSync(p));
  const scored = faces
    .map((f) => {
      const sim = cosineSimilarity(selfie.embedding, f.embedding);
      const needed = FACE_MATCH_THRESHOLD + (f.facePx < 64 ? 0.09 : 0);
      return { sim, px: f.facePx, ok: sim >= needed };
    })
    .sort((a, b) => b.sim - a.sim);
  const best = scored[0];
  console.log(
    `${best?.ok ? '✅' : '❌'} ${path.basename(p)} — ${faces.length} rosto(s); ` +
      (best ? `mais parecido: ${best.sim.toFixed(3)} (${best.px}px)` : 'nenhum rosto') +
      (scored.length > 1 ? `; outros: ${scored.slice(1, 5).map((s) => s.sim.toFixed(2)).join(', ')}` : '')
  );
}
