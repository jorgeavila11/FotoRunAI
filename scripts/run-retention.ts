/**
 * Roda a limpeza de dados vencidos (LGPD) manualmente.
 * Uso:
 *   npm run retention:run -- --dry-run   -> só mostra o que seria apagado
 *   npm run retention:run                -> apaga de verdade
 * O servidor também roda essa limpeza sozinho todo dia.
 */
import 'dotenv/config';
import { runRetention } from '../server/retention';

const dryRun = process.argv.includes('--dry-run');

const s = await runRetention({ dryRun, batch: 2000 });
console.log(dryRun ? 'SIMULAÇÃO (nada foi apagado):' : 'Limpeza concluída:');
console.log(`- Impressões faciais ${dryRun ? 'a apagar' : 'apagadas'}: ${s.facesDeleted} (eventos: ${s.facesEvents.join(', ') || 'nenhum'})`);
console.log(`- Fotos ${dryRun ? 'a apagar' : 'apagadas'}: ${s.photosPurged} (eventos: ${s.photosEvents.join(', ') || 'nenhum'})`);
console.log(`- Fotos mantidas porque algum comprador ainda pode baixar: ${s.photosKeptForDownload}`);
