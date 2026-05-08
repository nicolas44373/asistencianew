'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns-tz'
import { es } from 'date-fns/locale'

const TZ = 'America/Argentina/Buenos_Aires'

export function RelojTiempoReal() {
  const [hora, setHora] = useState('')
  const [fecha, setFecha] = useState('')

  useEffect(() => {
    function tick() {
      const now = new Date()
      setHora(format(now, 'HH:mm:ss', { timeZone: TZ }))
      setFecha(format(now, "EEEE d 'de' MMMM", { timeZone: TZ, locale: es }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="text-center">
      <div className="text-5xl font-mono font-bold text-white tracking-wider">{hora}</div>
      <div className="text-blue-200 mt-1 capitalize text-sm">{fecha}</div>
    </div>
  )
}
