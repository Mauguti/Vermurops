import React, { useState } from 'react';
import { Globe, ArrowRight, Shield, ShieldAlert } from 'lucide-react';
import Soluciones from './Soluciones';

interface LandingPageProps {
  onShowLogin: () => void;
}

export default function LandingPage({ onShowLogin }: LandingPageProps) {
  const [showCookies, setShowCookies] = useState(true);

  return (
    <div className="min-h-screen bg-white text-gray-800 font-sans flex flex-col selection:bg-vermur-accent selection:text-white">
      
      {/* Navbar */}
      <nav 
        className="w-full bg-white/95 backdrop-blur-md border-b border-gray-100 px-6 md:px-12 py-4 flex items-center justify-between sticky top-0 z-50 transition-all duration-300"
        role="navigation"
        aria-label="Navegación principal"
      >
        {/* Logo */}
        <div className="flex items-center space-x-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div className="flex items-center py-1.5 px-3 rounded-lg border border-gray-150 shadow-sm bg-white">
            <img 
              src="https://firebasestorage.googleapis.com/v0/b/digsol-academy.firebasestorage.app/o/LOGOTIPO%20(1).png?alt=media&token=702db209-5869-4471-acb6-ac7740e5453b" 
              alt="Vermur Logo" 
              className="h-8 object-contain" 
            />
          </div>
        </div>

        {/* Center Links (MAYÚSCULAS with letter-spacing) */}
        <div className="hidden lg:flex items-center space-x-8">
          {['Inicio', 'Soluciones', 'Nosotros', 'Contacto'].map((link) => (
            <a
              key={link}
              href={link === 'Soluciones' ? '#soluciones' : '#'}
              className="text-xs font-bold uppercase tracking-[0.15em] text-gray-600 hover:text-vermur-accent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermur-primary focus-visible:ring-offset-2 rounded px-2 py-1"
            >
              {link}
            </a>
          ))}
        </div>

        {/* Right side buttons & Lang */}
        <div className="flex items-center space-x-4">
          {/* Language Selector */}
          <div className="flex items-center space-x-1 text-gray-600 cursor-pointer hover:text-vermur-primary transition-colors text-sm font-semibold pr-2 border-r border-gray-200">
            <Globe className="w-4 h-4" />
            <span className="tracking-wide">ES</span>
          </div>

          {/* Buttons */}
          <button
            onClick={onShowLogin}
            className="hidden sm:inline-flex px-4 py-2 border border-vermur-navy/30 text-vermur-navy hover:bg-vermur-navy hover:text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermur-primary"
          >
            Live Track
          </button>
          
          <button
            onClick={onShowLogin}
            className="px-5 py-2.5 bg-vermur-accent hover:bg-[#c1321d] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 shadow-sm hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermur-accent"
          >
            Iniciar sesión
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header 
        className="relative w-full min-h-[85vh] flex items-center justify-start px-6 md:px-12 py-20 overflow-hidden bg-vermur-navy"
        aria-label="Presentación"
      >
        {/* Background Image full-bleed */}
        <div className="absolute inset-0 z-0">
          <img 
            src="/assets/vermur_hero.png" 
            alt="Puerto de carga marítimo" 
            className="w-full h-full object-cover object-center opacity-85"
          />
          {/* Indigo-Violet gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#4B2A8C]/90 via-[#4B2A8C]/75 to-transparent mix-blend-multiply"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-vermur-navy via-transparent to-transparent opacity-80"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-[800px] text-white">
          {/* Brand Voice / Tagline */}
          <span className="inline-block px-3 py-1 bg-white/10 text-white rounded-full text-xs font-bold uppercase tracking-[0.15em] mb-6 border border-white/10">
            Freight Forwarding & Logística
          </span>

          {/* Title in condensed display uppercase, accent word in serif italic */}
          <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] uppercase mb-6 drop-shadow-sm">
            Logística que conecta tu negocio con el <span className="font-serif italic text-vermur-accent font-normal lowercase tracking-normal text-[1.1em]">mundo</span>.
          </h1>

          {/* Subtitle */}
          <p className="text-base md:text-xl text-gray-200 font-sans font-medium max-w-[600px] mb-10 leading-relaxed">
            "Cada envío tiene su propia historia." Diseñamos la ruta perfecta para la tuya, con el control digital absoluto que tu empresa necesita.
          </p>

          {/* Buttons */}
          <div className="flex flex-wrap gap-4">
            <button
              onClick={onShowLogin}
              className="px-8 py-4 bg-vermur-accent hover:bg-[#c1321d] text-white text-sm font-bold uppercase tracking-wider rounded-lg transition-all duration-350 shadow-md hover:shadow-xl hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermur-accent"
            >
              Solicitar cotización
            </button>
            <button
              onClick={onShowLogin}
              className="px-8 py-4 border-2 border-white/80 hover:border-white text-white hover:bg-white/10 text-sm font-bold uppercase tracking-wider rounded-lg transition-all duration-350 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Monitorear Carga
            </button>
          </div>
        </div>
      </header>

      {/* Soluciones Section */}
      <main id="soluciones">
        <Soluciones />
      </main>

      {/* Footer (Casi-negro #1A1A2E) */}
      <footer className="bg-vermur-navy text-white py-16 px-6 md:px-12 mt-auto border-t border-white/5">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          
          {/* Col 1: Brand */}
          <div className="md:col-span-2 space-y-6">
            <div className="inline-flex items-center py-2 px-4 rounded-lg bg-white w-fit">
              <img 
                src="https://firebasestorage.googleapis.com/v0/b/digsol-academy.firebasestorage.app/o/LOGOTIPO%20(1).png?alt=media&token=702db209-5869-4471-acb6-ac7740e5453b" 
                alt="Vermur Logo" 
                className="h-7 object-contain" 
              />
            </div>
            <p className="text-gray-400 font-sans text-sm max-w-[360px] leading-relaxed">
              "Cada envío tiene su propia historia." Conectamos a importadores y exportadores mexicanos con proveedores logísticos de clase mundial.
            </p>
          </div>

          {/* Col 2: Servicios */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-vermur-accent mb-4">Servicios</h4>
            <ul className="space-y-2.5 text-sm text-gray-400">
              <li><a href="#soluciones" className="hover:text-white transition-colors">Carga Aérea</a></li>
              <li><a href="#soluciones" className="hover:text-white transition-colors">Carga Marítima</a></li>
              <li><a href="#soluciones" className="hover:text-white transition-colors">Transporte Terrestre</a></li>
              <li><a href="#soluciones" className="hover:text-white transition-colors">Almacenaje WMS</a></li>
            </ul>
          </div>

          {/* Col 3: Portal */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-vermur-accent mb-4">Acceso</h4>
            <ul className="space-y-2.5 text-sm text-gray-400">
              <li>
                <button onClick={onShowLogin} className="hover:text-white transition-colors text-left focus:outline-none">
                  VermurOps Portal
                </button>
              </li>
              <li>
                <button onClick={onShowLogin} className="hover:text-white transition-colors text-left focus:outline-none">
                  Live Track
                </button>
              </li>
              <li>
                <button onClick={onShowLogin} className="hover:text-white transition-colors text-left focus:outline-none">
                  Área de Clientes
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer bottom */}
        <div className="max-w-[1200px] mx-auto pt-8 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center text-xs text-gray-400 gap-4">
          <p>© 2026 Vermur Logistics México. Todos los derechos reservados.</p>
          <div className="flex space-x-6">
            <a href="#" className="hover:text-white transition-colors">Aviso de Privacidad</a>
            <a href="#" className="hover:text-white transition-colors">Términos y Condiciones</a>
          </div>
        </div>
      </footer>

      {/* Cookie Consent Banner */}
      {showCookies && (
        <div 
          className="fixed bottom-0 inset-x-0 bg-vermur-navy text-white border-t border-white/10 px-6 py-5 z-[60] flex flex-col md:flex-row items-center justify-between gap-4 shadow-[0_-8px_30px_rgb(0,0,0,0.12)] animate-in fade-in slide-in-from-bottom duration-500"
          role="dialog"
          aria-live="polite"
          aria-label="Consentimiento de cookies"
        >
          <div className="flex items-center space-x-3 max-w-[800px]">
            <Shield className="w-5 h-5 text-vermur-accent shrink-0" />
            <p className="text-xs md:text-sm text-gray-300 leading-relaxed font-sans">
              Utilizamos cookies para optimizar tu experiencia y analizar el tráfico de nuestro portal logístico. Al continuar navegando, aceptas nuestra política de cookies.
            </p>
          </div>
          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={() => setShowCookies(false)}
              className="px-5 py-2 bg-vermur-primary hover:bg-[#5b36a1] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors duration-250 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermur-primary"
            >
              Aceptar cookies
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
