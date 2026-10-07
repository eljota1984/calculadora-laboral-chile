"use client";

/**
 * ============================================================================
 *  CALCULADORA LABORAL CHILE — Sueldo Líquido · Finiquito · Vacaciones
 * ============================================================================
 *  Stack: Next.js 14+ (App Router) · React 18 · Tailwind CSS · lucide-react
 *  Archivo: app/page.tsx  (Client Component)
 *
 *  ⚠️  IMPORTANTE SOBRE LOS VALORES LEGALES
 *  Los parámetros de AFP, salud, seguro de cesantía, impuesto único, UF y UTM
 *  se actualizan periódicamente (UF a diario, UTM cada mes, topes imponibles
 *  cada enero, comisiones AFP cuando cada administradora las modifica).
 *  Todas las constantes están agrupadas en la sección "PARÁMETROS LEGALES"
 *  más abajo, con la fuente oficial sugerida para validarlas antes de
 *  publicar la herramienta. Esta app es una calculadora referencial, no
 *  asesoría legal ni tributaria.
 * ============================================================================
 */

import { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  FileSignature,
  CalendarDays,
  Copy,
  Check,
  Info,
  ChevronDown,
  ArrowRight,
  Landmark,
  HeartPulse,
  ShieldCheck,
  Receipt,
} from "lucide-react";

/* ============================================================================
 * 1. PARÁMETROS LEGALES (ACTUALIZAR PERIÓDICAMENTE)
 * ==========================================================================*/

// Fuente: Superintendencia de Pensiones (www.spensiones.cl) — valor de referencia, julio 2026.
const UF_VALUE = 40828.47;
// Fuente: SII (www.sii.cl) — valor de referencia, julio 2026.
const UTM_VALUE = 71649;

// Fuente: Superintendencia de Pensiones — comisión sobre renta imponible, 2026.
const AFP_OPTIONS = [
  { id: "uno", label: "AFP Uno", commission: 0.46 },
  { id: "modelo", label: "AFP Modelo", commission: 0.58 },
  { id: "planvital", label: "AFP PlanVital", commission: 1.16 },
  { id: "habitat", label: "AFP Habitat", commission: 1.27 },
  { id: "capital", label: "AFP Capital", commission: 1.44 },
  { id: "cuprum", label: "AFP Cuprum", commission: 1.44 },
  { id: "provida", label: "AFP ProVida", commission: 1.45 },
] as const;

const AFP_FONDO_RATE = 10; // % cotización obligatoria a la cuenta individual
const SALUD_RATE = 7; // % mínimo legal (Fonasa o Isapre)

// Seguro de cesantía (AFC) — aporte del trabajador, según tipo de contrato.
const CESANTIA_TRABAJADOR = {
  indefinido: 0.6,
  plazo_fijo: 0,
} as const;

// Topes imponibles 2026 (se reajustan cada enero — verificar en spensiones.cl)
const TOPE_AFP_SALUD_UF = 90;
const TOPE_CESANTIA_UF = 135.2;
const TOPE_AFP_SALUD_CLP = TOPE_AFP_SALUD_UF * UF_VALUE;
const TOPE_CESANTIA_CLP = TOPE_CESANTIA_UF * UF_VALUE;

// Tabla de Impuesto Único de Segunda Categoría, en tramos de UTM.
// Estructura estable del SII; los umbrales en UTM casi no cambian — lo que
// cambia es el valor de la UTM en pesos cada mes. Verificar en sii.cl.
const TRAMOS_IMPUESTO = [
  { hasta: 13.5, factor: 0, rebajaUTM: 0 },
  { hasta: 30, factor: 0.04, rebajaUTM: 0.54 },
  { hasta: 50, factor: 0.08, rebajaUTM: 1.74 },
  { hasta: 70, factor: 0.135, rebajaUTM: 4.49 },
  { hasta: 90, factor: 0.23, rebajaUTM: 11.14 },
  { hasta: 120, factor: 0.304, rebajaUTM: 17.8 },
  { hasta: 150, factor: 0.35, rebajaUTM: 23.32 },
  { hasta: Infinity, factor: 0.4, rebajaUTM: 30.82 },
];

const DIAS_FERIADO_LEGAL_ANUAL = 15; // días hábiles de vacaciones por año trabajado
const DIAS_FERIADO_POR_MES = DIAS_FERIADO_LEGAL_ANUAL / 12; // 1.25 días hábiles/mes

/* ============================================================================
 * 2. UTILIDADES
 * ==========================================================================*/

