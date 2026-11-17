/**
 * Diagnóstico da chave e dos modelos do Gemini.
 * Uso: npm run check:gemini
 * Testa vários modelos ao mesmo tempo e indica qual usar no GEMINI_MODEL.
 */
import 'dotenv/config';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const key = process.env.GEMINI_API_KEY || '';
const configured = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const CANDIDATES = Array.from(
  new Set([configured, 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'])
);
const TIMEOUT_MS = 45_000;

type Result = { model: string; apiVersion: string; ok: boolean; seconds: number; detail: string };

async function testModel(model: string, apiVersion?: string): Promise<Result> {
  const ai = new GoogleGenAI({ apiKey: key, ...(apiVersion ? { apiVersion } : {}) });
  const t0 = Date.now();
  try {
    const r = await ai.models.generateContent({
      model,
      contents: 'Responda apenas: OK',
      config: {
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
      },
    });
    return { model, apiVersion: apiVersion || 'padrão', ok: true, seconds: (Date.now() - t0) / 1000, detail: String(r.text).trim().slice(0, 40) };
  } catch (err) {
    const msg = String((err as Error).message || err);
    return { model, apiVersion: apiVersion || 'padrão', ok: false, seconds: (Date.now() - t0) / 1000, detail: msg.slice(0, 160) };
  }
}

async function main() {
  if (!key || key.startsWith('MY_')) {
    console.log('❌ GEMINI_API_KEY não está preenchida no .env');
    process.exit(1);
  }
  console.log(`Chave: começa com "${key.slice(0, 3)}", ${key.length} caracteres`);
  console.log(`Modelo configurado: ${configured}\n`);

  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const pager = await ai.models.list({ config: { pageSize: 100 } });
    let count = 0;
    for await (const _m of pager) count++;
    console.log(`✅ Chave aceita (${count} modelos visíveis).\n`);
  } catch (err) {
    console.log('❌ A chave foi RECUSADA ao listar modelos:');
    console.log('   ' + String((err as Error).message || err).slice(0, 500));
    process.exit(1);
  }

  console.log(`Testando ${CANDIDATES.length} modelos ao mesmo tempo (até ${TIMEOUT_MS / 1000}s)...\n`);
  const results = await Promise.all([
    ...CANDIDATES.map((m) => testModel(m)),
    testModel(configured, 'v1beta'),
  ]);

  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    console.log(`${icon} ${r.model.padEnd(24)} [API ${r.apiVersion.padEnd(6)}] ${r.seconds.toFixed(1).padStart(5)}s  ${r.detail}`);
  }

  const best = results.filter((r) => r.ok && r.apiVersion === 'padrão').sort((a, b) => a.seconds - b.seconds)[0];
  if (best) {
    console.log(`\n👉 Recomendado: coloque no .env a linha  GEMINI_MODEL="${best.model}"`);
  } else {
    console.log('\n❌ Nenhum modelo respondeu. Mande este resultado para análise.');
  }
}

main();
