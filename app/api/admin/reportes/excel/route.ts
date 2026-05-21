import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularMes } from '@/lib/reglas/calcularMes'
import { calcularInasistencias, calcularInasistenciasJustificadas } from '@/lib/reglas/calcularInasistencias'
import type { HorarioSucursal, HorarioEmpleado, RegistroAsistencia } from '@/lib/types/database'
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
  { header: '★ TOTAL LIQUIDAR',   w: 20 },
]
const NC = COLS.length

interface EmpData {
  nombre: string; apellido: string; dni: string | null; sueldo: number
  diasTrabajados: number; tardanzas: number
  inasistencias: number; inasistenciasJustificadas: number
  horasExtraFormato: string; montoExtra: number
  presentismo: number; totalLiquidar: number
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
    const row  = ws.getRow(5 + idx)
    row.height = 18
    const bg   = idx % 2 === 0 ? C.white : C.blueAlt
    const inj  = emp.inasistencias - emp.inasistenciasJustificadas
    const vHora = emp.sueldo > 0 ? emp.sueldo / 180 : null
    const inasTxt = emp.inasistenciasJustificadas > 0
      ? `${emp.inasistencias} (${emp.inasistenciasJustificadas} just.)`
      : emp.inasistencias

    const values: (string | number | null)[] = [
      `${emp.apellido}, ${emp.nombre}`,
      emp.dni ?? '—',
      emp.sueldo > 0 ? emp.sueldo : null,
      vHora,
      emp.diasTrabajados,
      emp.tardanzas,
      inasTxt as string | number,
      emp.horasExtraFormato || '—',
      emp.montoExtra,
      emp.presentismo,
      emp.totalLiquidar,
    ]

