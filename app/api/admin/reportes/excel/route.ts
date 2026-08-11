import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularResumenesPeriodo } from '@/lib/reportes/calcularResumenesPeriodo'
import ExcelJS from 'exceljs'
import { format } from 'date-fns-tz'

const TZ = 'America/Argentina/Buenos_Aires'

// ── Paleta ──────────────────────────────────────────────────────────
const C = {
  navyBg:   'FF0F2D5E',
  blueDark: 'FF1D4ED8',
  blueAlt:  'FFEFF6FF',
  blueTot:  'FFBFDBFE',
  white:    'FFFFFFFF',
  redBg:    'FFFEF2F2', redText:   'FFB91C1C',
  greenBg:  'FFF0FDF4', greenText: 'FF15803D', greenTot: 'FFD1FAE5', greenBord: 'FF6EE7B7',
  amberBg:  'FFFEF3C7', amberText: 'FFB45309',
  grayText: 'FF6B7280',
  darkText: 'FF111827',
  border:   'FFE5E7EB', borderMed: 'FF93C5FD',
  accent:   'FF2563EB',
  subtitleTxt: 'FFCFE8FF',
}

const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// ── Utilidades ──────────────────────────────────────────────────────
function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}
function bdr(argb = C.border, style: ExcelJS.BorderStyle = 'thin') {
  return { style, color: { argb } }
}
const BA  = { top: bdr(), bottom: bdr(), left: bdr(), right: bdr() }
const BM  = { top: bdr(C.borderMed, 'medium'), bottom: bdr(C.borderMed, 'medium'), left: bdr(C.borderMed, 'medium'), right: bdr(C.borderMed, 'medium') }
const BGT = { top: bdr(C.greenBord, 'medium'), bottom: bdr(C.greenBord, 'medium'), left: bdr(C.greenBord, 'medium'), right: bdr(C.greenBord, 'medium') }

// ── Columnas por hoja de sucursal ───────────────────────────────────
// Índices: 0 nombre, 1 dni, 2 sueldo, 3 $/h extra (fórmula), 4 días, 5 tardanzas,
// 6 inasistencias, 7 hs extra (numérico, fórmula-compatible), 8 monto extra (fórmula),
// 9 presentismo, 10 total exacto (fórmula), 11 total liquidar redondeado (fórmula MROUND).
const COLS = [
  { header: 'Apellido y Nombre',  w: 30 },
  { header: 'DNI',                w: 14 },
  { header: 'Sueldo Base',        w: 18 },
  { header: '$ / Hs Extra',       w: 15 },
  { header: 'Días Trab.',         w: 11 },
  { header: 'Tardanzas',          w: 12 },
  { header: 'Inasistencias',      w: 18 },
  { header: 'Hs Extra',           w: 11 },
  { header: 'Monto Extra',        w: 18 },
  { header: 'Presentismo',        w: 18 },
  { header: 'Total Exacto',       w: 16 },
  { header: '★ TOTAL LIQUIDAR',   w: 20 },
]
const NC = COLS.length

// Columnas cuyo valor es una fórmula real de Excel (recalculan solo si se edita
// el sueldo, las horas extra o el presentismo en la planilla exportada).
const COL_SUELDO        = 2
const COL_VALOR_HORA    = 3
const COL_HS_EXTRA      = 7
const COL_MONTO_EXTRA   = 8
const COL_PRESENTISMO   = 9
const COL_TOTAL_EXACTO  = 10
const COL_TOTAL_LIQUIDAR = 11

interface EmpData {
  nombre: string; apellido: string; dni: string | null; sueldo: number
  sucursal: string; rol: string
  diasTrabajados: number; tardanzas: number
  inasistencias: number; inasistenciasJustificadas: number
  horasExtraFormato: string; minutosExtraTotal: number; montoExtra: number
  presentismo: number; totalLiquidar: number; totalLiquidarExacto: number
}
interface GroupSummary {
  label: string; empleados: number
  totalSueldos: number; totalExtras: number; totalPresent: number; totalGeneral: number
  conPresent: number; sinPresent: number
}

