# ERP 8Q + Pilar Finance — Design System UI.0

**Fase:** UI.0 — Enterprise SaaS  
**Estado:** Especificación (sin pantallas)  
**Default:** Dark mode  
**Inspiración:** Stripe · Linear · Vercel · Ramp · Mercury  

---

## Principios

1. **Financiero, no retail** — densidad informativa, números legibles, sin hero banners ni fotos de producto.
2. **Negro premium** — fondos casi negros con capas de elevación; nunca gris plano de ecommerce.
3. **Naranja 8Q con moderación** — acento para acción, foco y estado activo; no fondos grandes naranjas.
4. **Claridad de datos** — tablas, KPIs y montos ARS son protagonistas.
5. **Un sistema, dos productos** — mismos tokens base; Pilar Finance puede variar solo `--brand-accent` si hace falta.

---

## 1. Paleta

### 1.1 Primitivos (HSL — almacenar sin `hsl()`)

| Token | HSL | Hex ref | Uso |
|-------|-----|---------|-----|
| `ink-950` | 240 10% 3% | `#070709` | Fondo app |
| `ink-900` | 240 8% 6% | `#0E0E11` | Elevated |
| `ink-850` | 240 7% 9% | `#141418` | Cards |
| `ink-800` | 240 6% 12% | `#1C1C21` | Hover surfaces |
| `ink-700` | 240 5% 18% | `#2A2A31` | Borders strong |
| `ink-600` | 240 4% 24% | `#3A3A42` | Borders default |
| `ink-500` | 240 3% 40% | `#62626B` | Text subtle |
| `ink-400` | 240 4% 55% | `#868690` | Text muted |
| `ink-200` | 240 10% 90% | `#E4E4E9` | Text primary |
| `ink-50` | 0 0% 98% | `#FAFAFA` | Text inverse |

| Token | HSL | Hex ref | Uso |
|-------|-----|---------|-----|
| `brand-500` | **24 95% 53%** | `#F97316` | **Acento 8Q principal** |
| `brand-400` | 27 96% 61% | `#FB923C` | Hover acento |
| `brand-600` | 21 90% 48% | `#EA580C` | Active / pressed |
| `brand-300` | 30 97% 72% | `#FDBA74` | Glow suave |
| `brand-950` | 15 80% 10% | `#2A1206` | Tint backgrounds |

| Token | HSL | Uso semántico |
|-------|-----|---------------|
| `success-500` | 152 69% 48% | Pagado, MP approved, stock OK |
| `warning-500` | 38 92% 50% | Pendiente, sin MP |
| `danger-500` | 0 72% 51% | Error, anulado, stock negativo |
| `info-500` | 199 89% 48% | Info, dry-run, auditoría |
| `finance-500` | 217 91% 60% | Neto, fees MP (secundario) |
| `owner-scnl` | 280 65% 60% | Badge SCNL |
| `owner-8q` | 24 95% 53% | Badge 8Q (= brand) |

### 1.2 Semánticos (mapeo ERP)

| Semántico | Variable CSS | Valor |
|-----------|--------------|-------|
| Background app | `--erp-bg` | `ink-950` |
| Background elevated | `--erp-bg-elevated` | `ink-900` |
| Card | `--erp-bg-card` | `ink-850` |
| Hover | `--erp-bg-hover` | `ink-800` |
| Border | `--erp-border` | `ink-600` |
| Border subtle | `--erp-border-subtle` | `ink-700` @ 50% |
| Text primary | `--erp-fg` | `ink-200` |
| Text muted | `--erp-fg-muted` | `ink-400` |
| Text subtle | `--erp-fg-subtle` | `ink-500` |
| Accent | `--erp-accent` | `brand-500` |
| Accent dim | `--erp-accent-dim` | `brand-600` |
| Focus ring | `--erp-ring` | `brand-500` @ 40% |

**Migración desde UI actual:** reemplazar `--erp-accent: 252 95% 68%` (violeta) por `24 95% 53%` (naranja 8Q).

---

## 2. Tipografía

### Familias

| Rol | Familia | Fallback | Uso |
|-----|---------|----------|-----|
| **UI** | `Geist Sans` | Inter, system-ui | Todo el producto (Vercel-like) |
| **Mono / números** | `Geist Mono` | ui-monospace | Montos ARS, IDs remito, TN, MP |
| **Display** | `Geist Sans` | — | Títulos; tracking tight |

