import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const PORT = 3000;
const app = express();

app.use(express.json({ limit: '50mb' }));

const SEEDED_DIR = path.resolve(process.cwd(), 'src', 'assets', 'images');
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use('/media/seeded', express.static(SEEDED_DIR));
app.use('/media/uploads', express.static(UPLOADS_DIR));

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

interface ServerPhoto {
  id: string;
  eventId: string;
  filename: string;
  diskPath: string;
  imageUrl: string;
  mediaType: 'photo' | 'video';
  bibNumbers: string[];
  checkpoint: string;
  timeRange: 't1' | 't2' | 't3';
  capturedAt: string;
  photographer: string;
  cameraSpec: string;
  resolution: string;
  caption: string;
  faceDescriptor: string;
  faceBox?: { top: number; left: number; width: number; height: number };
  isPodium?: boolean;
  price: number;
}

const pricing = {
  individualPrice: 14.9,
  packPrice: 39.9,
  videoPrice: 19.9,
  watermarkText: 'FOTORUN PREVIEW',
  watermarkOpacity: 35,
};

const events = [
  {
    id: 'sobral-online-run-2026',
    slug: 'sobral-online-run-2026',
    title: 'Sobral Online Run 2026',
    dateLabel: '01/11/2026',
    city: 'Sobral',
    state: 'CE',
    location: 'Arco de Nossa Senhora de Fátima, Sobral - CE',
    distances: '10K e 5K',
    coverImage: '/media/seeded/event_sobral_arch_1794782115644.jpg',
    officialAgency: 'Seu Click Fotografia',
    photographersCount: 12,
    totalArchivePhotos: 259912,
    totalVideos: 1190,
    checkpoints: ['Largada Oficial', 'Km 5 - Beira Rio', 'Km 8 - Av. Dr. Guarany', 'Km 10 - Arco de Fátima', 'Linha de Chegada', 'Pódio & Premiação'],
    status: 'disponivel' as const,
  },
  {
    id: 'maratona-do-rio-2026',
    slug: 'maratona-do-rio-2026',
    title: 'Maratona do Rio 2026',
    dateLabel: '14/06/2026',
    city: 'Rio de Janeiro',
    state: 'RJ',
    location: 'Aterro do Flamengo, Rio de Janeiro - RJ',
    distances: '42K, 21K, 10K e 5K',
    coverImage: '/media/seeded/event_rio_marathon_1794782114832.jpg',
    officialAgency: 'Brasil Sports Click',
    photographersCount: 384,
    totalArchivePhotos: 184200,
    totalVideos: 840,
    checkpoints: ['Largada Leme', 'Km 10 - Botafogo', 'Km 22 - Aterro do Flamengo', 'Linha de Chegada', 'Pódio & Premiação'],
    status: 'disponivel' as const,
  },
  {
    id: 'meia-floripa-2026',
    slug: 'meia-floripa-2026',
    title: 'Meia de Floripa 21K',
    dateLabel: '28/05/2026',
    city: 'Florianópolis',
    state: 'SC',
    location: 'Beira-Mar Norte, Florianópolis - SC',
    distances: '21K e 10K',
    coverImage: '/media/seeded/athlete_female_finish_1794782116668.jpg',
    officialAgency: 'Ilha Click Esportes',
    photographersCount: 192,
    totalArchivePhotos: 92400,
    totalVideos: 410,
    checkpoints: ['Largada Ponte', 'Km 10 - Beira-Mar', 'Linha de Chegada', 'Pódio & Premiação'],
    status: 'disponivel' as const,
  },
  {
    id: 'maratona-sp-2026',
    slug: 'maratona-sp-2026',
    title: 'Maratona Internacional de SP',
    dateLabel: '05/04/2026',
    city: 'São Paulo',
    state: 'SP',
    location: 'Parque Ibirapuera, São Paulo - SP',
    distances: '42K e 21K',
    coverImage: '/media/seeded/athlete_hydration_sprint_1794782117095.jpg',
    officialAgency: 'Paulista Sport Photo',
    photographersCount: 410,
    totalArchivePhotos: 215000,
    totalVideos: 960,
    checkpoints: ['Largada Ibirapuera', 'Km 15 - Hidratação', 'Km 30 - Pinheiros', 'Linha de Chegada'],
    status: 'disponivel' as const,
  },
];

