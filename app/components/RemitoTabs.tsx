'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function RemitoTabs() {
  const pathname = usePathname();
  const isNuevo = pathname === '/' || pathname === '';
  const isListado = pathname.startsWith('/remitos');

  const base =
    'inline-flex items-center px-3 py-2 rounded-md border transition-colors';
  const active = 'bg-neutral-900 text-white border-neutral-900';
  const idle = 'bg-white text-neutral-900 border-neutral-300 hover:bg-neutral-50';

  return (
    <div className="max-w-[1220px] mx-auto pt-4 pb-2 flex gap-2">
      <Link href="/" className={`${base} ${isNuevo ? active : idle}`}>
        Nuevo Remito
      </Link>
      <Link href="/remitos" className={`${base} ${isListado ? active : idle}`}>
        Listado
      </Link>
    </div>
  );
}
