/**
 * Baixa os modelos de reconhecimento facial (OpenCV Zoo, licença Apache-2.0) para a pasta /models.
 * Uso: npm run models:download
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BASE = 'https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models';
const MODELS = [
  {
    file: 'face_detection_yunet_2023mar.onnx',
    url: `${BASE}/face_detection_yunet/face_detection_yunet_2023mar.onnx`,
    sha256: '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
  },
  {
    file: 'face_recognition_sface_2021dec.onnx',
    url: `${BASE}/face_recognition_sface/face_recognition_sface_2021dec.onnx`,
    sha256: '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79',
  },
];

const dir = path.resolve(process.cwd(), 'models');
fs.mkdirSync(dir, { recursive: true });

const sha = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');

for (const m of MODELS) {
  const target = path.join(dir, m.file);
  if (fs.existsSync(target) && sha(fs.readFileSync(target)) === m.sha256) {
    console.log(`✅ ${m.file} já está baixado.`);
    continue;
  }
  process.stdout.write(`⬇️  Baixando ${m.file}... `);
  const res = await fetch(m.url);
  if (!res.ok) throw new Error(`Falha ao baixar ${m.file}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha(buf) !== m.sha256) throw new Error(`Arquivo ${m.file} veio corrompido (checksum diferente). Tente de novo.`);
  fs.writeFileSync(target, buf);
  console.log(`ok (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
}
console.log('Modelos prontos em', dir);
