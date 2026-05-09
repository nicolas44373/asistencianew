import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { calcularTarde } from '@/lib/reglas/calcularTarde'
import { calcularExtra } from '@/lib/reglas/calcularExtra'
import { calcularEgresoAnticipado } from '@/lib/reglas/calcularEgresoAnticipado'
import { distanciaMetros } from '@/lib/utils/geo'
import { fechaHoyLocal } from '@/lib/utils/tiempo'
import type { HorarioSucursal } from '@/lib/types/database'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    // 1. Verificar sesión server-side
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // 2. Leer body: GPS + device ID
    let lat: number | null = null
    let lng: number | null = null
    let deviceId: string | null = null
    try {
      const body = await request.json()
      if (typeof body?.lat === 'number' && typeof body?.lng === 'number') {
        lat = body.lat
        lng = body.lng
      }
      if (typeof body?.deviceId === 'string' && body.deviceId.length > 0) {
        deviceId = body.deviceId
      }
    } catch { /* body vacío → se trata abajo */ }

    if (lat === null || lng === null) {
      return NextResponse.json({ error: 'Se requiere ubicación GPS para fichar' }, { status: 400 })
    }
    if (!deviceId) {
      return NextResponse.json({ error: 'Dispositivo no identificado' }, { status: 400 })
    }

    // 3. Obtener datos del empleado (sucursal + device registrado)
    const { data: empleado, error: empError } = await supabase
      .from('empleados')
      .select('id, sucursal_id, device_id, sucursales(id, nombre, latitud, longitud, radio_metros)')
      .eq('id', user.id)
      .eq('activo', true)
      .single()

    if (empError || !empleado) {
      return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })
    }

    // 4. Validar dispositivo
    const deviceRegistrado = (empleado as { device_id: string | null }).device_id
    if (deviceRegistrado && deviceRegistrado !== deviceId) {
      return NextResponse.json(
        { error: 'Este dispositivo no está autorizado. Contactá a tu administrador.' },
        { status: 403 }
      )
    }

    // Si el empleado aún no tiene dispositivo, verificar que el dispositivo no pertenezca a otro empleado
    // Se usa adminClient para evitar que RLS oculte registros de otros empleados
    if (!deviceRegistrado) {
      const adminClient = createAdminClient()
      const { data: otroEmpleado } = await adminClient
        .from('empleados')
        .select('id')
        .eq('device_id', deviceId)
        .neq('id', user.id)
        .maybeSingle()

      if (otroEmpleado) {
        return NextResponse.json(
          { error: 'Este dispositivo ya está registrado a otro empleado. Contactá a tu administrador.' },
          { status: 403 }
        )
      }
    }

    // 5. Validar geofencing
    const sucursal = empleado.sucursales as unknown as {
      id: string; nombre: string
      latitud: number | null; longitud: number | null; radio_metros: number
    } | null

    if (sucursal?.latitud != null && sucursal?.longitud != null) {
      const distancia = Math.round(distanciaMetros(lat, lng, sucursal.latitud, sucursal.longitud))
      if (distancia > sucursal.radio_metros) {
        return NextResponse.json(
          {
            error: `Estás a ${distancia} m del establecimiento. Necesitás estar a menos de ${sucursal.radio_metros} m para fichar.`,
            distancia,
            radio: sucursal.radio_metros,
          },
          { status: 403 }
        )
      }
    }

    // 6. Timestamp del servidor
    const ahora    = new Date()
    const fechaHoy = fechaHoyLocal()

    // 7. Determinar turno activo
    const { data: horarios } = await supabase
      .from('horarios_sucursal')
      .select('*')
      .eq('sucursal_id', empleado.sucursal_id)

    if (!horarios || horarios.length === 0) {
      return NextResponse.json({ error: 'Sin horario configurado' }, { status: 400 })
    }

    const turnoActivo = detectarTurnoActivo(ahora, horarios as HorarioSucursal[])
    if (!turnoActivo) {
      return NextResponse.json({ error: 'No hay turno activo en este momento' }, { status: 400 })
    }

    // 8. Verificar registro existente del día
    const { data: registroExistente } = await supabase
      .from('registros_asistencia')
      .select('*')
      .eq('empleado_id', user.id)
      .eq('fecha', fechaHoy)
      .eq('turno', turnoActivo.turno)
      .single()

    // 9. Registrar ingreso o salida
    let respuesta: NextResponse

    if (!registroExistente || !registroExistente.hora_entrada) {
      const tarde = calcularTarde(ahora, turnoActivo)
      const { data: nuevo, error: insError } = await supabase
        .from('registros_asistencia')
        .insert({ empleado_id: user.id, fecha: fechaHoy, turno: turnoActivo.turno, hora_entrada: ahora.toISOString(), tarde })
        .select()
        .single()

      if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })
      respuesta = NextResponse.json({ tipo: 'ingreso', registro: nuevo })

    } else if (registroExistente.hora_entrada && !registroExistente.hora_salida) {
      const minutosExtra     = calcularExtra(ahora, turnoActivo)
      const egresoAnticipado = calcularEgresoAnticipado(ahora, turnoActivo)
      const { data: actualizado, error: updError } = await supabase
        .from('registros_asistencia')
        .update({ hora_salida: ahora.toISOString(), minutos_extra: minutosExtra, egreso_anticipado: egresoAnticipado })
        .eq('id', registroExistente.id)
        .select()
        .single()

      if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })
      respuesta = NextResponse.json({ tipo: 'salida', registro: actualizado })

    } else {
      respuesta = NextResponse.json({ tipo: 'completo', registro: registroExistente })
    }

    // 10. Registrar dispositivo si es el primer uso
    if (!deviceRegistrado) {
      await supabase
        .from('empleados')
        .update({ device_id: deviceId })
        .eq('id', user.id)
    }

    return respuesta
  } catch (err) {
    console.error('[api/fichar]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const fechaHoy = fechaHoyLocal()

    const { data: registros } = await supabase
      .from('registros_asistencia')
      .select('*')
      .eq('empleado_id', user.id)
      .eq('fecha', fechaHoy)
      .order('hora_entrada', { ascending: true })

    return NextResponse.json({ registros: registros ?? [] })
  } catch (err) {
    console.error('[api/fichar GET]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// ── Helpers ───────────────────────────────────────────────────

function horaStrAMinutos(horaStr: string): number {
  const [h, m] = horaStr.split(':').map(Number)
  return h * 60 + m
}

function detectarTurnoActivo(ahora: Date, horarios: HorarioSucursal[]): HorarioSucursal | null {
  const localStr = ahora.toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const ahoraMin = horaStrAMinutos(localStr)

  // Determinar si hoy es sábado en horario local de Argentina
  const localDate = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const esSabado  = localDate.getDay() === 6

  // En sábado: usar filas es_sabado=true si existen; si no, caer a las de lunes-viernes
  const sabadoRows = horarios.filter(h => h.es_sabado)
  const horariosDelDia = esSabado && sabadoRows.length > 0
    ? sabadoRows
    : horarios.filter(h => !h.es_sabado)

  for (const h of horariosDelDia) {
    const inicio = horaStrAMinutos(h.hora_entrada) - 60
    const fin    = horaStrAMinutos(h.umbral_extra)  + 60
    if (ahoraMin >= inicio && ahoraMin <= fin) return h
  }
  return null
}
