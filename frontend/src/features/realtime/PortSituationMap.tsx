import type { PortStatus } from "./types";
import styles from "./PortSituationMap.module.css";


function riskClass(wait: number): string {
  if (wait >= 35) return styles.high;
  if (wait >= 18) return styles.medium;
  return styles.low;
}


export function PortSituationMap({
  ports,
  selectedPortId,
  onSelect,
}: {
  ports: PortStatus[];
  selectedPortId: string | null;
  onSelect: (portId: string) => void;
}) {
  return (
    <section className={styles.panel} aria-labelledby="port-map-title">
      <div className={styles.heading}>
        <div><span className="sectionKicker">Border situation map</span><h2 id="port-map-title">深港口岸态势地图</h2></div>
        <p>离线示意坐标 · 不代表真实地理比例或导航路线</p>
      </div>
      <svg className={styles.map} viewBox="0 0 1000 430" role="img" aria-label="四个深港口岸当前等待态势示意图">
        <title>四个深港口岸当前等待态势示意图</title>
        <path className={styles.shenzhen} d="M30 28 H970 V176 C825 152 690 190 548 174 C390 156 238 202 30 165 Z" />
        <path className={styles.hongKong} d="M30 265 C190 220 345 245 500 225 C665 205 802 240 970 198 V402 H30 Z" />
        <path className={styles.border} d="M30 205 C218 250 365 195 520 215 C680 235 820 190 970 215" />
        <text x="70" y="95" className={styles.region}>深圳 SHENZHEN</text>
        <text x="760" y="350" className={styles.region}>香港 HONG KONG</text>
        {ports.map((port) => {
          const x = port.map_position.x * 10;
          const y = port.map_position.y * 4.3;
          const selected = selectedPortId === port.id;
          return (
            <g
              key={port.id}
              className={`${styles.port} ${riskClass(port.current_wait)} ${selected ? styles.selected : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`${port.name}口岸，当前等待${port.current_wait}分钟`}
              onClick={() => onSelect(port.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(port.id);
                }
              }}
            >
              <circle cx={x} cy={y} r={selected ? 27 : 22} className={styles.pulse} />
              <circle cx={x} cy={y} r="16" className={styles.node} />
              <text x={x} y={y - 30} textAnchor="middle" className={styles.portName}>{port.name}</text>
              <text x={x} y={y + 5} textAnchor="middle" className={styles.wait}>{port.current_wait}</text>
              <text x={x} y={y + 37} textAnchor="middle" className={styles.trend}>
                {port.change_next_hour > 0 ? "+" : ""}{port.change_next_hour}分 / 1h
              </text>
            </g>
          );
        })}
      </svg>
      <div className={styles.legend} aria-label="等待等级图例">
        <span><i className={styles.legendLow} />畅通 &lt;18分</span>
        <span><i className={styles.legendMedium} />较繁忙 18–34分</span>
        <span><i className={styles.legendHigh} />拥挤 ≥35分</span>
      </div>
    </section>
  );
}
