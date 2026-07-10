import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RealtimeResponse } from "./types";
import styles from "./ForecastChart.module.css";


const COLORS = ["#087f70", "#4d7cfe", "#e5685a", "#d28a24"];


export function ForecastChart({ data }: { data: RealtimeResponse }) {
  const chartData = data.ports[0].forecast.map((point) => {
    const row: Record<string, string | number> = {
      time: point.offset_minutes === 0
        ? "现在"
        : `+${point.offset_minutes / 60}小时`,
    };
    data.ports.forEach((port) => {
      const forecast = port.forecast.find(
        (item) => item.offset_minutes === point.offset_minutes,
      );
      row[port.name] = forecast?.wait ?? 0;
    });
    return row;
  });

  return (
    <section className={styles.panel} aria-label="四口岸未来三小时等待趋势">
      <div className={styles.heading}>
        <div>
          <span className="sectionKicker">Forecast comparison</span>
          <h2>未来三小时等待趋势</h2>
        </div>
        <p>纵轴：预计等待分钟 · 横轴：相对香港当前时间</p>
      </div>
      <div className={styles.chart}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 22, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dfe9e4" />
            <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#657772" }} />
            <YAxis width={42} unit="分" tick={{ fontSize: 11, fill: "#657772" }} />
            <Tooltip
              formatter={(value) => [`${value} 分钟`, ""]}
              contentStyle={{ borderRadius: 10, borderColor: "#dbe6e0" }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
            {data.ports.map((port, index) => (
              <Line
                key={port.id}
                type="monotone"
                dataKey={port.name}
                stroke={COLORS[index]}
                strokeWidth={2.5}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
