import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type CashFlowPoint = {
  month: string;
  income: number;
  expenses: number;
};

type CashFlowChartProps = {
  data: CashFlowPoint[];
  formatValue: (value: number) => string;
};

export default function CashFlowChart({ data, formatValue }: CashFlowChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
      <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
        <defs>
          <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#769450" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#769450" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="currentColor" opacity={0.08} />
        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#8b8d85", fontSize: 11 }} dy={10} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: "#8b8d85", fontSize: 11 }} tickFormatter={(value) => `${value / 1000}k`} />
        <Tooltip
          cursor={{ stroke: "#9aa38d", strokeDasharray: "3 3" }}
          contentStyle={{ borderRadius: 12, borderColor: "rgba(120,120,110,.2)", fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,.08)" }}
          formatter={(value) => formatValue(Number(value))}
        />
        <Area type="monotone" dataKey="income" stroke="#769450" strokeWidth={2.5} fill="url(#incomeGradient)" />
        <Area type="monotone" dataKey="expenses" stroke="#a7a9a1" strokeWidth={2} fill="transparent" strokeDasharray="5 5" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