    values.forEach((val, i) => {
      const c = row.getCell(i + 1)
      c.value  = val ?? (i === 2 || i === 3 ? 'Sin asignar' : '—')
      c.fill   = fill(bg)
      c.border = BA
      c.font   = { name: 'Calibri', size: 10, color: { argb: C.darkText } }
      c.alignment = { vertical: 'middle', horizontal: 'center' }

      if (i === 0) {
        c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.navyBg } }
        c.alignment = { horizontal: 'left', vertical: 'middle' }
      } else if (i === 1) {
        c.font = { name: 'Calibri', size: 10, color: { argb: C.grayText } }
      } else if (i === 2) {
        if (typeof c.value === 'number') { c.numFmt = '"$"\\ #,##0.00'; c.alignment = { horizontal: 'right', vertical: 'middle' } }
        else { c.font = { name: 'Calibri', size: 9, italic: true, color: { argb: C.grayText } } }
      } else if (i === 3) {
        if (typeof c.value === 'number') { c.numFmt = '"$"\\ #,##0.00'; c.alignment = { horizontal: 'right', vertical: 'middle' }; c.font = { name: 'Calibri', size: 9, color: { argb: C.grayText } } }
        else { c.font = { name: 'Calibri', size: 9, color: { argb: C.grayText } } }
      } else if (i === 5) {
        if (emp.tardanzas >= 3) { c.fill = fill(C.redBg); c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.redText } } }
        else if (emp.tardanzas > 0) { c.fill = fill(C.amberBg); c.font = { name: 'Calibri', size: 10, color: { argb: C.amberText } } }
      } else if (i === 6) {
        if (inj >= 1) { c.fill = fill(C.redBg); c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.redText } } }
        else if (emp.inasistencias > 0) { c.fill = fill(C.amberBg); c.font = { name: 'Calibri', size: 10, color: { argb: C.amberText } } }
      } else if (i === 7) {
        if (emp.montoExtra > 0) c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.accent } }
      } else if (i === 8) {
        c.numFmt = '"$"\\ #,##0.00'; c.alignment = { horizontal: 'right', vertical: 'middle' }
        if (emp.montoExtra > 0) c.font = { name: 'Calibri', size: 10, color: { argb: C.accent } }
      } else if (i === 9) {
        c.numFmt = '"$"\\ #,##0.00'; c.alignment = { horizontal: 'right', vertical: 'middle' }
        if (emp.presentismo > 0) { c.fill = fill(C.greenBg); c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.greenText } } }
        else { c.fill = fill(C.redBg); c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.redText } } }
      } else if (i === 10) {
        c.numFmt = '"$"\\ #,##0.00'; c.alignment = { horizontal: 'right', vertical: 'middle' }
        c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.navyBg } }
      }
    })
  })

  // Separador y fila de totales
  ws.getRow(5 + data.length).height = 4
  const totRow = ws.getRow(6 + data.length)
  totRow.height = 24

  const sumSueldos = data.reduce((s, e) => s + e.sueldo, 0)
  const sumExtra   = data.reduce((s, e) => s + e.montoExtra, 0)
  const sumPres    = data.reduce((s, e) => s + e.presentismo, 0)
  const sumTotal   = data.reduce((s, e) => s + e.totalLiquidar, 0)
  const sumTards   = data.reduce((s, e) => s + e.tardanzas, 0)
  const sumInasis  = data.reduce((s, e) => s + e.inasistencias, 0)
  const conPres    = data.filter(e => e.presentismo > 0).length
  const sinPres    = data.filter(e => e.presentismo === 0).length

  const totVals: (string | number | null)[] = [
    'TOTAL GENERAL', `${data.length} emp.`,
    sumSueldos, null, null, sumTards, sumInasis, null, sumExtra, sumPres, sumTotal,
  ]
  totVals.forEach((val, i) => {
    const c = totRow.getCell(i + 1)
    c.value  = val ?? ''
    c.fill   = fill(i === 10 ? C.greenTot : C.blueTot)
    c.border = i === 10 ? BGT : BM
    c.font   = { name: 'Calibri', size: i === 10 ? 12 : 10, bold: true, color: { argb: C.navyBg } }
    c.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle' }
    if ([2, 8, 9, 10].includes(i)) { c.numFmt = '"$"\\ #,##0.00'; c.alignment = { horizontal: 'right', vertical: 'middle' } }
  })

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

  const [ano, mesNum] = mes.split('-').map(Number)
  const desde    = `${mes}-01`
  const hasta    = new Date(ano, mesNum, 0).toISOString().split('T')[0]
  const mesLabel = `${MESES_ES[mesNum - 1]} ${ano}`

  let empQuery = supabase.from('empleados').select('*, sucursales(id, nombre)').eq('activo', true).neq('rol', 'admin').order('apellido')
  if (sucursalId) empQuery = empQuery.eq('sucursal_id', sucursalId)

  const [
    { data: empleados },
    { data: registros },
    { data: config },
    { data: horariosSuc },
    { data: horariosEmp },
    { data: justificaciones },
  ] = await Promise.all([
    empQuery,
    supabase.from('registros_asistencia').select('empleado_id, fecha, hora_entrada, tarde, minutos_extra').gte('fecha', desde).lte('fecha', hasta),
    supabase.from('config_liquidacion').select('monto_presentismo').lte('vigente_desde', hasta).order('vigente_desde', { ascending: false }).limit(1).single(),
    supabase.from('horarios_sucursal').select('*'),
    supabase.from('horarios_empleado').select('*'),
    supabase.from('justificaciones').select('empleado_id, fecha, justificada').gte('fecha', desde).lte('fecha', hasta),
  ])

  const montoPresentismo = config ? Number(config.monto_presentismo) : 0

  const horPorSuc = new Map<string, HorarioSucursal[]>()
  for (const h of (horariosSuc ?? []) as HorarioSucursal[]) {
    if (!horPorSuc.has(h.sucursal_id)) horPorSuc.set(h.sucursal_id, [])
    horPorSuc.get(h.sucursal_id)!.push(h)
  }
  const horPorEmp = new Map<string, HorarioEmpleado[]>()
  for (const h of (horariosEmp ?? []) as HorarioEmpleado[]) {
    if (!horPorEmp.has(h.empleado_id)) horPorEmp.set(h.empleado_id, [])
    horPorEmp.get(h.empleado_id)!.push(h)
  }

  // ── Calcular datos por empleado ────────────────────────────────
  const empData = (empleados ?? []).map(emp => {
    const regs    = ((registros ?? []) as RegistroAsistencia[]).filter(r => r.empleado_id === emp.id)
    const sueldo  = Number(emp.sueldo ?? 0)
    const pers    = horPorEmp.get(emp.id) ?? []
    const horEf   = pers.length > 0 ? pers : (emp.sucursal_id ? horPorSuc.get(emp.sucursal_id) ?? [] : [])
    const fi      = new Date((emp as { created_at: string }).created_at).toLocaleDateString('sv-SE', { timeZone: TZ })
    const fjust   = new Set((justificaciones ?? []).filter((j: { empleado_id: string; justificada: boolean }) => j.empleado_id === emp.id && j.justificada).map((j: { fecha: string }) => j.fecha))
    const finjust = new Set((justificaciones ?? []).filter((j: { empleado_id: string; justificada: boolean }) => j.empleado_id === emp.id && !j.justificada).map((j: { fecha: string }) => j.fecha))
    const inas    = calcularInasistencias(regs, horEf, mes, fi, finjust)
    const inasJ   = calcularInasistenciasJustificadas(regs, horEf, mes, fjust, fi)
    const res     = calcularMes(regs, sueldo, montoPresentismo, inas, inasJ, finjust)
    return {
      nombre: emp.nombre, apellido: emp.apellido, dni: emp.dni as string | null,
      sucursal: (emp.sucursales as { nombre: string } | null)?.nombre ?? '',
      rol: (emp as { rol: string }).rol,
      sueldo, diasTrabajados: res.diasTrabajados, tardanzas: res.tardanzas,
      inasistencias: res.inasistencias, inasistenciasJustificadas: res.inasistenciasJustificadas,
      horasExtraFormato: res.horasExtraFormato, montoExtra: res.montoExtra,
      presentismo: res.presentismo, totalLiquidar: res.totalLiquidar,
    }
  })

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
