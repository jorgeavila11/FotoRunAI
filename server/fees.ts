/**
 * Taxas da plataforma — fonte única de verdade.
 * O servidor usa estes valores para calcular os repasses e a página
 * "Taxas e serviços" mostra exatamente os mesmos números.
 *
 * Para mudar a taxa, defina PLATFORM_FEE_PERCENT no Render (ex.: 12).
 * Vendas antigas não mudam: o valor do fotógrafo fica gravado em cada venda.
 */
import { DOWNLOAD_RETENTION_MONTHS } from './retention';

function readPercent(name: string, fallback: number) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 && n <= 50 ? n : fallback;
}

export const PLATFORM_FEE_PERCENT = readPercent('PLATFORM_FEE_PERCENT', 15);
export const PHOTOGRAPHER_SHARE = Math.round((100 - PLATFORM_FEE_PERCENT) * 100) / 10000;
/**
 * Bônus opcional: taxa menor nas vendas que o próprio fotógrafo trouxe pelo
 * link de divulgação. Defina REFERRAL_FEE_PERCENT no Render (ex.: 10).
 * Vazio = desligado (todas as vendas pagam a taxa normal).
 */
export const REFERRAL_FEE_PERCENT: number | null = (() => {
  const raw = process.env.REFERRAL_FEE_PERCENT;
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n < PLATFORM_FEE_PERCENT ? n : null;
})();
/** Fração que o fotógrafo recebe numa venda que ele mesmo indicou */
export const REFERRAL_SHARE = REFERRAL_FEE_PERCENT === null ? null : Math.round((100 - REFERRAL_FEE_PERCENT) * 100) / 10000;

/** Prazo, em dias úteis, para o saque pedido cair na conta */
export const PAYOUT_BUSINESS_DAYS = Math.max(1, Math.floor(Number(process.env.PAYOUT_BUSINESS_DAYS) || 2));
/** Valor mínimo para pedir saque (R$) */
export const MIN_PAYOUT = Math.max(0, Number(process.env.MIN_PAYOUT) || 0);

export function feesInfo() {
  const share = Math.round((100 - PLATFORM_FEE_PERCENT) * 100) / 100;
  return {
    platformFeePercent: PLATFORM_FEE_PERCENT,
    photographerSharePercent: share,
    payoutBusinessDays: PAYOUT_BUSINESS_DAYS,
    minPayout: MIN_PAYOUT,
    downloadMonths: DOWNLOAD_RETENTION_MONTHS,
    referralFeePercent: REFERRAL_FEE_PERCENT,
    items: [
      { service: 'Taxa sobre cada foto ou pacote vendido', value: `${PLATFORM_FEE_PERCENT}%`, detail: `Você fica com ${share}% do valor pago pelo atleta.` },
      ...(REFERRAL_FEE_PERCENT !== null
        ? [
            {
              service: 'Venda que você trouxe pelo seu link de divulgação',
              value: `${REFERRAL_FEE_PERCENT}%`,
              detail: `Bônus: nas suas fotos vendidas por quem chegou pelo seu link, você fica com ${Math.round((100 - REFERRAL_FEE_PERCENT) * 100) / 100}%.`,
            },
          ]
        : []),
      { service: 'Taxa do Pix e do cartão (meio de pagamento)', value: 'Inclusa', detail: 'Já está dentro da taxa acima. Nada é descontado à parte.' },
      { service: 'Mensalidade, armazenamento e reconhecimento facial', value: 'R$ 0,00', detail: 'Sem plano, sem fidelidade. Você só paga quando vende.' },
      { service: 'Saque para sua chave Pix', value: 'R$ 0,00', detail: `Cai em até ${PAYOUT_BUSINESS_DAYS} dia(s) útil(eis) após o pedido.` },
      { service: 'Cadastro e análise da conta de recebimento', value: 'R$ 0,00', detail: 'Feita uma vez, e de novo só se você trocar os dados.' },
    ],
    rules: [
      'Cupom de desconto: a taxa é calculada sobre o valor que o atleta realmente pagou, já com o desconto.',
      'Pacote do evento: o valor do pacote é dividido entre as fotos compradas, e cada fotógrafo recebe pela parte dele.',
      'Link de divulgação: o atleta que chega pelo seu link continua vendo todas as fotos do evento; a venda fica registrada como trazida por você por 30 dias.',
      `O atleta pode baixar as fotos compradas por ${DOWNLOAD_RETENTION_MONTHS} meses.`,
      'O saque vai sempre para uma chave Pix no seu nome (mesmo CPF ou CNPJ do cadastro).',
    ],
  };
}
