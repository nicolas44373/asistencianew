import { createClient } from '@/lib/supabase/server'
import { fechaHoyLocal, formatHora } from '@/lib/utils/tiempo'
import { DashboardRealtime } from './DashboardRealtime'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DashboardPage() {
  const supabase = createClient()
  const hoy = fechaHoyLocal()

  // Empleados activos con sus registros del día
  const { data: empleados } = await supabase
    .from('empleados')
    .select('id, nombre, apellido, sucursales(nombre)')
    .eq('activo', true)
    .order('apellido')

  const { data: registros } = await supabase
    .from('registros_asistencia')
    .select('*')
    .eq('fecha', hoy)

  const regPorEmpleado = new Map<string, typeof registros extends null ? never : NonNullable<typeof registros>[number][]>()
  for (const r of registros ?? []) {
    if (!regPorEmpleado.has(r.empleado_id)) regPorEmpleado.set(r.empleado_id, [])
    regPorEmpleado.get(r.empleado_id)!.push(r)
  }

  const total      = empleados?.length ?? 0
  const presentes  = (empleados ?? []).filter(e => regPorEmpleado.has(e.id)).length
  const ausentes   = total - presentes
  const tardanzas  = (registros ?? []).filter(r => r.tarde).length

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard — {hoy}</h1>

      {/* Cards de resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card label="Total empleados" value={total}    color="blue"   />
        <Card label="Presentes"       value={presentes} color="green"  />
        <Card label="Ausentes"        value={ausentes}  color="red"    />
        <Card label="Tardanzas"       value={tardanzas} color="yellow" />
      </div>

      {/* Tabla de estado del día */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-700">Estado de empleados hoy</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Empleado</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Sucursal</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Entrada</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Salida</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(empleados ?? []).map(emp => {
                const regs = regPorEmpleado.get(emp.id) ?? []
                const ultimo = regs[regs.length - 1]
                return (
                  <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-800">
                      {emp.apellido}, {emp.nombre}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {(emp as unknown as { sucursales?: { nombre: string } }).sucursales?.nombre ?? '—'}
                    </td>
                    <td className="px-6 py-4 font-mono text-gray-700">
                      {ultimo?.hora_entrada ? formatHora(ultimo.hora_entrada) : '—'}
                    </td>
                    <td className="px-6 py-4 font-mono text-gray-700">
                      {ultimo?.hora_salida ? formatHora(ultimo.hora_salida) : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <EstadoBadge regs={regs} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Componente cliente para actualización en tiempo real */}
      <DashboardRealtime />
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-50   text-blue-700   border-blue-200',
    green:  'bg-green-50  text-green-700  border-green-200',
    red:    'bg-red-50    text-red-700    border-red-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  }
  return (
    <div className={`rounded-2xl border p-5 ${colors[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-4xl font-bold mt-1">{value}</p>
    </div>
  )
}

function EstadoBadge({ regs }: { regs: Array<{ hora_entrada: string | null; hora_salida: string | null; tarde: boolean }> }) {
  if (regs.length === 0) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Ausente</span>
  }
  const ultimo = regs[regs.length - 1]
  if (ultimo.hora_salida) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Completó jornada</span>
  }
  if (ultimo.tarde) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Tardanza</span>
  }
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Presente</span>
}
