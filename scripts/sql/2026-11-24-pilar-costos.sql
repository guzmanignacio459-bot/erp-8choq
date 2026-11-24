-- Preparada, no aplicada. No toca pilar_remitos ni pilar_prendas.
-- Un importe vacío queda NULL. No hay default 0. 8Q y SCNL no comparten fila.

CREATE TABLE pilar_costo_vigencia (
  id text PRIMARY KEY,
  owner text NOT NULL,
  sku text NOT NULL,
  vigente_desde date NOT NULL,
  modalidad text NOT NULL,
  materia_prima numeric(14, 2),
  mano_obra numeric(14, 2),
  avios numeric(14, 2),
  otros numeric(14, 2),
  costo_unitario numeric(14, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pilar_costo_vigencia_dueno CHECK (owner IN ('8Q', 'SCNL')),
  CONSTRAINT pilar_costo_vigencia_modalidad CHECK (modalidad IN ('directo', 'desglosado')),
  CONSTRAINT pilar_costo_vigencia_unitario CHECK (costo_unitario IS NULL OR costo_unitario >= 0),
  CONSTRAINT pilar_costo_vigencia_directo CHECK (
    modalidad <> 'directo'
    OR (costo_unitario IS NOT NULL AND materia_prima IS NULL AND mano_obra IS NULL AND avios IS NULL AND otros IS NULL)
  ),
  CONSTRAINT pilar_costo_vigencia_desglose CHECK (
    modalidad <> 'desglosado'
    OR (
      materia_prima IS NOT NULL AND mano_obra IS NOT NULL AND avios IS NOT NULL AND otros IS NOT NULL
      AND costo_unitario = materia_prima + mano_obra + avios + otros
    )
  ),
  CONSTRAINT pilar_costo_vigencia_unica UNIQUE (owner, sku, vigente_desde)
);

CREATE TABLE pilar_prenda_costo (
  prenda_id text PRIMARY KEY,
  owner text NOT NULL,
  sku text NOT NULL,
  cantidad numeric(14, 2) NOT NULL,
  fecha_venta date NOT NULL,
  vigencia_id text NOT NULL REFERENCES pilar_costo_vigencia (id),
  costo_unitario numeric(14, 2) NOT NULL,
  costo_total numeric(14, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pilar_prenda_costo_dueno CHECK (owner IN ('8Q', 'SCNL')),
  CONSTRAINT pilar_prenda_costo_unitario CHECK (costo_unitario >= 0),
  CONSTRAINT pilar_prenda_costo_total CHECK (costo_total = round(costo_unitario * cantidad, 2))
);

CREATE INDEX pilar_costo_vigencia_busqueda ON pilar_costo_vigencia (owner, sku, vigente_desde DESC);
