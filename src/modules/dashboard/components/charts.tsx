"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  todo: "#64748b",
  in_progress: "#2563eb",
  review: "#7c3aed",
  done: "#16a34a",
  blocked: "#dc2626",
};

const STATUS_LABELS: Record<string, string> = {
  todo: "À faire",
  in_progress: "En cours",
  review: "En revue",
  done: "Terminée",
  blocked: "Bloquée",
};

export function TaskStatusChart({ data }: { data: { status: string; count: number }[] }) {
  const prepared = data.map((entry) => ({
    ...entry,
    label: STATUS_LABELS[entry.status] ?? entry.status,
    color: STATUS_COLORS[entry.status] ?? "#64748b",
  }));

  if (prepared.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Aucune tâche enregistrée.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={prepared}
          dataKey="count"
          nameKey="label"
          innerRadius={52}
          outerRadius={80}
          paddingAngle={2}
        >
          {prepared.map((entry) => (
            <Cell key={entry.status} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: unknown) => [`${Number(value ?? 0)} tâche(s)`, ""]}
          contentStyle={{ borderRadius: 10, fontSize: 12, borderColor: "#e2e8f0" }}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function FinanceChart({
  data,
  currency,
}: {
  data: { month: string; revenue: number; expense: number }[];
  currency: string;
}) {
  const digits = currency === "XOF" || currency === "XAF" ? 0 : 2;
  const prepared = data.map((entry) => ({
    month: entry.month,
    Revenus: Number((entry.revenue / 10 ** digits).toFixed(2)),
    Dépenses: Number((entry.expense / 10 ** digits).toFixed(2)),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={prepared} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
            <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#dc2626" stopOpacity={0.22} />
            <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
        <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={70} />
        <Tooltip
          contentStyle={{ borderRadius: 10, fontSize: 12, borderColor: "#e2e8f0" }}
          formatter={(value: unknown) =>
            new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(Number(value ?? 0))
          }
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="Revenus"
          stroke="#2563eb"
          fill="url(#revenueGradient)"
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="Dépenses"
          stroke="#dc2626"
          fill="url(#expenseGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SimpleBarChart({
  data,
  color = "#2563eb",
  unit = "",
}: {
  data: { label: string; value: number }[];
  color?: string;
  unit?: string;
}) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Aucune donnée disponible.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" interval={0} angle={-12} dy={6} height={44} />
        <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
        <Tooltip
          contentStyle={{ borderRadius: 10, fontSize: 12, borderColor: "#e2e8f0" }}
          formatter={(value: unknown) => [`${Number(value ?? 0)}${unit}`, ""]}
        />
        <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}
