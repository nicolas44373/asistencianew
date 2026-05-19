import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularMes } from '@/lib/reglas/calcularMes'
import { calcularInasistencias } from '@/lib/reglas/calcularInasistencias'
import type { HorarioSucursal } from '@/lib/types/database'
import ExcelJS from 'exceljs'
import { format } from 'date-fns-tz'

const TZ = 'America/Argentina/Buenos_Aires'

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
  const desde = `${mes}-01`
  const hasta = new Date(ano, mesNum, 0).toISOString().split('T')[0]

  let empQuery = supabase
    .from('empleados')
    .select('*, sucursales(nombre)')
    .eq('activo', true)
    .order('apellido')
  if (sucursalId) empQuery = empQuery.eq('sucursal_id', sucursalId)

  const { data: empleados } = await empQuery
  const { data: registros  } = await supabase
    .from('registros_asistencia')
    .select('*')
    .gte('fecha', desde)
    .lte('fecha', hasta)

  const { data: config } = await supabase
    .from('config_liquidacion')
    .select('monto_presentismo')
    .lte('vigente_desde', hasta)
    .order('vigente_desde', { ascending: false })
    .limit(1)
    .single()

  const { data: horarios } = await supabase
    .from('horarios_sucursal').select('*')

  const montoPresentismo = config ? Number(config.monto_presentismo) : 0

  const horariosPorSucursal = new Map<string, HorarioSucursal[]>()
  for (const h of (horarios ?? []) as HorarioSucursal[]) {
    if (!horariosPorSucursal.has(h.sucursal_id)) horariosPorSucursal.set(h.sucursal_id, [])
    horariosPorSucursal.get(h.sucursal_id)!.push(h)
  }

  const workbook  = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(`Reporte ${mes}`)

  worksheet.columns = [
    { header: 'Apellido',       key: 'apellido',    width: 20 },
    { header: 'Nombre',         key: 'nombre',      width: 20 },
    { header: 'Sucursal',       key: 'sucursal',    width: 20 },
    { header: 'Sueldo',         key: 'sueldo',      width: 16 },
    { header: 'Valor hs extra', key: 'valor_hora',  width: 16 },
    { header: 'Días trabajados',  key: 'dias',          width: 16 },
    { header: 'Tardanzas',        key: 'tardanzas',     width: 12 },
    { header: 'Inasistencias',    key: 'inasistencias', width: 14 },
    { header: 'Horas extra',      key: 'horas_extra',   width: 14 },
    { header: 'Monto extra',    key: 'monto_extra', width: 14 },
    { header: 'Presentismo',    key: 'presentismo', width: 14 },
    { header: 'Total',          key: 'total',       width: 14 },
  ]

  // Estilo encabezado
  const headerRow = worksheet.getRow(1)
  headerRow.font  = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  for (const emp of empleados ?? []) {
    const regsEmp     = (registros ?? []).filter(r => r.empleado_id === emp.id)
    const sueldo      = Number(emp.sueldo ?? 0)
    const horariosEmp   = emp.sucursal_id ? (horariosPorSucursal.get(emp.sucursal_id) ?? []) : []
    const fechaIngreso  = new Date((emp as { created_at: string }).created_at).toLocaleDateString('sv-SE', { timeZone: TZ })
    const inasistencias = calcularInasistencias(regsEmp, horariosEmp, mes, fechaIngreso)
    const resumen     = calcularMes(regsEmp, sueldo, montoPresentismo, inasistencias)
    const valorHora   = sueldo > 0 ? sueldo / 180 : 0

    worksheet.addRow({
      apellido:      emp.apellido,
      nombre:        emp.nombre,
      sucursal:      (emp.sucursales as { nombre: string } | null)?.nombre ?? '',
      sueldo:        sueldo > 0 ? fmt(sueldo) : 'Sin asignar',
      valor_hora:    valorHora > 0 ? fmt(valorHora) : '—',
      dias:          resumen.diasTrabajados,
      tardanzas:     resumen.tardanzas,
      inasistencias: resumen.inasistencias,
      horas_extra:   resumen.horasExtraFormato,
      monto_extra:   fmt(resumen.montoExtra),
      presentismo:   fmt(resumen.presentismo),
      total:         fmt(resumen.totalLiquidar),
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte-${mes}.xlsx"`,
    },
  })
}