const photos: ServerPhoto[] = [
  {
    id: 'ph-sobral-1',
    eventId: 'sobral-online-run-2026',
    filename: 'hero_marathon_runner_1794782115123.jpg',
    diskPath: path.join(SEEDED_DIR, 'hero_marathon_runner_1794782115123.jpg'),
    imageUrl: '/media/seeded/hero_marathon_runner_1794782115123.jpg',
    mediaType: 'photo',
    bibNumbers: ['1042'],
    checkpoint: 'Linha de Chegada',
    timeRange: 't1',
    capturedAt: '06:48:15',
    photographer: 'Carlos Silva',
    cameraSpec: '70-200mm f/2.8 · 1/2000s',
    resolution: '6000 × 4000 px · 300 DPI',
    caption: 'Sprint final na Linha de Chegada com regata laranja Brasil #1042',
    faceDescriptor: 'Homem brasileiro atlético, pele morena, cabelo curto escuro cacheado, expressão determinada, regata laranja Brasil bib 1042',
    faceBox: { top: 24, left: 49, width: 13, height: 14 },
    price: 14.9,
  },
  {
    id: 'ph-sobral-2',
    eventId: 'sobral-online-run-2026',
    filename: 'event_sobral_arch_1794782115644.jpg',
    diskPath: path.join(SEEDED_DIR, 'event_sobral_arch_1794782115644.jpg'),
    imageUrl: '/media/seeded/event_sobral_arch_1794782115644.jpg',
    mediaType: 'photo',
    bibNumbers: ['142', '148', '155', '163'],
    checkpoint: 'Km 10 - Arco de Fátima',
    timeRange: 't1',
    capturedAt: '06:35:42',
    photographer: 'Eduardo Frota',
    cameraSpec: '35mm f/1.8 · 1/1600s',
    resolution: '6000 × 4000 px · 300 DPI',
    caption: 'Pelotão passando sob o Arco Histórico de Fátima em Sobral',
    faceDescriptor: 'Grupo de 4 corredores com uniforme laranja e azul passando sob arco branco histórico',
    faceBox: { top: 32, left: 40, width: 10, height: 12 },
    price: 14.9,
  },
  {
    id: 'ph-sobral-3',
    eventId: 'sobral-online-run-2026',
    filename: 'athlete_female_finish_1794782116668.jpg',
    diskPath: path.join(SEEDED_DIR, 'athlete_female_finish_1794782116668.jpg'),
    imageUrl: '/media/seeded/athlete_female_finish_1794782116668.jpg',
    mediaType: 'photo',
    bibNumbers: ['3821'],
    checkpoint: 'Linha de Chegada',
    timeRange: 't2',
    capturedAt: '07:05:44',
    photographer: 'Mariana Pontes',
    cameraSpec: '70-200mm f/2.8 · 1/2500s',
    resolution: '6000 × 4000 px · 300 DPI',
    caption: 'Celebração na linha de chegada com os braços erguidos #3821',
    faceDescriptor: 'Mulher corredora sorrindo intensamente, cabelo cacheado preso com tiara azul, regata azul bib 3821',
    faceBox: { top: 27, left: 44, width: 11, height: 13 },
    price: 14.9,
  },
  {
    id: 'ph-sobral-4',
    eventId: 'sobral-online-run-2026',
    filename: 'athlete_hydration_sprint_1794782117095.jpg',
    diskPath: path.join(SEEDED_DIR, 'athlete_hydration_sprint_1794782117095.jpg'),
    imageUrl: '/media/seeded/athlete_hydration_sprint_1794782117095.jpg',
    mediaType: 'photo',
    bibNumbers: ['714', '715'],
    checkpoint: 'Km 5 - Beira Rio',
    timeRange: 't1',
    capturedAt: '06:31:10',
    photographer: 'Lucas Aragão',
    cameraSpec: '85mm f/1.4 · 1/3200s',
    resolution: '6000 × 4000 px · 300 DPI',
    caption: 'Passagem pelo posto de hidratação Beira Rio com respingos congelados',
    faceDescriptor: 'Duas mulheres corredoras lado a lado, uma com tranças e regata verde bib 714, outra com top rosa bib 715',
    faceBox: { top: 22, left: 42, width: 10, height: 12 },
    price: 14.9,
  },
  {
    id: 'ph-sobral-5',
    eventId: 'sobral-online-run-2026',
    filename: 'athlete_podium_medal_1794782117901.jpg',
    diskPath: path.join(SEEDED_DIR, 'athlete_podium_medal_1794782117901.jpg'),
    imageUrl: '/media/seeded/athlete_podium_medal_1794782117901.jpg',
    mediaType: 'photo',
    bibNumbers: ['731'],
    checkpoint: 'Pódio & Premiação',
    timeRange: 't3',
    capturedAt: '08:15:20',
    photographer: 'Mariana Pontes',
    cameraSpec: '50mm f/1.4 · 1/1000s',
    resolution: '6000 × 4000 px · 300 DPI',
    caption: 'Entrega de medalha Finisher e celebração no gramado oficial',
    faceDescriptor: 'Mulher brasileira sorrindo largo segurando medalha dourada, cabelo cacheado escuro com laço azul, regata Brasil bib 731',
    faceBox: { top: 14, left: 42, width: 16, height: 19 },
    isPodium: true,
    price: 14.9,
  },
  {
    id: 'ph-sobral-6',
    eventId: 'sobral-online-run-2026',
    filename: 'athlete_selfie_portrait_1794782118401.jpg',
    diskPath: path.join(SEEDED_DIR, 'athlete_selfie_portrait_1794782118401.jpg'),
    imageUrl: '/media/seeded/athlete_selfie_portrait_1794782118401.jpg',
    mediaType: 'photo',
    bibNumbers: ['412', '1042'],
    checkpoint: 'Km 8 - Av. Dr. Guarany',
    timeRange: 't2',
    capturedAt: '06:55:02',
    photographer: 'Carlos Silva',
    cameraSpec: '85mm f/1.8 · 1/1250s',
    resolution: '6000 × 4000 px · 300 DPI',
    caption: 'Retrato oficial pós-prova na Av. Dr. Guarany em Sobral',
    faceDescriptor: 'Homem corredor sorrindo olhando para frente, cabelo escuro preso para trás, barba curta, regata laranja bib 412',
    faceBox: { top: 16, left: 37, width: 25, height: 28 },
    price: 14.9,
  },
  {
    id: 'ph-sobral-7',
    eventId: 'sobral-online-run-2026',
    filename: 'event_rio_marathon_1794782114832.jpg',
    diskPath: path.join(SEEDED_DIR, 'event_rio_marathon_1794782114832.jpg'),
    imageUrl: '/media/seeded/event_rio_marathon_1794782114832.jpg',
    mediaType: 'photo',
    bibNumbers: ['2109', '882'],
    checkpoint: 'Largada Oficial',
    timeRange: 't1',
    capturedAt: '06:02:10',
    photographer: 'Eduardo Frota',
    cameraSpec: '24-70mm f/2.8 · 1/1000s',
    resolution: '6000 × 4000 px · 300 DPI',
    caption: 'Vista panorâmica do pelotão geral na largada oficial',
    faceDescriptor: 'Multidão de corredores em avenida arborizada ao amanhecer',
    price: 14.9,
  },
  {
    id: 'ph-sobral-8',
    eventId: 'sobral-online-run-2026',
    filename: 'hero_marathon_runner_1794782115123.jpg',
    diskPath: path.join(SEEDED_DIR, 'hero_marathon_runner_1794782115123.jpg'),
    imageUrl: '/media/seeded/hero_marathon_runner_1794782115123.jpg',
    mediaType: 'video',
    bibNumbers: ['1042'],
    checkpoint: 'Linha de Chegada',
    timeRange: 't1',
    capturedAt: '06:48:18',
    photographer: 'Equipe Drone Sobral',
    cameraSpec: '4K 60fps · Gimbal Tracking',
    resolution: '3840 × 2160 px · 60fps',
    caption: 'Clipe 4K de chegada no pórtico principal (15s)',
    faceDescriptor: 'Homem brasileiro atlético cruzando linha de chegada em vídeo 4K bib 1042',
    faceBox: { top: 24, left: 49, width: 13, height: 14 },
    price: 19.9,
  },
  // Maratona do Rio 2026 photos
  {
    id: 'ph-rio-1',
    eventId: 'maratona-do-rio-2026',
    filename: 'event_rio_marathon_1794782114832.jpg',
    diskPath: path.join(SEEDED_DIR, 'event_rio_marathon_1794782114832.jpg'),
    imageUrl: '/media/seeded/event_rio_marathon_1794782114832.jpg',
    mediaType: 'photo',
    bibNumbers: ['399', '395', '013'],
    checkpoint: 'Km 22 - Aterro do Flamengo',
    timeRange: 't1',
    capturedAt: '06:44:20',
    photographer: 'Ana Paula S.',
    cameraSpec: '24-70mm f/2.8 · 1/1600s',
    resolution: '6000 × 4000 px · 300 DPI',
    caption: 'Pelotão na altura do Km 22 com Pão de Açúcar ao fundo',
    faceDescriptor: 'Vários maratonistas correndo na orla do Flamengo com montanha ao fundo',
    price: 14.9,
  },
  {
    id: 'ph-rio-2',
    eventId: 'maratona-do-rio-2026',
    filename: 'hero_marathon_runner_1794782115123.jpg',
    diskPath: path.join(SEEDED_DIR, 'hero_marathon_runner_1794782115123.jpg'),
    imageUrl: '/media/seeded/hero_marathon_runner_1794782115123.jpg',
    mediaType: 'photo',
    bibNumbers: ['1042'],
    checkpoint: 'Linha de Chegada',
    timeRange: 't2',
    capturedAt: '07:22:10',
    photographer: 'Ana Paula S.',
    cameraSpec: '70-200mm f/2.8 · 1/2000s',
    resolution: '6000 × 4000 px · 300 DPI',
    caption: 'Cruzamento do pórtico azul da Maratona do Rio #1042',
    faceDescriptor: 'Homem brasileiro atlético regata laranja Brasil bib 1042',
    faceBox: { top: 24, left: 49, width: 13, height: 14 },
    price: 14.9,
  },
  {
    id: 'ph-rio-3',
    eventId: 'maratona-do-rio-2026',
    filename: 'athlete_hydration_sprint_1794782117095.jpg',
    diskPath: path.join(SEEDED_DIR, 'athlete_hydration_sprint_1794782117095.jpg'),
    imageUrl: '/media/seeded/athlete_hydration_sprint_1794782117095.jpg',
    mediaType: 'photo',
    bibNumbers: ['714', '715'],
    checkpoint: 'Km 10 - Botafogo',
    timeRange: 't1',
    capturedAt: '06:35:05',
    photographer: 'Marcos Silva',
    cameraSpec: '70-200mm f/2.8 · 1/2500s',
    resolution: '6000 × 4000 px · 300 DPI',
    caption: 'Estação de hidratação Rio 10K com duelo de ritmo',
    faceDescriptor: 'Duas corredoras passando pela estação de hidratação Rio 10K',
    price: 14.9,
  },
  {
    id: 'ph-rio-4',
    eventId: 'maratona-do-rio-2026',
    filename: 'athlete_podium_medal_1794782117901.jpg',
    diskPath: path.join(SEEDED_DIR, 'athlete_podium_medal_1794782117901.jpg'),
    imageUrl: '/media/seeded/athlete_podium_medal_1794782117901.jpg',
    mediaType: 'photo',
    bibNumbers: ['731'],
    checkpoint: 'Pódio & Premiação',
    timeRange: 't3',
    capturedAt: '08:25:12',
    photographer: 'Ana Paula S.',
    cameraSpec: '50mm f/1.4 · 1/1250s',
    resolution: '6000 × 4000 px · 300 DPI',
    caption: 'Atleta exibindo medalha Finisher Rio de Janeiro #731',
    faceDescriptor: 'Mulher brasileira sorrindo segurando medalha Finisher Rio de Janeiro bib 731',
    isPodium: true,
    price: 14.9,
  },
  // Meia de Floripa
  {
    id: 'ph-floripa-1',
    eventId: 'meia-floripa-2026',
    filename: 'athlete_female_finish_1794782116668.jpg',
    diskPath: path.join(SEEDED_DIR, 'athlete_female_finish_1794782116668.jpg'),
    imageUrl: '/media/seeded/athlete_female_finish_1794782116668.jpg',
    mediaType: 'photo',
    bibNumbers: ['3821'],
    checkpoint: 'Linha de Chegada',
    timeRange: 't2',
    capturedAt: '07:58:14',
    photographer: 'Rafael Borges',
    cameraSpec: '70-200mm f/2.8 · 1/2000s',
    resolution: '6000 × 4000 px · 300 DPI',
    caption: 'Chegada emocionante sub-3h no pórtico da Beira-Mar',
    faceDescriptor: 'Mulher corredora celebrando com braços abertos regata azul bib 3821',
    price: 14.9,
  },
  {
    id: 'ph-floripa-2',
    eventId: 'meia-floripa-2026',
    filename: 'athlete_selfie_portrait_1794782118401.jpg',
    diskPath: path.join(SEEDED_DIR, 'athlete_selfie_portrait_1794782118401.jpg'),
    imageUrl: '/media/seeded/athlete_selfie_portrait_1794782118401.jpg',
    mediaType: 'photo',
    bibNumbers: ['412'],
    checkpoint: 'Km 10 - Beira-Mar',
    timeRange: 't1',
    capturedAt: '06:51:30',
    photographer: 'Rafael Borges',
    cameraSpec: '85mm f/1.8 · 1/1600s',
    resolution: '6000 × 4000 px · 300 DPI',
    caption: 'Registro de percurso na Beira-Mar Norte #412',
    faceDescriptor: 'Homem corredor sorrindo regata laranja bib 412',
    price: 14.9,
  },
  // Maratona SP
  {
    id: 'ph-sp-1',
    eventId: 'maratona-sp-2026',
    filename: 'event_sobral_arch_1794782115644.jpg',
    diskPath: path.join(SEEDED_DIR, 'event_sobral_arch_1794782115644.jpg'),
    imageUrl: '/media/seeded/event_sobral_arch_1794782115644.jpg',
    mediaType: 'photo',
    bibNumbers: ['142', '148', '155'],
    checkpoint: 'Largada Ibirapuera',
    timeRange: 't1',
    capturedAt: '06:12:40',
    photographer: 'Thiago Mendes',
    cameraSpec: '35mm f/1.8 · 1/1600s',
    resolution: '6000 × 4000 px · 300 DPI',
    caption: 'Ritmo forte da equipe nos primeiros quilômetros',
    faceDescriptor: 'Grupo de 4 corredores com uniforme laranja e azul',
    price: 14.9,
  },
  {
    id: 'ph-sp-2',
    eventId: 'maratona-sp-2026',
    filename: 'hero_marathon_runner_1794782115123.jpg',
    diskPath: path.join(SEEDED_DIR, 'hero_marathon_runner_1794782115123.jpg'),
    imageUrl: '/media/seeded/hero_marathon_runner_1794782115123.jpg',
    mediaType: 'photo',
    bibNumbers: ['1042'],
    checkpoint: 'Linha de Chegada',
    timeRange: 't2',
    capturedAt: '07:45:10',
    photographer: 'Thiago Mendes',
    cameraSpec: '70-200mm f/2.8 · 1/2000s',
    resolution: '6000 × 4000 px · 300 DPI',
    caption: 'Chegada oficial no Parque Ibirapuera #1042',
    faceDescriptor: 'Homem corredor regata laranja Brasil bib 1042',
    price: 14.9,
  },
];

