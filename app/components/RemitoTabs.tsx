'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/', label: 'Nuevo Remito' },
  { href: '/remitos', label: 'Listado' },
];

export default function RemitoTabs() {
  const pathname = usePathname();
  return (
    <div className="w-full bg-white border-b border-neutral-200">
      <div className="max-w-[1220px] mx-auto px-4 flex gap-2">
        {tabs.map(t => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-3 py-2 text-sm border-b-2 ${
                active ? 'border-neutral-900 font-semibold' : 'border-transparent text-neutral-500 hover:text-neutral-900'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