> Alternativa aceptada: **Inter** + **JetBrains Mono** si Geist no está disponible.

### Escala

| Token | Size | Line | Weight | Tracking | Uso |
|-------|------|------|--------|----------|-----|
| `text-display` | 30px / 1.875rem | 1.15 | 600 | -0.03em | Page title |
| `text-h1` | 24px | 1.2 | 600 | -0.025em | Sección |
| `text-h2` | 18px | 1.3 | 600 | -0.02em | Card title |
| `text-h3` | 14px | 1.4 | 600 | -0.01em | Subsection |
| `text-body` | 14px | 1.5 | 400 | 0 | Cuerpo |
| `text-body-sm` | 13px | 1.45 | 400 | 0 | Tablas densas |
| `text-caption` | 12px | 1.4 | 500 | 0.01em | Ayuda |
| `text-label` | 11px | 1.3 | 600 | 0.06em | Labels uppercase |
| `text-micro` | 10px | 1.3 | 600 | 0.08em | Badges, meta |
| `text-mono-sm` | 13px | 1.4 | 500 | 0 | SKUs, montos tabular |
| `text-mono-lg` | 20px | 1.2 | 600 | -0.02em | KPI valor |

### Reglas financieras

- Montos **siempre** `font-mono` + `tabular-nums`.
- ARS: `$` pegado, sin decimales en KPI; 2 decimales en detalle ítem.
- IDs (`R-…`, TN): mono, `text-fg-muted`, copiable.

---

## 3. Spacing (base 4px)

| Token | Value | Uso |
|-------|-------|-----|
| `space-0` | 0 | — |
| `space-0.5` | 2px | Badge padding Y |
| `space-1` | 4px | Gap icon-text tight |
| `space-1.5` | 6px | Badge padding X |
| `space-2` | 8px | Inline gaps |
| `space-3` | 12px | Card padding sm |
| `space-4` | 16px | Card padding default |
| `space-5` | 20px | Section gap sm |
| `space-6` | 24px | Section gap |
| `space-8` | 32px | Page padding mobile |
| `space-10` | 40px | Page padding desktop |
| `space-12` | 48px | Hero métrica (raro) |
| `space-16` | 64px | Topbar height reference |

**Layout grid:** contenido max `1440px`; gutter `24px` desktop / `16px` mobile.

**Densidad tablas:** row height `40px` compact / `48px` comfortable (default ERP: **40px**).

---

## 4. Cards

### Variantes

| Variante | Clase | Spec |
|----------|-------|------|
| **Default** | `erp-card` | bg card, border 1px, radius `12px`, shadow inner highlight |
| **Elevated** | `erp-card-elevated` | bg elevated, sin blur |
| **Glow** | `erp-card-glow` | gradient border brand→transparent (solo KPI hero) |
| **Inset** | `erp-card-inset` | bg ink-900, border subtle, radius `8px` |
| **Interactive** | `erp-card-interactive` | hover → bg-hover, cursor pointer |

### Anatomía

```
┌─ padding 16–20px ─────────────────────────────┐
│ LABEL (text-label, fg-subtle)                 │
│ Title (text-h2)                    [action] │
│ ─── border-subtle ───                         │
│ Content                                       │
└───────────────────────────────────────────────┘
```

- Sin sombras pesadas; preferir borde + highlight inset 1px white/3%.
- `backdrop-filter: blur(12px)` solo en cards flotantes (dropdown, command palette).

---

## 5. Tablas

### Estilo enterprise (Linear / Stripe)

| Elemento | Spec |
|----------|------|
| Container | `erp-card` + `overflow-x-auto` |
| Header | `text-label`, `fg-subtle`, bg `ink-900`, sticky top |
| Row | h `40px`, border-bottom `border-subtle` |
| Row hover | `bg-hover` |
| Row selected | `brand-500/8%` bg + left border 2px brand |
| Cell padding | `12px 16px` |
| Numeric cols | `text-right font-mono tabular-nums` |
| SKU col | mono, `text-body-sm`, `fg-muted` |
| Empty | centrado, `text-caption`, icon 24px muted |

### Estados fila

- **Duplicado TN:** left stripe `warning-500`
- **Sin MP:** dot `warning-500` en columna estado
- **Error import:** bg `danger-500/6%`

