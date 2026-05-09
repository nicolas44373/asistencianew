// ── Tipos derivados del esquema de Supabase ──────────────────

export type Rol = 'empleado' | 'admin'
export type Turno = 'mañana' | 'tarde' | 'unico'

export interface Sucursal {
  id: string
  nombre: string
  latitud?: number | null
  longitud?: number | null
  radio_metros?: number
  created_at?: string
}

export interface HorarioSucursal {
  id: string
  sucursal_id: string
  turno: Turno
  hora_entrada: string   // "HH:MM:SS"
  hora_salida: string
  umbral_extra: string
  tolerancia_min: number
  es_sabado: boolean
}

export interface Empleado {
  id: string
  nombre: string
  apellido: string
  dni: string | null
  sucursal_id: string | null
  rol: Rol
  activo: boolean
  sueldo: number | null
  device_id: string | null
  created_at: string
  sucursales?: Sucursal
}

export interface RegistroAsistencia {
  id: string
  empleado_id: string
  fecha: string          // "YYYY-MM-DD"
  turno: Turno | null
  hora_entrada: string | null   // ISO timestamptz
  hora_salida: string | null
  tarde: boolean
  egreso_anticipado: boolean
  minutos_extra: number
  editado_por: string | null
  motivo_edicion: string | null
  created_at: string
  empleados?: Empleado
}

export interface ConfigLiquidacion {
  id: string
  valor_hora_extra: number
  monto_presentismo: number
  vigente_desde: string  // "YYYY-MM-DD"
  created_at: string
}

// Tipos para resultados de queries con joins (el campo sucursales de Empleado es sobreescrito)
export type EmpleadoConSucursal = Omit<Empleado, 'sucursales'> & {
  sucursales: { nombre: string } | null
}

export type RegistroConEmpleado = Omit<RegistroAsistencia, 'empleados'> & {
  empleados: {
    id: string
    nombre: string
    apellido: string
    sucursal_id: string | null
    sucursales: { nombre: string } | null
  } | null
}

export interface ResumenMensual {
  diasTrabajados: number
  tardanzas: number
  minutosExtraTotal: number
  horasExtraFormato: string
  montoExtra: number
  presentismo: number
  totalLiquidar: number
}
