import React, { useState } from 'react';
import { X, Camera, User, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { AuthUser, UserRole } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  initialRole?: UserRole;
  onClose: () => void;
  onAuthenticated: (user: AuthUser) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialRole = 'athlete',
  onClose,
  onAuthenticated,
}) => {
  const [role, setRole] = useState<UserRole>(initialRole);
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bibOrPix, setBibOrPix] = useState('');
  const [consent, setConsent] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg('Informe seu e-mail para continuar.');
      return;
    }
    if (mode === 'register' && !consent) {
      setErrorMsg('Confirme os termos e a política de privacidade LGPD.');
      return;
    }

    onAuthenticated({
      name: name.trim() || (role === 'photographer' ? 'Marcos Silva' : 'Carlos Silva'),
      email: email.trim(),
      phone: phone.trim() || '(88) 99999-3690',
      role,
      bibNumber: role === 'athlete' ? bibOrPix.trim() || '#1042' : undefined,
      pixKey: role === 'photographer' ? bibOrPix.trim() || email.trim() : undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 my-auto">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-[#0F172A]">Acesse a FotoRun AI</h2>
            <p className="text-xs text-slate-500">Atletas e fotógrafos esportivos credenciados</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de acesso"
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Role Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setRole('athlete')}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                role === 'athlete' ? 'bg-white text-[#D04400] shadow-sm' : 'text-slate-600'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Sou Atleta</span>
            </button>
            <button
              type="button"
              onClick={() => setRole('photographer')}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                role === 'photographer' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-slate-600'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Sou Fotógrafo</span>
            </button>
          </div>

          {/* Login / Register Toggle */}
          <div className="flex border-b border-slate-200 text-sm font-semibold">
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`pb-2 px-4 border-b-2 transition-colors ${
                mode === 'register'
                  ? 'border-[#D04400] text-[#D04400]'
                  : 'border-transparent text-slate-500'
              }`}
            >
              Cadastro Rápido
            </button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`pb-2 px-4 border-b-2 transition-colors ${
                mode === 'login'
                  ? 'border-[#D04400] text-[#D04400]'
                  : 'border-transparent text-slate-500'
              }`}
            >
              Já tenho conta
            </button>
          </div>

          <div className="space-y-3">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {role === 'photographer' ? 'Nome Profissional ou Estúdio' : 'Nome Completo'}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={role === 'photographer' ? 'Ex: Marcos Silva Fotografia' : 'Ex: Mariana Vasconcelos'}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#D04400]"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com.br"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#D04400]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(88) 99876-5432"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#D04400]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {role === 'photographer'
                  ? 'Chave Pix (para receber 85% por venda)'
                  : 'Número de Peito Habitual (opcional)'}
              </label>
              <input
                type="text"
                value={bibOrPix}
                onChange={(e) => setBibOrPix(e.target.value)}
                placeholder={role === 'photographer' ? 'CPF, E-mail ou Telefone' : 'Ex: 1042'}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm font-mono-num focus:outline-none focus:border-[#D04400]"
              />
            </div>

            {role === 'photographer' && mode === 'register' && (
              <div className="p-3.5 rounded-lg bg-[#0F172A] text-white text-xs space-y-1">
                <p className="font-bold text-[#38BDF8] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Repasse de 85% por foto vendida
                </p>
                <p className="text-slate-300">
                  Indexação facial automática e saque imediato via Pix sem taxa de adesão.
                </p>
              </div>
            )}

            {mode === 'register' && (
              <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 rounded text-[#D04400] focus:ring-[#D04400]"
                />
                <span>
                  Concordo com os Termos de Uso e Política de Proteção Biométrica (LGPD).
                </span>
              </label>
            )}
          </div>

          {errorMsg && <p className="text-xs font-semibold text-red-600">{errorMsg}</p>}

          <button
            type="submit"
            className="w-full py-3 px-4 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-sm font-bold transition-colors"
          >
            {role === 'photographer'
              ? 'Acessar Painel do Fotógrafo'
              : mode === 'register'
              ? 'Criar Conta e Buscar Fotos'
              : 'Entrar na Plataforma'}
          </button>

          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
            <span>Dados protegidos em conformidade com a LGPD</span>
          </p>
        </form>
      </div>
    </div>
  );
};
