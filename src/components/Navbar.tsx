import React, { useState } from 'react';
import { Camera, ShoppingBag, Menu, X, User } from 'lucide-react';
import { ActiveView, AuthUser } from '../types';

interface NavbarProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  cartCount: number;
  onOpenCart: () => void;
  currentUser: AuthUser | null;
  onOpenAuth: () => void;
  hasOrders: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeView,
  onNavigate,
  cartCount,
  onOpenCart,
  currentUser,
  onOpenAuth,
  hasOrders,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: { id: ActiveView; label: string }[] = [
    { id: 'home', label: 'Início' },
    { id: 'events', label: 'Eventos' },
    { id: 'event', label: 'Busca Facial' },
    { id: 'photographer', label: 'Painel Fotógrafo' },
    { id: 'downloads', label: hasOrders ? 'Minhas Fotos' : 'Downloads' },
  ];

  const handleNav = (id: ActiveView) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-16 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleNav('home')}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D04400] rounded-lg"
        >
          <span className="w-9 h-9 rounded-lg bg-[#0F172A] flex items-center justify-center text-white">
            <Camera className="w-5 h-5 text-[#38BDF8]" />
          </span>
          <span className="text-xl font-extrabold tracking-tight text-[#0F172A] font-display">
            FotoRun <span className="text-[#D04400]">AI</span>
          </span>
        </button>

        {/* Zone 2: Concise Single-Line Navigation Links */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Navegação principal">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`text-sm font-semibold whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D04400] ${
                  isActive
                    ? 'text-[#D04400] border-[#D04400]'
                    : 'text-slate-600 border-transparent hover:text-[#0F172A]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Action Cluster */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenCart}
            aria-label="Abrir carrinho"
            className="relative p-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D04400]"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#D04400] text-white text-[11px] font-bold font-mono-num flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenAuth}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white text-sm font-semibold whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D04400]"
          >
            <User className="w-4 h-4 text-[#38BDF8]" />
            <span>{currentUser ? currentUser.name.split(' ')[0] : 'Entrar'}</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="Menu"
            className="md:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNav(item.id)}
              className={`block w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold ${
                activeView === item.id
                  ? 'bg-orange-50 text-[#D04400]'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
};