function formatCLP(value: number): string {
  if (!isFinite(value)) return "$ 0";
  return "$ " + Math.round(Math.max(0, value)).toLocaleString("es-CL");
}

function parseCLPInput(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

function formatInputCLP(value: number): string {
  if (!value) return "";
  return value.toLocaleString("es-CL");
}

// Diferencia exacta entre dos fechas en años, meses y días completos.
function diffYMD(start: Date, end: Date) {
  if (end < start) return { years: 0, months: 0, days: 0, totalDays: 0 };
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000);
  return { years, months, days, totalDays };
}

function calcularImpuestoUnico(baseTributable: number): { impuesto: number; tramo: number } {
  if (baseTributable <= 0) return { impuesto: 0, tramo: 0 };
  const baseUTM = baseTributable / UTM_VALUE;
  const idx = TRAMOS_IMPUESTO.findIndex((t) => baseUTM <= t.hasta);
  const tramo = idx === -1 ? TRAMOS_IMPUESTO.length - 1 : idx;
  const { factor, rebajaUTM } = TRAMOS_IMPUESTO[tramo];
  const impuesto = baseTributable * factor - rebajaUTM * UTM_VALUE;
  return { impuesto: Math.max(0, impuesto), tramo };
}

/* ============================================================================
 * 3. COMPONENTE PRINCIPAL
 * ==========================================================================*/

type TabId = "sueldo" | "finiquito" | "vacaciones";

const TABS: { id: TabId; label: string; icon: typeof Wallet }[] = [
  { id: "sueldo", label: "Sueldo Líquido", icon: Wallet },
  { id: "finiquito", label: "Finiquito", icon: FileSignature },
  { id: "vacaciones", label: "Vacaciones", icon: CalendarDays },
];

export default function CalculadoraLaboralChile() {
  const [activeTab, setActiveTab] = useState<TabId>("sueldo");

  return (
    <div className="min-h-screen bg-violet-50/40 text-slate-800">
      <SiteHeader activeTab={activeTab} onChangeTab={setActiveTab} />

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        {activeTab === "sueldo" && <SueldoLiquidoCalculator />}
        {activeTab === "finiquito" && <FiniquitoCalculator />}
        {activeTab === "vacaciones" && <VacacionesCalculator />}

        <FAQSection activeTab={activeTab} />
      </main>

      <SiteFooter />
    </div>
  );
}

/* ============================================================================
 * 4. HEADER + TABS
 * ==========================================================================*/

function SiteHeader({
  activeTab,
  onChangeTab,
}: {
  activeTab: TabId;
  onChangeTab: (t: TabId) => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-violet-100 bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white">
            <Landmark className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight text-slate-900 sm:text-lg">
              Calculadora Laboral Chile
            </h1>
            <p className="text-xs text-slate-500">
              Sueldo líquido, finiquito y vacaciones en un solo lugar
            </p>
          </div>
        </div>

        <nav
          aria-label="Selector de calculadora"
          className="mt-4 grid grid-cols-3 gap-1 border-b border-transparent text-sm"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChangeTab(tab.id)}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "flex items-center justify-center gap-1.5 rounded-t-lg border-b-2 px-2 py-3 font-medium transition-colors sm:gap-2",
                  isActive
                    ? "border-violet-600 text-violet-600"
                    : "border-transparent text-slate-500 hover:text-slate-700",
                ].join(" ")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

/* ============================================================================
 * 5. BLOQUES REUTILIZABLES DE UI
 * ==========================================================================*/

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-violet-100 bg-white p-4 shadow-sm sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-sm font-medium text-slate-700">{children}</label>;
}

function CLPInput({
  value,
  onChange,
  placeholder,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
        $
      </span>
      <input
        inputMode="numeric"
        value={formatInputCLP(value)}
        onChange={(e) => onChange(parseCLPInput(e.target.value))}
        placeholder={placeholder ?? "0"}
        className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-7 pr-3 text-sm font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
      />
    </div>
  );
}

function DateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
    />
  );
}

function SelectInput<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-3 pr-9 text-sm font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function ResultRow({
  label,
  value,
  negative = false,
  bold = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className={bold ? "font-semibold text-slate-900" : "text-slate-600"}>{label}</span>
      <span
        className={[
          bold ? "font-bold" : "font-medium",
          negative ? "text-rose-600" : "text-slate-900",
        ].join(" ")}
      >
        {negative && value !== formatCLP(0) ? "− " : ""}
        {value}
      </span>
    </div>
  );
}