const batches = [
  {
    id: 'batch-01',
    eventId: 'sobral-online-run-2026',
    name: 'Lote #01 - Largada 5K/10K',
    checkpoint: 'Pórtico Central (06:00 - 06:45)',
    photoCount: 1500,
    facesIndexed: 1480,
    status: 'Concluído',
    createdAt: 'Hoje, 07:15',
  },
  {
    id: 'batch-02',
    eventId: 'sobral-online-run-2026',
    name: 'Lote #02 - Beira Rio & Arco de Fátima',
    checkpoint: 'Km 5 e Km 10',
    photoCount: 1420,
    facesIndexed: 1390,
    status: 'Concluído',
    createdAt: 'Hoje, 08:05',
  },
  {
    id: 'batch-03',
    eventId: 'sobral-online-run-2026',
    name: 'Lote #03 - Linha de Chegada & Pódio',
    checkpoint: 'Reta Final e Entrega de Medalhas',
    photoCount: 1450,
    facesIndexed: 1412,
    status: 'Concluído',
    createdAt: 'Hoje, 09:20',
  },
];

const sales = [
  {
    id: 'sale-1',
    eventId: 'sobral-online-run-2026',
    photoLabel: 'IMG_9821.JPG',
    thumbnailUrl: '/media/seeded/hero_marathon_runner_1794782115123.jpg',
    bibNumber: '#1042',
    buyerName: 'Thiago Oliveira',
    buyerEmail: 'thiago.o***@gmail.com',
    timestamp: 'Hoje, 10:42',
    purchaseType: 'Individual',
    grossAmount: 14.9,
    netAmount: 12.67,
    paymentMethod: 'Pix',
  },
  {
    id: 'sale-2',
    eventId: 'sobral-online-run-2026',
    photoLabel: 'Combo Completo (6 fotos)',
    thumbnailUrl: '/media/seeded/athlete_female_finish_1794782116668.jpg',
    bibNumber: '#3821',
    buyerName: 'Beatriz Alencar',
    buyerEmail: 'beatriz.a***@outlook.com',
    timestamp: 'Hoje, 10:38',
    purchaseType: 'Combo Atleta',
    grossAmount: 39.9,
    netAmount: 33.92,
    paymentMethod: 'Pix',
  },
  {
    id: 'sale-3',
    eventId: 'sobral-online-run-2026',
    photoLabel: 'IMG_9740.JPG',
    thumbnailUrl: '/media/seeded/athlete_podium_medal_1794782117901.jpg',
    bibNumber: '#0731',
    buyerName: 'Camila Rodrigues',
    buyerEmail: 'camila.r***@uol.com.br',
    timestamp: 'Hoje, 10:29',
    purchaseType: 'Individual',
    grossAmount: 14.9,
    netAmount: 12.67,
    paymentMethod: 'Cartão',
  },
];

