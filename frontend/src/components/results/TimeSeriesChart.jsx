import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART } from '../../lib/vizTokens.js'

/**
 * Line chart over simulated time (one point per second).
 * - One y-axis only; 2px lines, no dots (a hover dot appears on the crosshair).
 * - A legend appears for 2+ series, plus a direct label at each line's end,
 *   so identity never relies on color alone.
 * - Animation is off: data streams in live, and animating every update jitters.
 *
 * @param {{
 *   title: string,
 *   data: object[],
 *   series: { key: string, label: string, color: string }[],
 *   formatValue: (v: number) => string,
 * }} props
 */
function TimeSeriesChart({ title, data, series, formatValue }) {
  const multi = series.length > 1
  const lastIndex = data.length - 1

  return (
    <figure className="flex min-w-0 flex-1 flex-col">
      <figcaption className="mb-1 text-xs font-medium text-ink-muted">{title}</figcaption>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: multi ? 40 : 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(t) => `${t}s`}
              stroke={CHART.axis}
              tick={{ fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              stroke={CHART.axis}
              tick={{ fontSize: 11 }}
              tickFormatter={formatValue}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }}
              contentStyle={{ background: CHART.surface, border: `1px solid ${CHART.grid}`, borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: CHART.text }}
              itemStyle={{ color: CHART.text }}
              labelFormatter={(t) => `t = ${t}s`}
              formatter={(value, name) => [formatValue(value), name]}
            />
            {multi && <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, color: CHART.axis }} />}
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: CHART.surface, strokeWidth: 2 }}
                isAnimationActive={false}
                label={
                  multi
                    ? ({ x, y, index }) =>
                        index === lastIndex ? (
                          <text key={s.key} x={x + 6} y={y} dy={4} fontSize={11} fill={CHART.text}>
                            {s.label}
                          </text>
                        ) : null
                    : false
                }
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

export default TimeSeriesChart
