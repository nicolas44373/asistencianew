import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { calcularResumenesPeriodo } from '@/lib/reportes/calcularResumenesPeriodo'
import { mesAnteriorLocal } from '@/lib/utils/tiempo'

/**
 * Job de cierre mensual automático: calcula y congela (snapshot) el resumen de
 * liquidación de todos los empleados para el mes que acaba de cerrar — días
 * trabajados, tardanzas, inasistencias, horas extra y monto a pagar — y lo guarda
 * en `cierres_periodicos`. Al quedar congelado, sigue siendo consultable aunque
 * después se corrijan registros de asistencia retroactivamente.
 *
 * Se ejecuta vía Vercel Cron (ver vercel.json) el día 1 de cada mes, ya con el
 * mes anterior completamente cerrado. Protegido con CRON_SECRET.
 * Acepta opcionalmente ?periodo=YYYY-MM (con el mismo secreto) para recalcular o
 * generar manualmente el cierre de un mes puntual.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const periodoOverride = request.nextUrl.searchParams.get('periodo')
  const periodo = periodoOverride || mesAnteriorLocal()

  const [ano, mesNum] = periodo.split('-').map(Number)
  const fechaDesde = `${periodo}-01`
  const fechaHasta = new Date(ano, mesNum, 0).toISOString().split('T')[0]

  const supabase = createAdminClient()

  const resumenes = await calcularResumenesPeriodo(supabase, periodo, null)

  const { error } = await supabase
    .from('cierres_periodicos')
    .upsert(
      {
        tipo: 'mensual',
        periodo,
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        generado_en: new Date().toISOString(),
        datos: resumenes,
      },
      { onConflict: 'tipo,periodo' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    periodo,
    empleados: resumenes.length,
    totalLiquidar: resumenes.reduce((s, r) => s + r.totalLiquidar, 0),
  })
}