// ── Precalcular resumen de grupo ─────────────────────────────────────
function grupoSummary(label: string, data: EmpData[]): GroupSummary {
  return {
    label, empleados: data.length,
    totalSueldos: data.reduce((s, e) => s + e.sueldo, 0),
    totalExtras:  data.reduce((s, e) => s + e.montoExtra, 0),
    totalPresent: data.reduce((s, e) => s + e.presentismo, 0),
    totalGeneral: data.reduce((s, e) => s + e.totalLiquidar, 0),
    conPresent:   data.filter(e => e.presentismo > 0).length,
    sinPresent:   data.filter(e => e.presentismo === 0).length,
  }
}

// ── Hoja de resumen (se crea primero) ────────────────────────────────
function buildSummarySheet(wb: ExcelJS.Workbook, mesLabel: string, summaries: GroupSummary[], generadoEn: string) {
  const SC = 8
  const ws = wb.addWorksheet('Resumen General', {
    views: [{ state: 'frozen', ySplit: 4 }],
  })
  ;[30, 12, 18, 18, 18, 14, 14, 20].forEach((w, i) => { ws.getColumn(i + 1).width = w })

  const merge = (r1: number, c1: number, r2: number, c2: number) => ws.mergeCells(r1, c1, r2, c2)

  merge(1, 1, 1, SC)
  const t = ws.getCell(1, 1)
  t.value = `LIQUIDACIÓN DE HABERES  ·  RESUMEN GENERAL  ·  ${mesLabel.toUpperCase()}`
  t.font  = { name: 'Calibri', size: 15, bold: true, color: { argb: C.white } }
  t.alignment = { horizontal: 'center', vertical: 'middle' }
  t.fill  = fill(C.navyBg)
  ws.getRow(1).height = 34

  merge(2, 1, 2, SC)
  const s = ws.getCell(2, 1)
  s.value = `Generado el ${generadoEn}   ·   ${summaries.reduce((a, b) => a + b.empleados, 0)} empleados en total`
  s.font  = { name: 'Calibri', size: 10, color: { argb: C.subtitleTxt } }
  s.alignment = { horizontal: 'center', vertical: 'middle' }
  s.fill  = fill(C.accent)
  ws.getRow(2).height = 18
  ws.getRow(3).height = 6

  const hdr = ['Sucursal / Grupo', 'Empleados', 'Total Sueldos', 'Total Extras', 'Presentismo', 'Con Present.', 'Sin Present.', '★ TOTAL GENERAL']
  const hr = ws.getRow(4)
  hr.height = 22
  hdr.forEach((h, i) => {
    const c = hr.getCell(i + 1)
    c.value = h
    c.font  = { name: 'Calibri', size: 10, bold: true, color: { argb: C.white } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.fill  = fill(C.navyBg)
    c.border = BA
  })

  summaries.forEach((g, idx) => {
    const row = ws.getRow(5 + idx)
    row.height = 20
    const bg = idx % 2 === 0 ? C.white : C.blueAlt
    const vals = [g.label, g.empleados, g.totalSueldos, g.totalExtras, g.totalPresent, g.conPresent, g.sinPresent, g.totalGeneral]
    vals.forEach((val, i) => {
      const c = row.getCell(i + 1)
      c.value  = val; c.fill = fill(bg); c.border = BA
      c.font   = { name: 'Calibri', size: 10, color: { argb: C.darkText } }
      c.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle' }
      if (i === 0) c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.navyBg } }
      if ([2, 3, 4, 7].includes(i)) { c.numFmt = '"$"\\ #,##0.00'; c.alignment = { horizontal: 'right', vertical: 'middle' } }
      if (i === 7) c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.navyBg } }
      if (i === 5 && g.conPresent === g.empleados) { c.fill = fill(C.greenBg); c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.greenText } } }
      if (i === 6 && g.sinPresent > 0) { c.fill = fill(C.redBg); c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.redText } } }
    })
  })

  ws.getRow(5 + summaries.length).height = 4

  const gtRow = ws.getRow(6 + summaries.length)
  gtRow.height = 26
  const gt = [
    'GRAN TOTAL',
    summaries.reduce((a, b) => a + b.empleados, 0),
    summaries.reduce((a, b) => a + b.totalSueldos, 0),
    summaries.reduce((a, b) => a + b.totalExtras, 0),
    summaries.reduce((a, b) => a + b.totalPresent, 0),
    summaries.reduce((a, b) => a + b.conPresent, 0),
    summaries.reduce((a, b) => a + b.sinPresent, 0),
    summaries.reduce((a, b) => a + b.totalGeneral, 0),
  ]
  gt.forEach((val, i) => {
    const c = gtRow.getCell(i + 1)
    c.value = val
    c.fill   = fill(i === 7 ? C.greenTot : C.blueTot)
    c.border = i === 7 ? BGT : BM
    c.font   = { name: 'Calibri', size: i === 7 ? 13 : 11, bold: true, color: { argb: C.navyBg } }
    c.alignment = { horizontal: i === 0 ? 'left' : (i >= 2 ? 'right' : 'center'), vertical: 'middle' }
    if ([2, 3, 4, 7].includes(i)) c.numFmt = '"$"\\ #,##0.00'
  })

  const footNum = 8 + summaries.length
  ws.mergeCells(footNum, 1, footNum, SC)
  const foot = ws.getCell(footNum, 1)
  foot.value = `Documento generado automáticamente por el sistema de asistencia  ·  ${generadoEn}`
  foot.font  = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FFB0B8C4' } }
  foot.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(footNum).height = 14
}

