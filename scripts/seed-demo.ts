/**
 * Popula o Supabase com um fotógrafo de demonstração e as fotos de exemplo do projeto.
 * Uso: npm run seed
 * Pode rodar mais de uma vez: fotos já cadastradas para o fotógrafo demo não são duplicadas.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db } from '../server/supabase';
import { storePhotoFiles } from '../server/media';

const DEMO_EMAIL = process.env.DEMO_PHOTOGRAPHER_EMAIL || 'fotografo.demo@fotorun.app';
const IMAGES_DIR = path.resolve(process.cwd(), 'src', 'assets', 'images');

type Seed = {
  eventId: string;
  file: string;
  bibs: string[];
  checkpoint: string;
  timeRange: 't1' | 't2' | 't3';
  caption: string;
  descriptor: string;
  faceBox?: { top: number; left: number; width: number; height: number };
  podium?: boolean;
};

const SEEDS: Seed[] = [
  { eventId: 'sobral-online-run-2026', file: 'hero_marathon_runner_1794782115123.jpg', bibs: ['1042'], checkpoint: 'Linha de Chegada', timeRange: 't1', caption: 'Sprint final na Linha de Chegada #1042', descriptor: 'Homem atlético, cabelo curto escuro, regata laranja Brasil bib 1042', faceBox: { top: 24, left: 49, width: 13, height: 14 } },
  { eventId: 'sobral-online-run-2026', file: 'event_sobral_arch_1794782115644.jpg', bibs: ['142', '148', '155', '163'], checkpoint: 'Km 10 - Arco de Fátima', timeRange: 't1', caption: 'Pelotão passando sob o Arco de Fátima', descriptor: 'Grupo de corredores com uniforme laranja e azul', faceBox: { top: 32, left: 40, width: 10, height: 12 } },
  { eventId: 'sobral-online-run-2026', file: 'athlete_female_finish_1794782116668.jpg', bibs: ['3821'], checkpoint: 'Linha de Chegada', timeRange: 't2', caption: 'Celebração na chegada #3821', descriptor: 'Mulher sorrindo, cabelo cacheado com tiara azul, regata azul bib 3821', faceBox: { top: 27, left: 44, width: 11, height: 13 } },
  { eventId: 'sobral-online-run-2026', file: 'athlete_hydration_sprint_1794782117095.jpg', bibs: ['714', '715'], checkpoint: 'Km 5 - Beira Rio', timeRange: 't1', caption: 'Passagem pelo posto de hidratação', descriptor: 'Duas corredoras lado a lado, bibs 714 e 715', faceBox: { top: 22, left: 42, width: 10, height: 12 } },
  { eventId: 'sobral-online-run-2026', file: 'athlete_podium_medal_1794782117901.jpg', bibs: ['731'], checkpoint: 'Pódio & Premiação', timeRange: 't3', caption: 'Entrega de medalha Finisher', descriptor: 'Mulher sorrindo com medalha dourada, regata Brasil bib 731', faceBox: { top: 14, left: 42, width: 16, height: 19 }, podium: true },
  { eventId: 'sobral-online-run-2026', file: 'athlete_selfie_portrait_1794782118401.jpg', bibs: ['412'], checkpoint: 'Km 8 - Av. Dr. Guarany', timeRange: 't2', caption: 'Retrato pós-prova na Av. Dr. Guarany', descriptor: 'Homem sorrindo, barba curta, regata laranja bib 412', faceBox: { top: 16, left: 37, width: 25, height: 28 } },
  { eventId: 'maratona-do-rio-2026', file: 'event_rio_marathon_1794782114832.jpg', bibs: ['399', '395', '013'], checkpoint: 'Km 22 - Aterro do Flamengo', timeRange: 't1', caption: 'Pelotão no Km 22', descriptor: 'Vários maratonistas na orla do Flamengo' },
  { eventId: 'maratona-do-rio-2026', file: 'hero_marathon_runner_1794782115123.jpg', bibs: ['1042'], checkpoint: 'Linha de Chegada', timeRange: 't2', caption: 'Chegada da Maratona do Rio #1042', descriptor: 'Homem atlético regata laranja bib 1042' },
  { eventId: 'meia-floripa-2026', file: 'athlete_female_finish_1794782116668.jpg', bibs: ['3821'], checkpoint: 'Linha de Chegada', timeRange: 't2', caption: 'Chegada na Beira-Mar #3821', descriptor: 'Mulher celebrando, regata azul bib 3821' },
  { eventId: 'maratona-sp-2026', file: 'hero_marathon_runner_1794782115123.jpg', bibs: ['1042'], checkpoint: 'Linha de Chegada', timeRange: 't2', caption: 'Chegada no Ibirapuera #1042', descriptor: 'Homem corredor regata laranja bib 1042' },
];

async function getOrCreatePhotographer() {
  const { data: list, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = list.users.find((u) => u.email === DEMO_EMAIL);
  if (existing) return { id: existing.id, password: null as string | null };

  const password = crypto.randomBytes(9).toString('base64url');
  const { data, error: createError } = await db.auth.admin.createUser({
    email: DEMO_EMAIL,
    password,
    email_confirm: true,
    user_metadata: {
      role: 'photographer',
      full_name: 'Fotógrafo Demo',
      pix_key: DEMO_EMAIL,
      terms_accepted: true,
    },
  });
  if (createError || !data.user) throw createError;
  return { id: data.user.id, password };
}

async function main() {
  const { id: photographerId, password } = await getOrCreatePhotographer();
  console.log(`Fotógrafo demo: ${DEMO_EMAIL}`);
  if (password) console.log(`Senha gerada (anote!): ${password}`);

  const { data: already } = await db.from('photos').select('event_id, filename').eq('photographer_id', photographerId);
  const done = new Set((already || []).map((p) => `${p.event_id}/${p.filename}`));

  for (const s of SEEDS) {
    const key = `${s.eventId}/${s.file}`;
    if (done.has(key)) {
      console.log(`- já existe: ${key}`);
      continue;
    }
    const original = fs.readFileSync(path.join(IMAGES_DIR, s.file));
    const stored = await storePhotoFiles({
      original,
      mimeType: 'image/jpeg',
      photographerId,
      eventId: s.eventId,
      watermarkText: 'FOTORUN PREVIEW',
      watermarkOpacity: 35,
    });
    const { error } = await db.from('photos').insert({
      event_id: s.eventId,
      photographer_id: photographerId,
      filename: s.file,
      original_path: stored.originalPath,
      preview_path: stored.previewPath,
      bib_numbers: s.bibs,
      checkpoint: s.checkpoint,
      time_range: s.timeRange,
      camera_spec: 'Foto de demonstração',
      resolution: stored.resolution,
      caption: s.caption,
      face_descriptor: s.descriptor,
      face_box: s.faceBox ?? null,
      is_podium: Boolean(s.podium),
      price: 14.9,
    });
    if (error) throw error;
    console.log(`+ enviada: ${key}`);
  }

  // O fotógrafo demo passa a administrar os eventos de exemplo (pode editar o preço do pacote)
  await db.from('events').update({ owner_id: photographerId }).is('owner_id', null);
  console.log('Pronto! Abra o site e teste a galeria e a busca facial.');
}

main().catch((err) => {
  console.error('Falha no seed:', err);
  process.exit(1);
});
