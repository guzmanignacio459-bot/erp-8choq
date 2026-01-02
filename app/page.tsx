// app/page.tsx
import { Suspense } from "react";
import EditorRemito from "./EditorRemito";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Cargando remito...</div>}>
      <EditorRemito />
    </Suspense>
  );
}