function SummaryCard({
  title,
  amount,
  icon: Icon,
  accent = "violet",
}: {
  title: string;
  amount: number;
  icon: typeof Wallet;
  accent?: "violet" | "lavender";
}) {
  const palette =
    accent === "lavender"
      ? "from-fuchsia-400 to-violet-500"
      : "from-violet-500 to-violet-600";
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${palette} p-5 text-white shadow-sm`}>
      <div className="flex items-center gap-2 text-sm font-medium text-white/80">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{formatCLP(amount)}</p>
    </div>
  );
}

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard no disponible (por ejemplo, contexto no seguro) — se ignora silenciosamente.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.99]"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copiado" : "Copiar resumen para WhatsApp / Correo"}
    </button>
  );
}

function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
      <Info className="h-4 w-4 shrink-0 translate-y-0.5" />
      <p>{children}</p>
    </div>
  );
}

/* ============================================================================
 * 6. CALCULADORA 1 — SUELDO LÍQUIDO Y BRUTO
 * ==========================================================================*/

function SueldoLiquidoCalculator() {
  const [sueldoBruto, setSueldoBruto] = useState(900000);
  const [afpId, setAfpId] = useState<(typeof AFP_OPTIONS)[number]["id"]>("habitat");
  const [tipoContrato, setTipoContrato] = useState<"indefinido" | "plazo_fijo">("indefinido");
  const [tipoSalud, setTipoSalud] = useState<"fonasa" | "isapre">("fonasa");
  const [planIsapreUF, setPlanIsapreUF] = useState(0);
  const [noImponible, setNoImponible] = useState(0);

  const afp = AFP_OPTIONS.find((a) => a.id === afpId)!;

  const result = useMemo(() => {
    const baseAfpSalud = Math.min(sueldoBruto, TOPE_AFP_SALUD_CLP);
    const baseCesantia = Math.min(sueldoBruto, TOPE_CESANTIA_CLP);

    const afpFondo = baseAfpSalud * (AFP_FONDO_RATE / 100);
    const afpComision = baseAfpSalud * (afp.commission / 100);
    const totalAfp = afpFondo + afpComision;

    const saludLegal = baseAfpSalud * (SALUD_RATE / 100);
    const planIsapreClp = planIsapreUF * UF_VALUE;
    const salud = tipoSalud === "isapre" ? Math.max(saludLegal, planIsapreClp) : saludLegal;

    const cesantiaRate = CESANTIA_TRABAJADOR[tipoContrato];
    const cesantia = baseCesantia * (cesantiaRate / 100);

    const baseTributable = Math.max(0, sueldoBruto - totalAfp - salud - cesantia);
    const { impuesto, tramo } = calcularImpuestoUnico(baseTributable);

    const liquido = sueldoBruto - totalAfp - salud - cesantia - impuesto + noImponible;

    return {
      baseAfpSalud,
      afpFondo,
      afpComision,
      totalAfp,
      salud,
      cesantia,
      cesantiaRate,
      baseTributable,
      impuesto,
      tramo,
      liquido,
    };
  }, [sueldoBruto, afp.commission, tipoSalud, planIsapreUF, tipoContrato, noImponible]);

  const copyText = () =>
    [
      "*Sueldo líquido estimado (Chile)*",
      `Sueldo bruto imponible: ${formatCLP(sueldoBruto)}`,
      `AFP (${afp.label}, ${(AFP_FONDO_RATE + afp.commission).toFixed(2)}%): -${formatCLP(result.totalAfp)}`,
      `Salud (${tipoSalud === "fonasa" ? "Fonasa 7%" : "Isapre"}): -${formatCLP(result.salud)}`,
      `Seguro de cesantía (${result.cesantiaRate}%): -${formatCLP(result.cesantia)}`,
      `Impuesto único: -${formatCLP(result.impuesto)}`,
      noImponible ? `Haberes no imponibles: +${formatCLP(noImponible)}` : null,
      `*Sueldo líquido: ${formatCLP(result.liquido)}*`,
      "",
      "Cálculo referencial, no constituye asesoría legal ni tributaria.",
    ]
      .filter(Boolean)
      .join("\n");

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <h2 className="text-lg font-bold text-slate-900">Sueldo líquido y bruto</h2>
        <p className="mt-1 text-sm text-slate-500">
          Calcula tu sueldo líquido con el desglose de AFP, salud, seguro de cesantía e
          impuesto único de segunda categoría.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel>Sueldo bruto imponible mensual</FieldLabel>
            <CLPInput value={sueldoBruto} onChange={setSueldoBruto} placeholder="900.000" />
          </div>

          <div>
            <FieldLabel>AFP</FieldLabel>
            <SelectInput
              value={afpId}
              onChange={setAfpId}
              options={AFP_OPTIONS.map((a) => ({
                value: a.id,
                label: `${a.label} · ${(AFP_FONDO_RATE + a.commission).toFixed(2)}%`,
              }))}
            />
          </div>

          <div>
            <FieldLabel>Tipo de contrato</FieldLabel>
            <SelectInput
              value={tipoContrato}
              onChange={setTipoContrato}
              options={[
                { value: "indefinido", label: "Indefinido" },
                { value: "plazo_fijo", label: "Plazo fijo / por obra" },
              ]}
            />
          </div>

          <div>
            <FieldLabel>Previsión de salud</FieldLabel>
            <SelectInput
              value={tipoSalud}
              onChange={setTipoSalud}
              options={[
                { value: "fonasa", label: "Fonasa (7%)" },
                { value: "isapre", label: "Isapre (plan en UF)" },
              ]}
            />
          </div>

          {tipoSalud === "isapre" && (
            <div>
              <FieldLabel>Valor del plan Isapre (UF)</FieldLabel>
              <input
                inputMode="decimal"
                value={planIsapreUF || ""}
                onChange={(e) => setPlanIsapreUF(parseFloat(e.target.value.replace(",", ".")) || 0)}
                placeholder="Ej: 7,5"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              />
            </div>
          )}

          <div className="sm:col-span-2">
            <FieldLabel>Haberes no imponibles (colación, movilización, etc. — opcional)</FieldLabel>
            <CLPInput value={noImponible} onChange={setNoImponible} placeholder="0" />
          </div>
        </div>

        <InfoNote>
          El cálculo usa los topes imponibles de {TOPE_AFP_SALUD_UF} UF (AFP y salud) y{" "}
          {TOPE_CESANTIA_UF} UF (seguro de cesantía), y la UF/UTM de referencia indicadas en el
          pie de página. Verifica los valores vigentes antes de tomar decisiones.
        </InfoNote>
      </Card>

      <div className="space-y-4 lg:col-span-2">
        <SummaryCard title="Sueldo líquido estimado" amount={result.liquido} icon={Wallet} />

        <Card>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Receipt className="h-4 w-4" /> Desglose del descuento
          </h3>
          <div className="divide-y divide-slate-100">
            <ResultRow label="Sueldo bruto imponible" value={formatCLP(sueldoBruto)} bold />
            <ResultRow
              label={`AFP fondo (${AFP_FONDO_RATE}%)`}
              value={formatCLP(result.afpFondo)}
              negative
            />
            <ResultRow
              label={`Comisión ${afp.label} (${afp.commission}%)`}
              value={formatCLP(result.afpComision)}
              negative
            />
            <ResultRow
              label={`Salud (${tipoSalud === "fonasa" ? "Fonasa" : "Isapre"})`}
              value={formatCLP(result.salud)}
              negative
            />
            <ResultRow
              label={`Seguro de cesantía (${result.cesantiaRate}%)`}
              value={formatCLP(result.cesantia)}
              negative
            />
            <ResultRow label="Impuesto único" value={formatCLP(result.impuesto)} negative />
            {noImponible > 0 && (
              <ResultRow label="Haberes no imponibles" value={formatCLP(noImponible)} />
            )}
            <div className="pt-2">
              <ResultRow label="Sueldo líquido" value={formatCLP(result.liquido)} bold />
            </div>
          </div>
          <CopyButton getText={copyText} />
        </Card>
      </div>
    </div>
  );
}

/* ============================================================================
 * 7. CALCULADORA 2 — FINIQUITO
 * ==========================================================================*/

type Causal = "necesidades_empresa" | "renuncia" | "mutuo_acuerdo" | "plazo_fijo" | "otra";

function FiniquitoCalculator() {
  const today = new Date().toISOString().slice(0, 10);
  const [fechaIngreso, setFechaIngreso] = useState("2021-03-01");
  const [fechaSalida, setFechaSalida] = useState(today);
  const [sueldoBase, setSueldoBase] = useState(900000);
  const [causal, setCausal] = useState<Causal>("necesidades_empresa");
  const [avisoPrevio, setAvisoPrevio] = useState(false);
  const [diasVacPendientes, setDiasVacPendientes] = useState(0);
  const [otrosHaberes, setOtrosHaberes] = useState(0);

  const result = useMemo(() => {
    const start = new Date(fechaIngreso);
    const end = new Date(fechaSalida);
    const { years, months } = diffYMD(start, end);

    // Redondeo legal: fracción superior a 6 meses cuenta como año completo. Tope 11 años.
    const añosServicioRaw = years + (months >= 6 ? 1 : 0);
    const añosServicio = Math.min(añosServicioRaw, 11);

    const baseIndemnizacion = Math.min(sueldoBase, TOPE_AFP_SALUD_CLP);
    const aplicaIndemnizacion = causal === "necesidades_empresa";

    const indemnizacionAnios = aplicaIndemnizacion ? añosServicio * baseIndemnizacion : 0;
    const indemnizacionAviso =
      aplicaIndemnizacion && !avisoPrevio ? baseIndemnizacion : 0;

    const valorDiaVacaciones = sueldoBase / 30;
    const vacacionesProporcionales = diasVacPendientes * valorDiaVacaciones;

    const total =
      indemnizacionAnios + indemnizacionAviso + vacacionesProporcionales + otrosHaberes;

    return {
      años: years,
      meses: months,
      añosServicio,
      aplicaIndemnizacion,
      indemnizacionAnios,
      indemnizacionAviso,
      vacacionesProporcionales,
      total,
    };
  }, [fechaIngreso, fechaSalida, sueldoBase, causal, avisoPrevio, diasVacPendientes, otrosHaberes]);

  const causalLabel: Record<Causal, string> = {
    necesidades_empresa: "Necesidades de la empresa (Art. 161)",
    renuncia: "Renuncia voluntaria",
    mutuo_acuerdo: "Mutuo acuerdo",
    plazo_fijo: "Vencimiento de plazo fijo",
    otra: "Otra causal",
  };

  const copyText = () =>
    [
      "*Finiquito estimado (Chile)*",
      `Causal: ${causalLabel[causal]}`,
      `Antigüedad: ${result.años} año(s) y ${result.meses} mes(es)`,
      result.aplicaIndemnizacion
        ? `Indemnización por años de servicio (${result.añosServicio} año(s)): ${formatCLP(result.indemnizacionAnios)}`
        : "Indemnización por años de servicio: no aplica para esta causal",
      result.indemnizacionAviso
        ? `Indemnización sustitutiva del aviso previo: ${formatCLP(result.indemnizacionAviso)}`
        : null,
      `Vacaciones proporcionales (${diasVacPendientes} días): ${formatCLP(result.vacacionesProporcionales)}`,
      otrosHaberes ? `Otros haberes pendientes: ${formatCLP(otrosHaberes)}` : null,
      `*Total finiquito estimado: ${formatCLP(result.total)}*`,
      "",
      "Cálculo referencial, no constituye asesoría legal. El finiquito definitivo debe ratificarse ante ministro de fe.",
    ]
      .filter(Boolean)
      .join("\n");

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <h2 className="text-lg font-bold text-slate-900">Finiquito de trabajo</h2>
        <p className="mt-1 text-sm text-slate-500">
          Estima la indemnización por años de servicio, el mes de aviso y las vacaciones
          proporcionales.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>Fecha de ingreso</FieldLabel>
            <DateInput value={fechaIngreso} onChange={setFechaIngreso} />
          </div>
          <div>
            <FieldLabel>Fecha de término</FieldLabel>
            <DateInput value={fechaSalida} onChange={setFechaSalida} />
          </div>

          <div className="sm:col-span-2">
            <FieldLabel>Última remuneración mensual (bruta)</FieldLabel>
            <CLPInput value={sueldoBase} onChange={setSueldoBase} placeholder="900.000" />
          </div>

          <div className="sm:col-span-2">
            <FieldLabel>Causal de término</FieldLabel>
            <SelectInput
              value={causal}
              onChange={setCausal}
              options={(Object.keys(causalLabel) as Causal[]).map((c) => ({
                value: c,
                label: causalLabel[c],
              }))}
            />
          </div>

          {causal === "necesidades_empresa" && (
            <label className="flex items-center gap-2 sm:col-span-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={avisoPrevio}
                onChange={(e) => setAvisoPrevio(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-400"
              />
              El empleador avisó el término con al menos 30 días de anticipación
            </label>
          )}

          <div>
            <FieldLabel>Días de vacaciones pendientes</FieldLabel>
            <input
              inputMode="numeric"
              value={diasVacPendientes || ""}
              onChange={(e) => setDiasVacPendientes(parseInt(e.target.value.replace(/\D/g, "")) || 0)}
              placeholder="0"
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
            />
            <p className="mt-1 text-xs text-slate-400">
              ¿No lo sabes? Calcúlalo en la pestaña «Vacaciones».
            </p>
          </div>
          <div>
            <FieldLabel>Otros haberes pendientes (opcional)</FieldLabel>
            <CLPInput value={otrosHaberes} onChange={setOtrosHaberes} placeholder="0" />
          </div>
        </div>

        <InfoNote>
          La indemnización por años de servicio y el mes de aviso solo aplican, por regla
          general, cuando el término es por «necesidades de la empresa» o desahucio del
          empleador (Art. 161 Código del Trabajo), y tienen un tope de 11 años y de{" "}
          {TOPE_AFP_SALUD_UF} UF por año. Si el contrato termina por renuncia, mutuo acuerdo o
          vencimiento de plazo, normalmente no corresponden.
        </InfoNote>
      </Card>

      <div className="space-y-4 lg:col-span-2">
        <SummaryCard title="Total finiquito estimado" amount={result.total} icon={FileSignature} accent="lavender" />

        <Card>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Receipt className="h-4 w-4" /> Desglose
          </h3>
          <div className="divide-y divide-slate-100">
            <ResultRow
              label="Antigüedad"
              value={`${result.años} año(s), ${result.meses} mes(es)`}
            />
            <ResultRow
              label={`Indemnización por años de servicio (${result.añosServicio})`}
              value={formatCLP(result.indemnizacionAnios)}
            />
            <ResultRow label="Indemnización sustitutiva aviso previo" value={formatCLP(result.indemnizacionAviso)} />
            <ResultRow label="Vacaciones proporcionales" value={formatCLP(result.vacacionesProporcionales)} />
            {otrosHaberes > 0 && <ResultRow label="Otros haberes" value={formatCLP(otrosHaberes)} />}
            <div className="pt-2">
              <ResultRow label="Total finiquito" value={formatCLP(result.total)} bold />
            </div>
          </div>
          <CopyButton getText={copyText} />
        </Card>
      </div>
    </div>
  );
}

/* ============================================================================
 * 8. CALCULADORA 3 — VACACIONES PROPORCIONALES
 * ==========================================================================*/

function VacacionesCalculator() {
  const today = new Date().toISOString().slice(0, 10);
  const [fechaIngreso, setFechaIngreso] = useState("2023-01-02");
  const [fechaCalculo, setFechaCalculo] = useState(today);
  const [diasUsados, setDiasUsados] = useState(0);
  const [sueldoBase, setSueldoBase] = useState(900000);

  const result = useMemo(() => {
    const start = new Date(fechaIngreso);
    const end = new Date(fechaCalculo);
    const { years, months, days, totalDays } = diffYMD(start, end);

    const mesesTotales = years * 12 + months + (days >= 15 ? 1 : 0);
    const diasDevengados = mesesTotales * DIAS_FERIADO_POR_MES;
    const diasPendientes = Math.max(0, diasDevengados - diasUsados);

    // Estimación de días corridos equivalentes (hábiles → corridos), referencial.
    const diasCorridosEstimados = diasPendientes * 1.4;

    const valorDia = sueldoBase / 30;
    const valorizado = diasPendientes * valorDia;

    return {
      mesesTotales,
      diasDevengados,
      diasPendientes,
      diasCorridosEstimados,
      valorizado,
      totalDays,
    };
  }, [fechaIngreso, fechaCalculo, diasUsados, sueldoBase]);

  const copyText = () =>
    [
      "*Vacaciones proporcionales (Chile)*",
      `Período: ${fechaIngreso} a ${fechaCalculo}`,
      `Meses trabajados considerados: ${result.mesesTotales}`,
      `Días hábiles devengados: ${result.diasDevengados.toFixed(1)}`,
      `Días ya utilizados: ${diasUsados}`,
      `*Días hábiles pendientes: ${result.diasPendientes.toFixed(1)}*`,
      `Estimado en días corridos: ~${Math.round(result.diasCorridosEstimados)} días`,
      `Valorizado: ${formatCLP(result.valorizado)}`,
      "",
      "Cálculo referencial (1,25 días hábiles por mes trabajado). No constituye asesoría legal.",
    ].join("\n");

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <h2 className="text-lg font-bold text-slate-900">Vacaciones proporcionales</h2>
        <p className="mt-1 text-sm text-slate-500">
          Calcula los días hábiles de feriado legal pendientes según la fecha de ingreso y de
          salida (o la fecha actual, si sigues trabajando).
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>Fecha de ingreso</FieldLabel>
            <DateInput value={fechaIngreso} onChange={setFechaIngreso} />
          </div>
          <div>
            <FieldLabel>Fecha de cálculo / salida</FieldLabel>
            <DateInput value={fechaCalculo} onChange={setFechaCalculo} />
          </div>

          <div>
            <FieldLabel>Días hábiles ya utilizados</FieldLabel>
            <input
              inputMode="numeric"
              value={diasUsados || ""}
              onChange={(e) => setDiasUsados(parseInt(e.target.value.replace(/\D/g, "")) || 0)}
              placeholder="0"
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
            />
          </div>
          <div>
            <FieldLabel>Sueldo base mensual (para valorizar)</FieldLabel>
            <CLPInput value={sueldoBase} onChange={setSueldoBase} placeholder="900.000" />
          </div>
        </div>

        <InfoNote>
          El feriado legal corresponde a {DIAS_FERIADO_LEGAL_ANUAL} días hábiles por año
          trabajado (equivalente a {DIAS_FERIADO_POR_MES.toFixed(2)} días hábiles por mes). La
          conversión a días corridos es una estimación: el número real depende de cuántos fines
          de semana y festivos caigan dentro del período.
        </InfoNote>
      </Card>

      <div className="space-y-4 lg:col-span-2">
        {/* Tarjeta de días pendientes (no es un monto en pesos, por eso no usa <SummaryCard>) */}
        <div className="rounded-2xl bg-gradient-to-br from-fuchsia-400 to-violet-500 p-5 text-white shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-white/80">
            <CalendarDays className="h-4 w-4" />
            Días hábiles pendientes
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {result.diasPendientes.toFixed(1)} días
          </p>
          <p className="mt-1 text-sm text-white/80">
            ≈ {Math.round(result.diasCorridosEstimados)} días corridos · {formatCLP(result.valorizado)}
          </p>
        </div>

        <Card>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Receipt className="h-4 w-4" /> Desglose
          </h3>
          <div className="divide-y divide-slate-100">
            <ResultRow label="Meses trabajados considerados" value={`${result.mesesTotales}`} />
            <ResultRow label="Días hábiles devengados" value={`${result.diasDevengados.toFixed(1)}`} />
            <ResultRow label="Días ya utilizados" value={`${diasUsados}`} negative />
            <div className="pt-2">
              <ResultRow label="Días hábiles pendientes" value={`${result.diasPendientes.toFixed(1)}`} bold />
            </div>
            <ResultRow label="Valorizado" value={formatCLP(result.valorizado)} bold />
          </div>
          <CopyButton getText={copyText} />
        </Card>
      </div>
    </div>
  );
}

/* ============================================================================
 * 9. FAQ (SEO)
 * ==========================================================================*/

const FAQS: Record<TabId, { q: string; a: string }[]> = {
  sueldo: [
    {
      q: "¿Qué diferencia hay entre sueldo bruto y sueldo líquido?",
      a: "El sueldo bruto es la remuneración imponible pactada en el contrato, antes de descuentos. El sueldo líquido es lo que efectivamente recibes después de descontar AFP, salud, seguro de cesantía e impuesto único (si corresponde).",
    },
    {
      q: "¿Por qué varía el descuento según la AFP que elija?",
      a: "Todas las AFP cotizan el mismo 10% a tu cuenta individual, pero cada una cobra una comisión distinta por administrar ese fondo. Esa comisión es la que hace variar el descuento total entre una AFP y otra.",
    },
    {
      q: "¿Hasta qué monto estoy exento de impuesto único?",
      a: "Estás exento del impuesto único de segunda categoría si tu renta líquida imponible (bruto menos AFP, salud y cesantía) no supera 13,5 UTM mensuales. Sobre ese monto, el impuesto se calcula de forma progresiva por tramos.",
    },
    {
      q: "¿El seguro de cesantía se descuenta en todos los contratos?",
      a: "No. En contrato indefinido, el trabajador aporta un 0,6% de su renta imponible. En contrato a plazo fijo o por obra, el aporte del trabajador es 0% (el costo lo asume completamente el empleador).",
    },
  ],
  finiquito: [
    {
      q: "¿Cuándo corresponde pagar indemnización por años de servicio?",
      a: "Principalmente cuando el empleador pone término al contrato por «necesidades de la empresa» (Art. 161 del Código del Trabajo) o por desahucio. Si el trabajador renuncia, hay mutuo acuerdo o vence un plazo fijo, por regla general no corresponde.",
    },
    {
      q: "¿Qué es el mes de aviso o indemnización sustitutiva?",
      a: "Si el empleador no avisa el término del contrato con al menos 30 días de anticipación en una causal que lo requiere, debe pagar un monto equivalente a la última remuneración mensual en reemplazo de ese aviso.",
    },
    {
      q: "¿Existe un tope para la indemnización por años de servicio?",
      a: "Sí: se paga un máximo de 11 años de servicio, y la base de cálculo de cada año tiene un tope de 90 UF sobre la última remuneración mensual.",
    },
    {
      q: "¿El finiquito debe firmarse ante un ministro de fe?",
      a: "Sí, para que tenga pleno valor legal el finiquito debe ratificarse ante un ministro de fe (notario, inspector del trabajo, entre otros). Esta calculadora solo entrega una estimación referencial del monto.",
    },
  ],
  vacaciones: [
    {
      q: "¿Cuántos días de vacaciones corresponden por año trabajado?",
      a: "La ley establece 15 días hábiles de feriado legal por cada año de trabajo, lo que equivale a 1,25 días hábiles por cada mes trabajado.",
    },
    {
      q: "¿Qué diferencia hay entre días hábiles e inhábiles?",
      a: "El feriado legal se cuenta en días hábiles, es decir, de lunes a viernes, sin contar sábados, domingos ni festivos. Por eso, en días corridos (calendario) el período de vacaciones suele ser más largo que la cantidad de días hábiles.",
    },
    {
      q: "¿Qué pasa con las vacaciones si no las tomé antes de dejar el trabajo?",
      a: "Los días de feriado legal que no se usaron se pagan en el finiquito como «vacaciones proporcionales», valorizados según la última remuneración mensual.",
    },
  ],
};

function FAQSection({ activeTab }: { activeTab: TabId }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const items = FAQS[activeTab];

  return (
    <section aria-labelledby="faq-heading" className="mt-10">
      <h2 id="faq-heading" className="text-lg font-bold text-slate-900">
        Preguntas frecuentes
      </h2>
      <div className="mt-3 divide-y divide-violet-100 rounded-2xl border border-violet-100 bg-white">
        {items.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={item.q}>
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left text-sm font-semibold text-slate-800 sm:px-5"
              >
                {item.q}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {isOpen && (
                <p className="px-4 pb-4 text-sm leading-relaxed text-slate-600 sm:px-5">
                  {item.a}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ============================================================================
 * 10. FOOTER
 * ==========================================================================*/

// Año de copyright. Se fija un valor por defecto para el render estático
// (server/prerender) y se corrige en el cliente tras montar, porque leer
// `new Date()` directamente durante el render bloquea el prerenderizado
// estático en Next.js 16 (el resultado no sería determinista).
const COPYRIGHT_YEAR_FALLBACK = 2026;

function SiteFooter() {
  const [year, setYear] = useState(COPYRIGHT_YEAR_FALLBACK);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="border-t border-violet-100 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8 text-xs leading-relaxed text-slate-500 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-4 text-slate-600">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" /> AFP y salud actualizadas 2026
          </span>
          <span className="flex items-center gap-1.5">
            <HeartPulse className="h-4 w-4" /> Topes imponibles {TOPE_AFP_SALUD_UF} / {TOPE_CESANTIA_UF} UF
          </span>
          <span className="flex items-center gap-1.5">
            <ArrowRight className="h-4 w-4" /> UF ${UF_VALUE.toLocaleString("es-CL")} · UTM $
            {UTM_VALUE.toLocaleString("es-CL")}
          </span>
        </div>
        <p>
          Esta herramienta entrega cálculos referenciales basados en la normativa laboral y
          previsional chilena vigente a la fecha indicada. No reemplaza una liquidación de sueldo
          oficial, un finiquito ratificado ante ministro de fe, ni asesoría legal, laboral o
          tributaria profesional. Verifica siempre los valores de UF, UTM, comisiones de AFP y
          topes imponibles en las fuentes oficiales (Superintendencia de Pensiones, SII,
          Dirección del Trabajo) antes de tomar decisiones.
        </p>
        <p className="mt-3">© {year} Calculadora Laboral Chile.</p>
      </div>
    </footer>
  );
}
