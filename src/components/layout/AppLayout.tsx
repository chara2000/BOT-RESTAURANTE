'use client';

import { Sidebar } from './Sidebar';
import { MobileMenuProvider, useMobileMenu } from '@/context/MobileMenuContext';

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { isOpen, setIsOpen } = useMobileMenu();

  return (
    <div className="flex h-screen w-full overflow-hidden relative"
         style={{ background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
      
      {/* Fondo oscuro al abrir el menú en móviles */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}
      
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden w-full relative z-0">{children}</main>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileMenuProvider>
      <LayoutContent>{children}</LayoutContent>
    </MobileMenuProvider>
  );
}
