interface Props {
  eyebrow: string
  title: string
  subtitle?: string
}

export function PageHeader({ eyebrow, title, subtitle }: Props) {
  return (
    <div className="mb-6">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-blue-600 mb-1">
        {eyebrow}
      </span>
      <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
    </div>
  )
}