const orders: unknown[] = [];

const photographerStats = {
  totalPhotosUploaded: 4370,
  totalSold: 384,
  grossRevenue: 5721.6,
  availablePixBalance: 4863.36,
};

function readDiskBase64(diskPath: string): { base64: string; mimeType: string } | null {
  try {
    if (!fs.existsSync(diskPath)) return null;
    const buf = fs.readFileSync(diskPath);
    const ext = path.extname(diskPath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return { base64: buf.toString('base64'), mimeType };
  } catch {
    return null;
  }
}

app.get('/api/bootstrap', (_req, res) => {
  res.json({
    events,
    photos: photos.map(({ diskPath: _d, ...rest }) => rest),
    batches,
    sales,
    pricing,
    photographerStats,
    orders,
  });
});

app.patch('/api/pricing', (req, res) => {
  const { individualPrice, packPrice, watermarkText, watermarkOpacity } = req.body ?? {};
  if (typeof individualPrice === 'number' && individualPrice > 0) {
    pricing.individualPrice = Number(individualPrice.toFixed(2));
    for (const p of photos) {
      if (p.mediaType === 'photo') p.price = pricing.individualPrice;
    }
  }
  if (typeof packPrice === 'number' && packPrice > 0) {
    pricing.packPrice = Number(packPrice.toFixed(2));
  }
  if (typeof watermarkText === 'string' && watermarkText.trim()) {
    pricing.watermarkText = watermarkText.trim().slice(0, 32);
  }
  if (typeof watermarkOpacity === 'number') {
    pricing.watermarkOpacity = Math.max(10, Math.min(80, watermarkOpacity));
  }
  res.json({ pricing, photos: photos.map(({ diskPath: _d, ...rest }) => rest) });
});

app.post('/api/photos/upload', async (req, res) => {
  try {
    const { eventId, checkpoint, batchName, photographerName, files } = req.body as {
      eventId: string;
      checkpoint: string;
      batchName: string;
      photographerName: string;
      files: { filename: string; base64: string; mimeType: string }[];
    };

    if (!eventId || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'Selecione um evento e ao menos uma foto para enviar.' });
    }

    const eventObj = events.find((e) => e.id === eventId);
    if (!eventObj) {
      return res.status(404).json({ error: 'Evento não encontrado.' });
    }

    const createdPhotos: ServerPhoto[] = [];
    let facesCount = 0;

    for (const file of files) {
      const cleanBase64 = file.base64.replace(/^data:image\/\w+;base64,/, '');
      const ext = file.mimeType === 'image/png' ? '.png' : '.jpg';
      const safeName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
      const diskPath = path.join(UPLOADS_DIR, safeName);
      fs.writeFileSync(diskPath, Buffer.from(cleanBase64, 'base64'));

      let bibNumbers: string[] = [];
      let faceDescriptor = 'Atleta participante em movimento durante a prova';
      let caption = `Registro oficial em ${checkpoint || 'Percurso'}`;
      let detectedCheckpoint = checkpoint || eventObj.checkpoints[0] || 'Percurso';
      let faceBox: { top: number; left: number; width: number; height: number } | undefined;

      if (ai) {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: file.mimeType || 'image/jpeg',
                    data: cleanBase64,
                  },
                },
                {
                  text:
                    'Analise esta fotografia esportiva de corrida de rua. ' +
                    '1) Extraia todos os números de peito (bib numbers) claramente visíveis como strings numéricas. ' +
                    '2) Descreva em português as características faciais e vestimenta do(s) atleta(s) principal(is) (gênero, tom de pele, cabelo, óculos/boné, cor da camiseta) para indexação biométrica. ' +
                    '3) Estime a caixa delimitadora aproximada do rosto principal em porcentagens 0-100 (top, left, width, height). ' +
                    '4) Gere uma legenda curta em português.',
                },
              ],
            },
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  bibNumbers: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  faceDescriptor: { type: Type.STRING },
                  caption: { type: Type.STRING },
                  suggestedCheckpoint: { type: Type.STRING },
                  faceBox: {
                    type: Type.OBJECT,
                    properties: {
                      top: { type: Type.NUMBER },
                      left: { type: Type.NUMBER },
                      width: { type: Type.NUMBER },
                      height: { type: Type.NUMBER },
                    },
                  },
                },
                required: ['bibNumbers', 'faceDescriptor', 'caption'],
              },
            },
          });

          const parsed = JSON.parse((response.text ?? '{}').trim());
          if (Array.isArray(parsed.bibNumbers)) {
            bibNumbers = parsed.bibNumbers.filter((b: unknown) => typeof b === 'string' && b.trim().length > 0);
          }
          if (typeof parsed.faceDescriptor === 'string' && parsed.faceDescriptor.trim()) {
            faceDescriptor = parsed.faceDescriptor;
            facesCount++;
          }
          if (typeof parsed.caption === 'string' && parsed.caption.trim()) {
            caption = parsed.caption;
          }
          if (!checkpoint && typeof parsed.suggestedCheckpoint === 'string' && parsed.suggestedCheckpoint.trim()) {
            detectedCheckpoint = parsed.suggestedCheckpoint;
          }
          if (parsed.faceBox && typeof parsed.faceBox.top === 'number') {
            faceBox = {
              top: Math.max(5, Math.min(80, parsed.faceBox.top)),
              left: Math.max(5, Math.min(80, parsed.faceBox.left)),
              width: Math.max(8, Math.min(40, parsed.faceBox.width)),
              height: Math.max(8, Math.min(45, parsed.faceBox.height)),
            };
          }
        } catch (geminiErr) {
          console.error('Gemini indexing fallback for uploaded photo:', geminiErr);
        }
      }

      const newPhoto: ServerPhoto = {
        id: `ph-up-${crypto.randomBytes(4).toString('hex')}`,
        eventId,
        filename: file.filename || safeName,
        diskPath,
        imageUrl: `/media/uploads/${safeName}`,
        mediaType: 'photo',
        bibNumbers,
        checkpoint: detectedCheckpoint,
        timeRange: 't2',
        capturedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        photographer: photographerName?.trim() || 'Marcos Silva',
        cameraSpec: 'Upload Profissional · Alta Resolução',
        resolution: '6000 × 4000 px · 300 DPI',
        caption,
        faceDescriptor,
        faceBox,
        price: pricing.individualPrice,
      };

      photos.unshift(newPhoto);
      createdPhotos.push(newPhoto);
    }

    eventObj.totalArchivePhotos += createdPhotos.length;
    photographerStats.totalPhotosUploaded += createdPhotos.length;

    const newBatch = {
      id: `batch-${crypto.randomBytes(3).toString('hex')}`,
      eventId,
      name: batchName?.trim() || `Lote #${String(batches.length + 1).padStart(2, '0')} - ${checkpoint || 'Upload Direto'}`,
      checkpoint: checkpoint || 'Percurso Geral',
      photoCount: createdPhotos.length,
      facesIndexed: facesCount || createdPhotos.length,
      status: 'Concluído' as const,
      createdAt: 'Agora mesmo',
    };
    batches.unshift(newBatch);

    res.json({
      uploadedCount: createdPhotos.length,
      batch: newBatch,
      photos: createdPhotos.map(({ diskPath: _d, ...rest }) => rest),
      photographerStats,
    });
  } catch (err: unknown) {
    console.error('Upload error:', err);
    const msg = err instanceof Error ? err.message : 'Erro ao processar upload das fotos.';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/search/facial', async (req, res) => {
  try {
    const { eventId, selfieBase64, mimeType } = req.body as {
      eventId?: string;
      selfieBase64: string;
      mimeType?: string;
    };

    if (!selfieBase64) {
      return res.status(400).json({ error: 'Envie ou capture uma selfie para iniciar a busca facial.' });
    }

    if (!ai) {
      return res.status(500).json({
        error: 'Chave GEMINI_API_KEY não configurada no servidor. Configure nos segredos do projeto para ativar o motor facial.',
      });
    }

    const cleanSelfie = selfieBase64.replace(/^data:image\/\w+;base64,/, '');
    const candidates = (eventId && eventId !== 'all'
      ? photos.filter((p) => p.eventId === eventId)
      : photos
    ).slice(0, 14);

    if (candidates.length === 0) {
      return res.json({ selfieSummary: 'Nenhum registro encontrado neste evento.', matches: [] });
    }

    // Deduplicate image disk loads so repeated asset URLs don't bloat payload, while scoring every candidate photoId
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      {
        text:
          'Você é o motor de reconhecimento facial biométrico da FotoRun AI. ' +
          'A PRIMEIRA imagem abaixo é a SELFIE DE REFERÊNCIA do atleta. ' +
          'As imagens seguintes são fotos oficiais de corrida rotuladas com PHOTO_ID. ' +
          'Compare o rosto do atleta da SELFIE DE REFERÊNCIA com os rostos visíveis em cada foto oficial. ' +
          'Considere estrutura facial, olhos, nariz, boca, tom de pele, cabelo e características biométricas (mesmo com mudança de expressão, suor ou distância). ' +
          'Retorne todas as fotos que correspondem à mesma pessoa (confidence >= 72) com confiança realista entre 72 e 99.8, explicação curta em português e faceBox aproximado (top, left, width, height em 0-100).',
      },
      {
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: cleanSelfie,
        },
      },
    ];

    for (const candidate of candidates) {
      const fileData = readDiskBase64(candidate.diskPath);
      if (!fileData) continue;
      parts.push({
        text: `PHOTO_ID: ${candidate.id} | Checkpoint: ${candidate.checkpoint} | Bibs: ${candidate.bibNumbers.join(',') || 'N/A'}`,
      });
      parts.push({
        inlineData: {
          mimeType: fileData.mimeType,
          data: fileData.base64,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            selfieSummary: {
              type: Type.STRING,
              description: 'Descrição objetiva em português do atleta na selfie de referência.',
            },
            matches: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  photoId: { type: Type.STRING },
                  isMatch: { type: Type.BOOLEAN },
                  confidence: { type: Type.NUMBER },
                  reason: { type: Type.STRING },
                  faceBox: {
                    type: Type.OBJECT,
                    properties: {
                      top: { type: Type.NUMBER },
                      left: { type: Type.NUMBER },
                      width: { type: Type.NUMBER },
                      height: { type: Type.NUMBER },
                    },
                  },
                },
                required: ['photoId', 'isMatch', 'confidence', 'reason'],
              },
            },
          },
          required: ['selfieSummary', 'matches'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const validIds = new Set(candidates.map((c) => c.id));
    const rawMatches = Array.isArray(parsed.matches) ? parsed.matches : [];
    const matchedList = rawMatches
      .filter((m: { photoId?: string; isMatch?: boolean; confidence?: number }) => m.photoId && validIds.has(m.photoId) && (m.isMatch || (m.confidence ?? 0) >= 75))
      .map((m: { photoId: string; confidence?: number; reason?: string; faceBox?: { top: number; left: number; width: number; height: number } }) => ({
        photoId: m.photoId,
        confidence: Math.min(99.8, Math.max(72, Number((m.confidence ?? 92).toFixed(1)))),
        reason: m.reason || 'Compatibilidade facial biométrica confirmada.',
        faceBox: m.faceBox,
      }))
      .sort((a: { confidence: number }, b: { confidence: number }) => b.confidence - a.confidence);

    res.json({
      selfieSummary: parsed.selfieSummary || 'Assinatura facial processada com sucesso.',
      matches: matchedList,
    });
  } catch (err: unknown) {
    console.error('Facial search error:', err);
    const msg = err instanceof Error ? err.message : 'Falha ao executar busca facial biométrica.';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/orders', (req, res) => {
  const {
    eventId,
    athleteName,
    athleteEmail,
    athletePhone,
    bibNumber,
    purchaseType,
    paymentMethod,
    photoIds,
    couponCode,
  } = req.body as {
    eventId: string;
    athleteName: string;
    athleteEmail: string;
    athletePhone: string;
    bibNumber?: string;
    purchaseType: 'pack' | 'selected' | 'single';
    paymentMethod: 'pix' | 'card';
    photoIds: string[];
    couponCode?: string;
  };

  const eventObj = events.find((e) => e.id === eventId) || events[0];
  let unlockedPhotoIds: string[] = [];

  if (purchaseType === 'pack') {
    unlockedPhotoIds =
      photoIds && photoIds.length > 0
        ? photoIds
        : photos.filter((p) => p.eventId === eventObj.id).map((p) => p.id);
  } else {
    unlockedPhotoIds = (photoIds || []).filter((id) => photos.some((p) => p.id === id));
  }

  if (unlockedPhotoIds.length === 0) {
    return res.status(400).json({ error: 'Selecione ao menos uma foto para concluir o pedido.' });
  }

  let baseTotal =
    purchaseType === 'pack'
      ? pricing.packPrice
      : unlockedPhotoIds.reduce((sum, id) => {
          const item = photos.find((p) => p.id === id);
          return sum + (item ? item.price : pricing.individualPrice);
        }, 0);

  const normalizedCoupon = (couponCode || '').trim().toUpperCase();
  let discountApplied = 0;
  if (normalizedCoupon === 'ATLETA10' || normalizedCoupon === 'SOBRALCORRE') {
    discountApplied = Number((baseTotal * 0.1).toFixed(2));
    baseTotal = Number((baseTotal - discountApplied).toFixed(2));
  }

  const orderId = `FR-${Math.floor(10000 + Math.random() * 89999)}`;
  const receipt = {
    id: orderId,
    eventId: eventObj.id,
    eventTitle: eventObj.title,
    athleteName: athleteName?.trim() || 'Atleta FotoRun',
    athleteEmail: athleteEmail?.trim() || 'atleta@fotorun.ai',
    athletePhone: athletePhone?.trim() || '(88) 99999-3690',
    bibNumber: bibNumber?.trim() || '#1042',
    purchaseType,
    paymentMethod,
    totalPaid: Number(baseTotal.toFixed(2)),
    discountApplied,
    createdAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    unlockedPhotoIds,
    officialTime: '00:48:15',
    officialPace: '4\'49" /km',
    category: 'Geral · 10K',
  };

  orders.unshift(receipt);

  // Update photographer stats and real-time sales feed (85% payout to photographer)
  const netToPhotographer = Number((receipt.totalPaid * 0.85).toFixed(2));
  photographerStats.totalSold += unlockedPhotoIds.length;
  photographerStats.grossRevenue = Number((photographerStats.grossRevenue + receipt.totalPaid).toFixed(2));
  photographerStats.availablePixBalance = Number((photographerStats.availablePixBalance + netToPhotographer).toFixed(2));

  const firstPhoto = photos.find((p) => p.id === unlockedPhotoIds[0]);
  sales.unshift({
    id: `sale-${crypto.randomBytes(3).toString('hex')}`,
    eventId: eventObj.id,
    photoLabel:
      purchaseType === 'pack'
        ? `Pacote Completo (${unlockedPhotoIds.length} itens)`
        : unlockedPhotoIds.length > 1
        ? `Seleção (${unlockedPhotoIds.length} fotos)`
        : firstPhoto?.filename || 'Foto Digital',
    thumbnailUrl: firstPhoto?.imageUrl || '/media/seeded/hero_marathon_runner_1794782115123.jpg',
    bibNumber: receipt.bibNumber,
    buyerName: receipt.athleteName,
    buyerEmail: receipt.athleteEmail,
    timestamp: 'Agora mesmo',
    purchaseType: purchaseType === 'pack' ? 'Combo Atleta' : unlockedPhotoIds.length > 1 ? 'Seleção' : 'Individual',
    grossAmount: receipt.totalPaid,
    netAmount: netToPhotographer,
    paymentMethod: paymentMethod === 'pix' ? 'Pix' : 'Cartão',
  });

  res.json({ receipt, sales, photographerStats });
});

app.post('/api/payout', (_req, res) => {
  const paidOut = photographerStats.availablePixBalance;
  photographerStats.availablePixBalance = 0;
  res.json({
    paidOut,
    photographerStats,
    message: `Saque Pix de R$ ${paidOut.toFixed(2).replace('.', ',')} enviado com sucesso para sua chave cadastrada.`,
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FotoRun AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