// ── Hoja por grupo ───────────────────────────────────────────────────
function buildGroupSheet(wb: ExcelJS.Workbook, sheetName: string, groupLabel: string, mesLabel: string, desde: string, hasta: string, data: EmpData[]) {
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })

  COLS.forEach((col, i) => { ws.getColumn(i + 1).width = col.w })

  // Fila 1: Título
  ws.mergeCells(1, 1, 1, NC)
  const t = ws.getCell(1, 1)
  t.value = `LIQUIDACIÓN DE HABERES  ·  ${groupLabel.toUpperCase()}`
  t.font  = { name: 'Calibri', size: 15, bold: true, color: { argb: C.white } }
  t.alignment = { horizontal: 'center', vertical: 'middle' }
  t.fill  = fill(C.navyBg)
  ws.getRow(1).height = 34

  // Fila 2: Subtítulo
  ws.mergeCells(2, 1, 2, NC)
  const s = ws.getCell(2, 1)
  s.value = `Período: ${mesLabel}   ·   ${desde}  →  ${hasta}   ·   ${data.length} empleado${data.length !== 1 ? 's' : ''}`
  s.font  = { name: 'Calibri', size: 10, color: { argb: C.subtitleTxt } }
  s.alignment = { horizontal: 'center', vertical: 'middle' }
  s.fill  = fill(C.accent)
  ws.getRow(2).height = 18
  ws.getRow(3).height = 5

  // Fila 4: Encabezados
  const hr = ws.getRow(4)
  hr.height = 22
  COLS.forEach((col, i) => {
    const c = hr.getCell(i + 1)
    c.value = col.header
    c.font  = { name: 'Calibri', size: 10, bold: true, color: { argb: C.white } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.fill  = fill(C.blueDark)
    c.border = BA
  })
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: NC } }

  // Filas de datos (row 5+)
  data.forEach((emp, idx) => {
    const excelRow = 5 + idx
    const row  = ws.getRow(excelRow)
    row.height = 18
    const bg   = idx % 2 === 0 ? C.white : C.blueAlt
    const inj  = emp.inasistencias - emp.inasistenciasJustificadas
    const vHora = emp.sueldo > 0 ? emp.sueldo / 180 : null
    const inasTxt = emp.inasistenciasJustificadas > 0
      ? `${emp.inasistencias} (${emp.inasistenciasJustificadas} just.)`
      : emp.inasistencias
    // Horas extra como fracción de día, para formatear con numFmt '[h]:mm' y
    // poder referenciarla desde la fórmula de Monto Extra (H*24 = horas).
    const horasExtraDecimal = emp.minutosExtraTotal / 1440

    const values: (string | number | null)[] = [
      `${emp.apellido}, ${emp.nombre}`,
      emp.dni ?? '—',
      emp.sueldo > 0 ? emp.sueldo : null,
      vHora,
      emp.diasTrabajados,
      emp.tardanzas,
      inasTxt as string | number,
      horasExtraDecimal,
      emp.montoExtra,
      emp.presentismo,
      emp.totalLiquidarExacto,
      emp.totalLiquidar,
    ]

    values.forEach((val, i) => {
      const c = row.getCell(i + 1)
      c.value  = val ?? (i === COL_SUELDO || i === COL_VALOR_HORA ? 'Sin asignar' : '—')
      c.fill   = fill(bg)
      c.border = BA
      c.font   = { name: 'Calibri', size: 10, color: { argb: C.darkText } }
      c.alignment = { vertical: 'middle', horizontal: 'center' }

      if (i === 0) {
        c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.navyBg } }
        c.alignment = { horizontal: 'left', vertical: 'middle' }
      } else if (i === 1) {
        c.font = { name: 'Calibri', size: 10, color: { argb: C.grayText } }
      } else if (i === COL_SUELDO) {
        if (typeof c.value === 'number') { c.numFmt = '"$"\\ #,##0.00'; c.alignment = { horizontal: 'right', vertical: 'middle' } }
        else { c.font = { name: 'Calibri', size: 9, italic: true, color: { argb: C.grayText } } }
      } else if (i === COL_VALOR_HORA) {
        if (typeof c.value === 'number') {
          c.numFmt = '"$"\\ #,##0.00'; c.alignment = { horizontal: 'right', vertical: 'middle' }; c.font = { name: 'Calibri', size: 9, color: { argb: C.grayText } }
          // Fórmula: Sueldo Base / 180. Si el admin edita el sueldo en la planilla, recalcula solo.
          c.value = { formula: `IF(C${excelRow}>0,C${excelRow}/180,0)`, result: vHora ?? 0 }
        } else {
          c.font = { name: 'Calibri', size: 9, color: { argb: C.grayText } }
        }
      } else if (i === 5) {
        if (emp.tardanzas >= 3) { c.fill = fill(C.redBg); c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.redText } } }
        else if (emp.tardanzas > 0) { c.fill = fill(C.amberBg); c.font = { name: 'Calibri', size: 10, color: { argb: C.amberText } } }
      } else if (i === 6) {
        if (inj >= 1) { c.fill = fill(C.redBg); c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.redText } } }
        else if (emp.inasistencias > 0) { c.fill = fill(C.amberBg); c.font = { name: 'Calibri', size: 10, color: { argb: C.amberText } } }
      } else if (i === COL_HS_EXTRA) {
        c.numFmt = '[h]:mm'
        if (emp.montoExtra > 0) c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.accent } }
      } else if (i === COL_MONTO_EXTRA) {
        c.numFmt = '"$"\\ #,##0.00'; c.alignment = { horizontal: 'right', vertical: 'middle' }
        if (emp.montoExtra > 0) c.font = { name: 'Calibri', size: 10, color: { argb: C.accent } }
        // Fórmula: horas extra (col H, fracción de día × 24 = horas) × $/hora extra (col D)
        c.value = { formula: `IFERROR((H${excelRow}*24)*D${excelRow},0)`, result: emp.montoExtra }
      } else if (i === COL_PRESENTISMO) {
        c.numFmt = '"$"\\ #,##0.00'; c.alignment = { horizontal: 'right', vertical: 'middle' }
        if (emp.presentismo > 0) { c.fill = fill(C.greenBg); c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.greenText } } }
        else { c.fill = fill(C.redBg); c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.redText } } }
      } else if (i === COL_TOTAL_EXACTO) {
        c.numFmt = '"$"\\ #,##0.00'; c.alignment = { horizontal: 'right', vertical: 'middle' }
        c.font = { name: 'Calibri', size: 9, italic: true, color: { argb: C.grayText } }
        // Fórmula: Monto Extra + Presentismo, sin redondear (se conserva para auditoría).
        c.value = { formula: `I${excelRow}+J${excelRow}`, result: emp.totalLiquidarExacto }
      } else if (i === COL_TOTAL_LIQUIDAR) {
        c.numFmt = '"$"\\ #,##0.00'; c.alignment = { horizontal: 'right', vertical: 'middle' }
        c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.navyBg } }
        // Fórmula: Total Exacto redondeado al múltiplo de 100 más cercano.
        // MROUND redondea igual que Math.round(x/100)*100 para valores positivos.
        c.value = { formula: `MROUND(K${excelRow},100)`, result: emp.totalLiquidar }
      }
    })
  })

  // Separador y fila de totales
  const firstDataRow = 5
  const lastDataRow  = 4 + data.length
  ws.getRow(5 + data.length).height = 4
  const totRow = ws.getRow(6 + data.length)
  totRow.height = 24

  const sumSueldos = data.reduce((s, e) => s + e.sueldo, 0)
  const sumExtra   = data.reduce((s, e) => s + e.montoExtra, 0)
  const sumPres    = data.reduce((s, e) => s + e.presentismo, 0)
  const sumExacto  = data.reduce((s, e) => s + e.totalLiquidarExacto, 0)
  const sumTotal   = data.reduce((s, e) => s + e.totalLiquidar, 0)
  const sumTards   = data.reduce((s, e) => s + e.tardanzas, 0)
  const sumInasis  = data.reduce((s, e) => s + e.inasistencias, 0)
  const conPres    = data.filter(e => e.presentismo > 0).length
  const sinPres    = data.filter(e => e.presentismo === 0).length

  const totVals: (string | number | null)[] = [
    'TOTAL GENERAL', `${data.length} emp.`,
    sumSueldos, null, null, sumTards, sumInasis, null, sumExtra, sumPres, sumExacto, sumTotal,
  ]
  totVals.forEach((val, i) => {
    const c = totRow.getCell(i + 1)
    c.value  = val ?? ''
    c.fill   = fill(i === COL_TOTAL_LIQUIDAR ? C.greenTot : C.blueTot)
    c.border = i === COL_TOTAL_LIQUIDAR ? BGT : BM
    c.font   = { name: 'Calibri', size: i === COL_TOTAL_LIQUIDAR ? 12 : 10, bold: true, color: { argb: C.navyBg } }
    c.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle' }
    if ([COL_SUELDO, COL_MONTO_EXTRA, COL_PRESENTISMO, COL_TOTAL_EXACTO, COL_TOTAL_LIQUIDAR].includes(i)) {
      c.numFmt = '"$"\\ #,##0.00'; c.alignment = { horizontal: 'right', vertical: 'middle' }
    }
  })

  // Totales como fórmulas SUM sobre el rango de datos (se recalculan si se edita una fila).
  totRow.getCell(3).value  = { formula: `SUM(C${firstDataRow}:C${lastDataRow})`, result: sumSueldos }
  totRow.getCell(COL_MONTO_EXTRA + 1).value   = { formula: `SUM(I${firstDataRow}:I${lastDataRow})`, result: sumExtra }
  totRow.getCell(COL_PRESENTISMO + 1).value   = { formula: `SUM(J${firstDataRow}:J${lastDataRow})`, result: sumPres }
  totRow.getCell(COL_TOTAL_EXACTO + 1).value  = { formula: `SUM(K${firstDataRow}:K${lastDataRow})`, result: sumExacto }
  totRow.getCell(COL_TOTAL_LIQUIDAR + 1).value = { formula: `SUM(L${firstDataRow}:L${lastDataRow})`, result: sumTotal }

  // Fila de estadísticas
  const statNum = 8 + data.length
  ws.mergeCells(statNum, 1, statNum, NC)
  const stat = ws.getCell(statNum, 1)
  stat.value = `✔ Con presentismo: ${conPres}   ·   ✘ Sin presentismo: ${sinPres}   ·   Tardanzas totales: ${sumTards}   ·   Inasistencias totales: ${sumInasis}`
  stat.font  = { name: 'Calibri', size: 9, italic: true, color: { argb: C.grayText } }
  stat.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(statNum).height = 16
}