### Mobile

- `< md`: cards apiladas (`erp-remito-mobile-card`), no tabla horizontal.

---

## 6. KPIs

### Grid

- Desktop: 4 cols; tablet: 2; mobile: 1.
- Gap: `space-4`.

### KPI card anatomy

```
┌─────────────────────────┐
│ LABEL          [icon]   │  text-label
│ $ 12.489.601            │  text-mono-lg, fg
│ +12,4% vs mes ant.      │  text-caption, success/danger
│ ████░░ sparkline        │  opcional
└─────────────────────────┘
```

### Acentos KPI (borde izquierdo 3px o icon tint)

| Tipo | Color | Ejemplo métrica |
|------|-------|-----------------|
| `kpi-brand` | brand-500 | Facturación, ventas |
| `kpi-finance` | finance-500 | Neto MP, fees |
| `kpi-success` | success-500 | Cobrado, MP aplicado |
| `kpi-warning` | warning-500 | Pendiente MP |
| `kpi-neutral` | ink-500 | Conteos, prendas |

No más de **1** `erp-card-glow` por vista (métrica principal).

---

## 7. Sidebar

| Prop | Valor |
|------|-------|
| Width expanded | `260px` |
| Width collapsed | `72px` |
| Background | `ink-950` |
| Border right | `border-subtle` |
| Nav item height | `40px` |
| Nav item radius | `8px` |
| Active | `erp-nav-active` — bg brand/12%, border brand/25%, barra izq 3px brand |
| Icon | 18px, stroke 1.75 |
| Label | `text-body-sm`, weight 500 |
| Section label | `text-micro`, uppercase, `fg-subtle`, mt `space-6` |

### Estructura

```
[Logo 8Q]  ERP
─────────────
Operaciones
  Remitos
  Ítems
  Stock
  Importaciones
─────────────
Finanzas (Pilar)
  Analytics
  Mercado Pago
─────────────
[Collapse] [v0.2]
```

Logo: wordmark blanco + punto naranja (no logo ecommerce).

---

## 8. Topbar

| Prop | Valor |
|------|-------|
| Height | `64px` |
| Background | `ink-950/80` + blur 12px |
| Border bottom | `border-subtle` |
| Breadcrumb | `text-caption`, `fg-muted` |
| Page title | `text-h1` (en content, no topbar) |

### Zonas

| Izq | Centro | Der |
|-----|--------|-----|
| Toggle sidebar | Breadcrumb / command hint `⌘K` | Env badge, refresh, avatar |

**Live indicator:** dot `success-500` + `text-micro` "Sincronizado" (no pulse agresivo; usar pulse solo en import activo).

---

## 9. Formularios

### Input default

```
h: 40px
px: 12px
radius: 8px
bg: ink-850
border: ink-600
text: text-body, fg
placeholder: fg-subtle
focus: border brand/50%, ring 1px brand/35%
```

### Variantes

| Tipo | Notas |
|------|-------|
| Select | mismo shell; chevron `fg-muted` |
| Date range | dos inputs + separator; usado en filtros ERP |
| Search | icon left 16px, pl `40px` |
| Textarea | min-h `80px`, mono solo si JSON/debug |

### Label + help

- Label: `text-label`, `fg-subtle`, mb `space-1.5`
- Help: `text-caption`, `fg-muted`
- Error: `text-caption`, `danger-500`, border `danger-500/50%`

### Buttons

| Variant | bg | text | border |
|---------|-----|------|--------|
| Primary | brand-500 | ink-950 | none |
| Primary hover | brand-400 | — | — |
| Secondary | ink-850 | fg | ink-600 |
| Ghost | transparent | fg-muted | none |
| Danger | danger-500/15 | danger-500 | danger-500/30 |
| Disabled | ink-800 | ink-500 | ink-700 |

Height: `36px` sm / `40px` default. Radius `8px`. Font `text-body-sm` weight 600.

---

## 10. Badges de estado

### ERP remito / orden

| Estado | bg | text | border |
|--------|-----|------|--------|
| Pagado | success/15% | success-500 | success/25% |
| Pendiente | warning/15% | warning-500 | warning/25% |
| Anulado | danger/10% | danger-500 | danger/20% |
| Importado | brand/12% | brand-400 | brand/20% |
| Duplicado | warning/12% | warning-500 | warning/30% |
| Dry-run | info/12% | info-500 | info/25% |

