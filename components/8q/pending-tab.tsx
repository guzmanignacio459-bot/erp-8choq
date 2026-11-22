export function PendingTab({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <section className="max-w-xl space-y-3">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="text-sm leading-6 text-erp-fg-muted">{text}</p>
      <p className="rounded-erp border border-erp-border bg-erp-bg-card px-4 py-3 text-sm text-erp-fg">
        Pendiente de esta fase. Esta pantalla no consulta datos y no muestra cifras de relleno.
      </p>
    </section>
  );
}
