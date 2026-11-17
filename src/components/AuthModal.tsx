import React, { useState } from 'react';
import { X, Camera, User, ShieldCheck, CheckCircle2, Loader2, MailCheck } from 'lucide-react';
import { UserRole } from '../types';
import { supabase } from '../lib/supabase';

interface AuthModalProps {
  isOpen: boolean;
  initialRole?: UserRole;
  onClose: () => void;
  /** Chamado após login bem-sucedido; o App carrega o perfil pelo servidor. */
  onAuthenticated: () => void;
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
  const [password, setPassword] = useState('');
  // LGPD: o aceite precisa ser uma ação do usuário, por isso começa desmarcado
  const [consent, setConsent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  if (!isOpen) return null;

  const translateError = (message: string) => {
    if (/invalid login credentials/i.test(message)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(message)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
    if (/already registered|already been registered/i.test(message)) return 'Este e-mail já tem conta. Use “Já tenho conta”.';
    if (/password/i.test(message)) return 'A senha precisa ter pelo menos 8 caracteres.';
    return message;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email.trim() || !password) {
      setErrorMsg('Informe e-mail e senha para continuar.');
      return;
    }
    if (mode === 'register') {
      if (!name.trim()) {
        setErrorMsg('Informe seu nome.');
        return;
      }
      if (password.length < 8) {
        setErrorMsg('A senha precisa ter pelo menos 8 caracteres.');
        return;
      }
      if (role === 'photographer' && !bibOrPix.trim()) {
        setErrorMsg('Informe sua chave Pix para receber os repasses.');
        return;
      }
      if (!consent) {
        setErrorMsg('Para criar a conta, aceite os Termos de Uso e a Política de Proteção Biométrica (LGPD).');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              role,
              full_name: name.trim(),
              phone: phone.trim(),
              bib_number: role === 'athlete' ? bibOrPix.trim() : '',
              pix_key: role === 'photographer' ? bibOrPix.trim() : '',
              terms_accepted: true,
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          // Confirmação de e-mail ativada no Supabase: o usuário precisa clicar no link
          setAwaitingConfirmation(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
      onAuthenticated();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(translateError(err instanceof Error ? err.message : 'Não foi possível entrar.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setErrorMsg('Digite seu e-mail acima para receber o link de nova senha.');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setErrorMsg(error ? translateError(error.message) : 'Enviamos um link para redefinir sua senha.');
  };

  if (awaitingConfirmation) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0F172A]/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-8 text-center space-y-4 shadow-2xl">
          <MailCheck className="w-12 h-12 text-[#10B981] mx-auto" />
          <h2 className="text-lg font-extrabold text-[#0F172A]">Confirme seu e-mail</h2>
          <p className="text-sm text-slate-600">
            Enviamos um link de confirmação para <strong>{email.trim()}</strong>. Abra o e-mail, clique no link e depois
            entre com sua senha.
          </p>
          <button
            type="button"
            onClick={() => {
              setAwaitingConfirmation(false);
              setMode('login');
            }}
            className="w-full py-3 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-sm font-bold"
          >
            Já confirmei, quero entrar
          </button>
        </div>
      </div>
    );
  }

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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Senha *</label>
              <input
                type="password"
                required
                minLength={mode === 'register' ? 8 : undefined}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Mínimo de 8 caracteres' : 'Sua senha'}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#D04400]"
              />
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="mt-1 text-[11px] font-semibold text-[#D04400] hover:underline"
                >
                  Esqueci minha senha
                </button>
              )}
            </div>

            {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {role === 'photographer'
                  ? 'Chave Pix * (para receber 85% por venda)'
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
            )}

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
            disabled={submitting}
            className="w-full py-3 px-4 rounded-lg bg-[#D04400] hover:bg-[#A63500] disabled:opacity-60 text-white text-sm font-bold transition-colors inline-flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'login'
              ? 'Entrar'
              : role === 'photographer'
              ? 'Criar Conta de Fotógrafo'
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
