import { useEffect, useMemo, useRef, useState } from "react";
import { BorderCommuteScene } from "./BorderCommuteScene/BorderCommuteScene";
import { CONGESTION_CONFIG } from "./BorderCommuteScene/congestionConfig";
import { loadGeographyAsset } from "./BorderCommuteScene/geographyAsset";
import { normalizeRouteStatuses } from "./BorderCommuteScene/routeDataAdapter";
import type { QualityLevel } from "./BorderCommuteScene/types";
import type { PortStatus } from "./types";
import styles from "./PortFlowScene.module.css";

function detectInitialQuality(): QualityLevel {
  if (typeof window === "undefined") return "medium";
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (cores <= 4 || memory <= 4) return "low";
  if (cores >= 10 && memory >= 8) return "high";
  return "medium";
}

export function PortFlowScene({ ports }: { ports: PortStatus[] }) {
  const host = useRef<HTMLDivElement>(null);
  const visual = useRef<HTMLDivElement>(null);
  const scene = useRef<BorderCommuteScene | null>(null);
  const statuses = useMemo(() => normalizeRouteStatuses(ports), [ports]);
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;
  const [available, setAvailable] = useState(true);
  const [ready, setReady] = useState(false);
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null);
  const [hoveredPortId, setHoveredPortId] = useState<string | null>(null);
  const [autoTourEnabled, setAutoTourEnabled] = useState(true);
  const [autoTourPaused, setAutoTourPaused] = useState(false);
  const [quality, setQuality] = useState<QualityLevel>(detectInitialQuality);
  const [performanceSummary, setPerformanceSummary] = useState("");
  const [geographyMode, setGeographyMode] = useState<"loading" | "osm" | "fallback">("loading");
  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const abortController = new AbortController();
    let runtime: BorderCommuteScene | null = null;
    let cancelled = false;
    setReady(false);
    setAvailable(true);
    setGeographyMode("loading");
    setAutoTourPaused(false);

    void (async () => {
      let geographyAsset = null;
      try {
        geographyAsset = await loadGeographyAsset(abortController.signal);
      } catch (error) {
        if (abortController.signal.aborted) return;
        console.warn("Unable to load offline geography; using simplified fallback", error);
      }
      if (cancelled) return;

      try {
        runtime = new BorderCommuteScene(container, statusesRef.current, quality, reducedMotion, geographyAsset, {
          onHover: setHoveredPortId,
          onSelectionChange: ({ routeId }) => setSelectedPortId(routeId),
          onAutoTourChange: setAutoTourEnabled,
          onAutoTourPauseChange: setAutoTourPaused,
          onTooltipPosition: (x, y) => {
            visual.current?.style.setProperty("--tooltip-x", `${x}px`);
            visual.current?.style.setProperty("--tooltip-y", `${y}px`);
          },
          onAvailabilityChange: setAvailable,
          onPerformanceUpdate: setPerformanceSummary,
        });
        scene.current = runtime;
        setGeographyMode(geographyAsset ? "osm" : "fallback");
        setReady(true);
      } catch (error) {
        console.error("Unable to initialize border commute WebGL scene", error);
        setAvailable(false);
        setReady(false);
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
      runtime?.dispose();
      if (scene.current === runtime) scene.current = null;
    };
  }, [quality, reducedMotion]);

  useEffect(() => {
    scene.current?.updateStatuses(statuses);
  }, [statuses]);

  const detailsId = hoveredPortId ?? selectedPortId;
  const detail = statuses.find((status) => status.id === detailsId);

  function focus(portId: string | null) {
    scene.current?.focus(portId);
  }

  return (
    <section className={styles.panel} aria-labelledby="flow-title">
      <header className={styles.heading}>
        <div>
          <span className="sectionKicker">Live border digital twin</span>
          <h2 id="flow-title">香港—深圳四口岸实时流线</h2>
          <p>基于离线港深地理与道路数据的城市级交通沙盘。颜色表示压力，粒子密度表示人流，速度表示通行效率。</p>
        </div>
        <div className={styles.legend} aria-label="四档拥堵图例">
          {(Object.entries(CONGESTION_CONFIG) as Array<[keyof typeof CONGESTION_CONFIG, (typeof CONGESTION_CONFIG)[keyof typeof CONGESTION_CONFIG]]>).map(([level, config]) => (
            <span key={level}><i style={{ background: config.color, color: config.color }} />{config.label}</span>
          ))}
        </div>
      </header>

      <div className={styles.visual} ref={visual}>
        <div className={styles.mapMeta} aria-hidden="true">
          <span><i />LIVE SCENE</span>
          <b>22.45°N · 114.06°E</b>
        </div>
        <div
          className={styles.scene}
          ref={host}
          role="region"
          tabIndex={0}
          aria-describedby="flow-interaction-hint"
          aria-label={`香港与深圳四口岸地理流线。${statuses.map((status) => `${status.name}口岸${CONGESTION_CONFIG[status.congestionLevel].label}，预计等待${status.waitingTime}分钟`).join("；")}`}
        >
          {!ready && available && (
            <div className={styles.loading} role="status">
              <span />
              <strong>正在构建港深城市沙盘</strong>
              <small>载入地形、口岸与实时路线…</small>
            </div>
          )}
          {!available && (
            <div className={styles.fallback} role="status">
              <strong>当前浏览器无法运行 3D 场景</strong>
              <p>实时口岸状态仍可通过下方路线控制和页面中的口岸卡片查看。</p>
            </div>
          )}
        </div>

        <div className={styles.sceneControls} aria-label="3D 场景控制">
          <button type="button" onClick={() => focus(null)} disabled={!selectedPortId}>返回总览</button>
          <button
            type="button"
            aria-pressed={autoTourEnabled}
            disabled={reducedMotion}
            title={reducedMotion ? "系统已启用减少动态效果，自动巡航保持关闭" : undefined}
            onClick={() => scene.current?.setAutoTour(!autoTourEnabled)}
          >
            自动巡航 {autoTourEnabled ? (autoTourPaused ? "暂停" : "开") : "关"}
          </button>
          <label>
            <span>画质</span>
            <select value={quality} onChange={(event) => setQuality(event.target.value as QualityLevel)}>
              <option value="low">流畅</option>
              <option value="medium">均衡</option>
              <option value="high">精细</option>
            </select>
          </label>
        </div>

        {detail && (
          <aside className={styles.tooltip} aria-live="polite" aria-atomic="true">
            <span style={{ color: CONGESTION_CONFIG[detail.congestionLevel].color }}>{CONGESTION_CONFIG[detail.congestionLevel].label}</span>
            <strong>{detail.name}口岸</strong>
            <small>{detail.nameEn}</small>
            <p>预计等待 <b>约 {detail.waitingTime} 分钟</b></p>
          </aside>
        )}

        {import.meta.env.DEV && performanceSummary && <output className={styles.performance}>{quality} · {performanceSummary}</output>}
        <span className={styles.interactionHint} id="flow-interaction-hint">拖动旋转 · 滚轮缩放 · 方向键平移 · 悬停查看 · 点击聚焦</span>
      </div>

      <div className={styles.routes} aria-label="四口岸路线聚焦控制">
        {statuses.map((status, index) => {
          const config = CONGESTION_CONFIG[status.congestionLevel];
          const selected = selectedPortId === status.id;
          return (
            <button
              type="button"
              aria-pressed={selected}
              aria-label={`${status.name}口岸，${config.label}，预计等待${status.waitingTime}分钟`}
              className={`${styles.routeButton} ${selected ? styles.selected : ""}`}
              onClick={() => focus(selected ? null : status.id)}
              key={status.id}
            >
              <span className={styles.routeIndex}>{String(index + 1).padStart(2, "0")}</span>
              <i style={{ background: config.color, color: config.color }} />
              <span><b>{status.name}口岸</b><small>{status.nameEn}</small></span>
              <em>{config.label}</em>
            </button>
          );
        })}
      </div>
      <small className={styles.notice}>
        {geographyMode === "fallback" ? "离线地理资产载入失败，当前使用简化轮廓；" : "地理与道路底图："}
        {geographyMode !== "fallback" && (
          <><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>；</>
        )}
        仅用于态势演示，不作为测绘、旅客轨迹或导航路线；实时等待数据仍沿用现有业务接口。
      </small>
    </section>
  );
}
