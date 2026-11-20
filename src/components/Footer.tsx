import React from 'react';
import { Camera } from 'lucide-react';
import { ActiveView } from '../types';

interface FooterProps {
  onNavigate: (view: ActiveView) => void;
  onOpenAuth: (role?: 'athlete' | 'photographer') => void;
  onOpenPrivacy: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenAuth, onOpenPrivacy }) => {
  return (
    <footer className="bg-[#0F172A] text-slate-300 border-t border-slate-800 mt-auto">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-16 py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-8 border-b border-slate-800">
          <div className="md:col-span-5 space-y-3">
            <div className="flex items-center gap-2.5 text-white font-display font-bold text-lg">
              <span className="w-8 h-8 rounded-lg bg-[#D04400] flex items-center justify-center">
                <Camera className="w-4 h-4 text-white" />
              </span>
              <span>FotoRun AI</span>
            </div>
            <p className="text-sm text-slate-400 max-w-md leading-relaxed">
              Tecnologia de reconhecimento facial biométrico e indexação esportiva para conectar atletas aos registros oficiais de suas provas com segurança e entrega imediata.
            </p>
            <p className="text-xs text-slate-400">
              Conformidade LGPD · Criptografia Biométrica · Liberação Instantânea via Pix
            </p>
          </div>

          <div className="md:col-span-3 space-y-2.5">
            <h4 className="text-sm font-semibold text-white">Plataforma</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <button type="button" onClick={() => onNavigate('events')} className="hover:text-white transition-colors">
                  Eventos Cobertos
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('event')} className="hover:text-white transition-colors">
                  Busca Facial por Selfie
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('photographer')} className="hover:text-white transition-colors">
                  Painel do Fotógrafo
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('taxas')} className="hover:text-white transition-colors">
                  Taxas e serviços
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onOpenAuth('photographer')} className="hover:text-[#38BDF8] text-slate-300 transition-colors">
                  Seja um Fotógrafo Parceiro
                </button>
              </li>
            </ul>
          </div>

          <div className="md:col-span-4 space-y-2.5">
            <h4 className="text-sm font-semibold text-white">Privacidade e Atendimento</h4>
            <p className="text-sm text-slate-400 leading-relaxed">
              Sua selfie é usada só para encontrar suas fotos e não é guardada. Fotos não vendidas são apagadas 12 meses após o evento, e você pode pedir a retirada das suas fotos a qualquer momento.
            </p>
            <div className="pt-1 flex flex-wrap gap-4 text-xs text-slate-400">
              <span>Termos de Uso</span>
              <span>·</span>
              <button type="button" onClick={onOpenPrivacy} className="underline hover:text-white">
                Remover minhas fotos (LGPD)
              </button>
              <span>·</span>
              <span>Suporte ao Atleta</span>
            </div>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>© 2026 FotoRun AI Sports Tech. Todos os direitos reservados.</p>
          <p>Brasil · Cobertura Nacional de Corridas de Rua</p>
        </div>
      </div>
    </footer>
  );
};