// ── Handler ──────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: admin } = await supabase
    .from('empleados').select('rol').eq('id', user.id).single()
  if (admin?.rol !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = request.nextUrl
  const mes        = searchParams.get('mes') ?? format(new Date(), 'yyyy-MM', { timeZone: TZ })
  const sucursalId = searchParams.get('sucursal_id')
  const empleadoId = searchParams.get('empleado_id')

  const [ano, mesNum] = mes.split('-').map(Number)
  const desde    = `${mes}-01`
  const hasta    = new Date(ano, mesNum, 0).toISOString().split('T')[0]
  const mesLabel = `${MESES_ES[mesNum - 1]} ${ano}`

  // ── Calcular datos por empleado (lógica compartida con el cierre automático) ──
  const resumenes = await calcularResumenesPeriodo(supabase, mes, sucursalId, empleadoId)
  const empData: EmpData[] = resumenes.map(r => ({
    nombre: r.nombre, apellido: r.apellido, dni: r.dni,
    sucursal: r.sucursalNombre,
    rol: r.rol,
    sueldo: r.sueldo, diasTrabajados: r.diasTrabajados, tardanzas: r.tardanzas,
    inasistencias: r.inasistencias, inasistenciasJustificadas: r.inasistenciasJustificadas,
    horasExtraFormato: r.horasExtraFormato, minutosExtraTotal: r.minutosExtraTotal, montoExtra: r.montoExtra,
    presentismo: r.presentismo, totalLiquidar: r.totalLiquidar, totalLiquidarExacto: r.totalLiquidarExacto,
  }))

  // ── Agrupar ────────────────────────────────────────────────────
  // rol=administracion → hoja "Administración"; resto → hoja por sucursal
  const grupos = new Map<string, typeof empData>()
  for (const emp of empData) {
    const key = emp.rol === 'administracion' ? '__admin__' : (emp.sucursal || '__sin_sucursal__')
    if (!grupos.has(key)) grupos.set(key, [])
    grupos.get(key)!.push(emp)
  }

  // Ordenar: sucursales alfabéticamente, luego administración, sin sucursal al final
  const allKeys = Array.from(grupos.keys())
  const orderedKeys: string[] = [
    ...allKeys.filter(k => k !== '__admin__' && k !== '__sin_sucursal__').sort(),
    ...(['__admin__', '__sin_sucursal__'].filter(k => grupos.has(k))),
  ]

  // ── Precalcular summaries para la hoja resumen (va primero) ───
  const summaries: GroupSummary[] = orderedKeys.map(key => {
    const label = key === '__admin__' ? 'Administración' : key === '__sin_sucursal__' ? 'Sin Sucursal' : key
    return grupoSummary(label, grupos.get(key)!)
  })

  // ── Construir workbook ─────────────────────────────────────────
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sistema de Asistencia'
  wb.created = new Date(); wb.modified = new Date()

  const generadoEn = new Date().toLocaleString('es-AR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  // Resumen primero
  if (summaries.length > 1) buildSummarySheet(wb, mesLabel, summaries, generadoEn)

  // Hojas por grupo
  for (const key of orderedKeys) {
    const label     = key === '__admin__' ? 'Administración' : key === '__sin_sucursal__' ? 'Sin Sucursal' : key
    const sheetName = label.substring(0, 31)
    buildGroupSheet(wb, sheetName, label, mesLabel, desde, hasta, grupos.get(key)!)
  }

  const buffer = await wb.xlsx.writeBuffer()

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="liquidacion-${mes}.xlsx"`,
    },
  })
}