### MP

| Estado | Color |
|--------|-------|
| approved | success |
| pending | warning |
| rejected | danger |
| sin MP | `fg-subtle` outline |

### Owner

| Owner | Color |
|-------|-------|
| 8Q | brand |
| SCNL | `owner-scnl` |
| GIFTY | info + icon gift |

### Talle / SKU

- Outline neutro `ink-600`; XS highlight `brand/15%` si es foco auditoría.

**Anatomía:** `text-micro`, weight 600, px `6px`, py `2px`, radius `6px`.

---

## 11. Gráficos

### Paleta series (dark)

| # | Color | Uso |
|---|-------|-----|
| 1 | brand-500 | Facturación principal |
| 2 | finance-500 | Neto / MP |
| 3 | success-500 | Cobrado |
| 4 | ink-400 | Comparativa secundaria |
| 5 | owner-scnl | Split SCNL |

### Estilo

- Grid lines: `ink-700` @ 40%, sin grid vertical salvo timeline.
- Axis labels: `text-micro`, `fg-subtle`.
- Tooltip: `erp-card` compact, mono para valores.
- Area charts: gradient fill brand `40%→0%`.
- Bar charts: radius top `4px`, gap `4px`.
- **Sin** colores pastel ecommerce; **sin** 3D.

### Librería recomendada

**Recharts** o **Visx** — consistente con React/Next; theming vía CSS variables.

---

## 12. Dark mode definitivo

**Dark-only en v1.** No light mode operativo (como Ramp/Mercury dashboard). Opcional light en v2 para export PDF/print.

### Background layers

```css
/* App shell */
background:
  radial-gradient(ellipse 70% 45% at 50% -15%, hsl(24 60% 12% / 0.22), transparent),
  radial-gradient(ellipse 50% 30% at 100% 0%, hsl(240 20% 8% / 0.5), transparent),
  hsl(var(--erp-bg));
```

- Gradiente naranja **muy sutil** arriba (reemplaza violeta actual).
- Sin cyan decorativo salvo Pilar Finance charts.

### Elevación (z-depth)

| Level | Token | Shadow |
|-------|-------|--------|
| 0 | bg | none |
| 1 | card | inset highlight |
| 2 | dropdown | `0 8px 32px -8px black/50%` |
| 3 | modal | `0 16px 48px -12px black/60%` |

### Scrollbar

- 6px, thumb `ink-600`, hover `ink-500` (mantener `erp-scrollbar`).

---

## 13. Motion

| Token | Value |
|-------|-------|
| `duration-fast` | 120ms |
| `duration-normal` | 200ms |
| `duration-slow` | 320ms |
| `ease-out` | cubic-bezier(0.16, 1, 0.3, 1) |

- Sidebar collapse, hover rows, modals: `duration-normal`.
- Sin animaciones decorativas en KPIs.
- `prefers-reduced-motion`: desactivar pulse live dot.

---

## 14. Iconografía

- **Lucide React** (ya en uso), stroke **1.75**, size 16/18/20.
- Iconos de estado con color semántico; navegación en `fg-muted`, active `fg`.

---

## 15. Accesibilidad

- Contraste texto primary sobre ink-950: ≥ 7:1.
- Brand sobre ink-950 (botón primary): texto **ink-950** sobre **brand-500** (≥ 4.5:1).
- Focus visible obligatorio: ring brand en todos los interactivos.
- Tablas: `scope` en headers; anunciar sort/filter para screen readers en v2.

---

## Apéndice A — Archivos target (implementación UI.1)

```
app/
  design-system/
    erp-tokens.css      ← variables CSS
    erp-components.css  ← erp-card, nav, badges
  dashboard/
    dashboard.css       ← migrar a tokens UI.0
tailwind.config.ts    ← extend erp.* colors
```

## Apéndice B — Checklist pre-migración PostgreSQL

- [ ] Tokens CSS unificados (sin violeta legacy)
- [ ] Componentes primitivos: Button, Input, Badge, Card, Table
- [ ] Storybook o página `/design-system` interna (opcional UI.1)
- [ ] KPI + Table usados en Remitos antes de rebuild DB views

---

*ERP 8Q Enterprise · Pilar Finance shared shell · UI.0*
