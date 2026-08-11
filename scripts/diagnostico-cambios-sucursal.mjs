// Diagnóstico de SOLO LECTURA: detecta empleados cuyo historial de registros_asistencia
// contiene turnos que son estructuralmente imposibles en su sucursal ACTUAL
// (ej. turno 'mañana'/'tarde' registrado mientras hoy figura en Juramento, que es
// turno único; o 'unico' mientras hoy figura en Juan B. Justo, que no tiene turno único).
// No escribe nada en la base.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

function loadEnvLocal() {
  const content = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  const env = {}
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

const env = loadEnvLocal()
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: sucursales, error: eSuc } = await supabase.from('sucursales').select('id, nombre')
if (eSuc) { console.error('Error sucursales:', eSuc.message); process.exit(1) }

const { data: horariosSuc, error: eHor } = await supabase.from('horarios_sucursal').select('sucursal_id, turno')
if (eHor) { console.error('Error horarios_sucursal:', eHor.message); process.exit(1) }

const turnosPorSucursal = new Map()
for (const h of horariosSuc) {
  if (!turnosPorSucursal.has(h.sucursal_id)) turnosPorSucursal.set(h.sucursal_id, new Set())
  turnosPorSucursal.get(h.sucursal_id).add(h.turno)
}

const { data: empleados, error: eEmp } = await supabase
  .from('empleados')
  .select('id, nombre, apellido, sucursal_id, rol, created_at')
  .eq('rol', 'empleado')

if (eEmp) { console.error('Error empleados:', eEmp.message); process.exit(1) }

const { data: registros, error: eReg } = await supabase
  .from('registros_asistencia')
  .select('empleado_id, fecha, turno')
  .not('turno', 'is', null)
  .order('fecha', { ascending: true })

if (eReg) { console.error('Error registros:', eReg.message); process.exit(1) }

const regsPorEmpleado = new Map()
for (const r of registros) {
  if (!regsPorEmpleado.has(r.empleado_id)) regsPorEmpleado.set(r.empleado_id, [])
  regsPorEmpleado.get(r.empleado_id).push(r)
}

const nombreSucursal = id => sucursales.find(s => s.id === id)?.nombre ?? '(sin sucursal)'

console.log(`Empleados analizados: ${empleados.length}`)
console.log('---')

let casosDetectados = 0

for (const emp of empleados) {
  const regs = regsPorEmpleado.get(emp.id) ?? []
  if (regs.length === 0 || !emp.sucursal_id) continue

  const turnosActuales = turnosPorSucursal.get(emp.sucursal_id) ?? new Set()
  const registrosImposibles = regs.filter(r => !turnosActuales.has(r.turno))

  if (registrosImposibles.length === 0) continue

  casosDetectados++
  const fechas = registrosImposibles.map(r => r.fecha).sort()
  const primeraFechaImposible = fechas[0]
  const ultimaFechaImposible  = fechas[fechas.length - 1]

  // Primera fecha en la que aparece un turno COMPATIBLE con la sucursal actual
  // (candidato a fecha de traslado real)
  const fechasCompatibles = regs
    .filter(r => turnosActuales.has(r.turno))
    .map(r => r.fecha)
    .sort()
  const primeraFechaCompatible = fechasCompatibles[0] ?? null

  console.log(`⚠ ${emp.apellido}, ${emp.nombre}  (id: ${emp.id})`)
  console.log(`  Sucursal actual: ${nombreSucursal(emp.sucursal_id)}  (turnos válidos: ${[...turnosActuales].join(', ') || '—'})`)
  console.log(`  Alta del empleado (created_at): ${new Date(emp.created_at).toISOString().slice(0, 10)}`)
  console.log(`  Registros con turno incompatible con la sucursal actual: ${registrosImposibles.length}`)
  console.log(`    Rango: ${primeraFechaImposible} → ${ultimaFechaImposible}`)
  console.log(`  Primer registro YA compatible con la sucursal actual: ${primeraFechaCompatible ?? '(ninguno)'}`)
  console.log(`  → Candidato a fecha de traslado: ${primeraFechaCompatible ?? '(no se pudo estimar)'}`)
  console.log('')
}

if (casosDetectados === 0) {
  console.log('No se detectaron empleados con turnos incompatibles con su sucursal actual.')
} else {
  console.log(`---\nTotal de casos detectados: ${casosDetectados}`)
}
