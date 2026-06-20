import { TrendingDown, TrendingUp } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  up: boolean;
  emoji: string;
}

export function StatCard({ title, value, change, up, emoji }: StatCardProps) {
  return (
    <div className="card p-5 flex items-center justify-between gap-4">
      <div className="space-y-1">
        <p style={{ color: 'var(--text-muted)' }} className="text-[11px] font-semibold uppercase tracking-wider">{title}</p>
        <p className="text-[1.4rem] font-extrabold leading-none">{value}</p>
        <div className={`flex items-center gap-1 text-[10px] font-bold ${up ? 'text-emerald-500' : 'text-rose-500'}`}>
          {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {change}
        </div>
      </div>
      <div className="icon-badge h-12 w-12 rounded-2xl flex items-center justify-center text-2xl shrink-0">{emoji}</div>
    </div>
  );
}
