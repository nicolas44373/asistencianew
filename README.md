# Sistema de Control de Asistencia

PWA full-stack — Next.js 14 + Supabase + Tailwind CSS

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14 App Router + TypeScript |
| Base de datos | Supabase (PostgreSQL + Realtime) |
| Auth | Supabase Auth + RLS |
| PWA | next-pwa (instalable Android/iOS) |
| Tests | Vitest — 33 tests unitarios |
| Zona horaria | America/Argentina/Buenos_Aires |

## Setup rápido

1. Copiá `.env.example` a `.env.local` y completá las claves de Supabase
2. Ejecutá `supabase/migrations/001_schema.sql` luego `002_seed.sql` en el editor SQL de Supabase
3. Creá el primer admin manualmente en Supabase Auth e insertá su fila en `empleados` con `rol = 'admin'`
4. `npm install && npm run dev`

## Comandos

```bash
npm run dev          # Servidor de desarrollo
npm test             # Tests unitarios (33 cases)
npm run build        # Build producción + SW
```

## Rutas principales

| Ruta | Descripción |
|---|---|
| `/login` | Login móvil |
| `/fichar` | Fichaje en tiempo real |
| `/historial` | Historial personal 30 días |
| `/dashboard` | Dashboard admin (Realtime) |
| `/empleados` | ABM de empleados |
| `/asistencia` | Registros con filtros y edición |
| `/reportes` | Resumen mensual + Excel |
| `/config` | Valor hora extra y presentismo |

## Agregar sucursal

Solo SQL, sin tocar código:

```sql
INSERT INTO sucursales (nombre) VALUES ('Nueva Sucursal');
INSERT INTO horarios_sucursal (sucursal_id, turno, hora_entrada, hora_salida, umbral_extra, tolerancia_min)
VALUES ('<id>', 'unico', '08:00', '16:00', '16:30', 30);
```

## Deploy en Vercel

Conectá el repo, agregá las 3 variables de entorno del `.env.example` y Vercel hace el resto.

---

## Getting Started (original)

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
