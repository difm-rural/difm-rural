'use client'

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const STATUS_COLORS: Record<string, string> = {
  open: '#d18a22', accepted: '#3f7d62', in_progress: '#2d6a4f',
  awaiting_completion: '#4f78a8', completed: '#7b8f82', cancelled: '#b54a4a',
  Active: '#2d6a4f', Paused: '#a4ada7',
}

export function JobsTimeline({ data }: { data: { label: string; posted: number; open: number | null }[] }) {
  return (
    <div className="chart-height" aria-label="Jobs posted and open job inventory chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#e8ebe8" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6f7872' }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6f7872' }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ border: '1px solid #dfe4df', borderRadius: 10, boxShadow: '0 10px 30px rgba(23,37,29,.08)' }} />
          <Line type="monotone" dataKey="posted" name="Jobs posted" stroke="#2d6a4f" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="open" name="Open inventory" stroke="#d18a22" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function StatusBars({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div className="chart-height small" aria-label="Status distribution chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 12, bottom: 0 }}>
          <CartesianGrid stroke="#edf0ed" horizontal={false} />
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis dataKey="name" type="category" width={112} tick={{ fontSize: 11, fill: '#536159' }} tickLine={false} axisLine={false} tickFormatter={value => value.replaceAll('_', ' ')} />
          <Tooltip cursor={{ fill: '#f4f6f4' }} contentStyle={{ border: '1px solid #dfe4df', borderRadius: 10 }} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16}>
            {data.map(item => <Cell key={item.name} fill={STATUS_COLORS[item.name] || '#6f927d'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function CategoryBars({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div className="chart-height small" aria-label="Jobs by category chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 4, left: -24, bottom: 42 }}>
          <CartesianGrid stroke="#edf0ed" vertical={false} />
          <XAxis dataKey="name" angle={-28} textAnchor="end" interval={0} tick={{ fontSize: 10, fill: '#536159' }} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6f7872' }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: '#f4f6f4' }} contentStyle={{ border: '1px solid #dfe4df', borderRadius: 10 }} />
          <Bar dataKey="value" fill="#2d6a4f" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
