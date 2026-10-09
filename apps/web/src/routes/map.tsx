import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchStation } from '../api/client';
import { SegmentedControl } from '../components/SegmentedControl';

export const Route = createFileRoute('/map')({
  component: MapPage,
});

// Free, keyless sources that work from a static page.
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
// Past radar, last 2 hours in 10-minute frames. Tiles stop at zoom 7 and each
// viewer may make 100 requests a minute, so tiles are 512 px and frames load lazily.
const RAINVIEWER_INDEX = 'https://api.rainviewer.com/public/weather-maps.json';
const RAINVIEWER_ATTRIBUTION = 'Radar <a href="https://www.rainviewer.com/">RainViewer</a>';
const RAINVIEWER_COLOR = 2; // Universal Blue, the only scheme the free API keeps.
// Meteosat third generation infrared, latest image (day and night).
const EUMETSAT_WMS = 'https://view.eumetsat.int/geoserver/wms';
const EUMETSAT_LAYER = 'mtg_fd:ir105_hrfi';
const EUMETSAT_ATTRIBUTION = 'Clouds &copy; <a href="https://view.eumetsat.int/">EUMETSAT</a>';

const IRELAND_CENTRE: L.LatLngTuple = [53.4, -8.0];
const REGIONAL_ZOOM = 7;
const REFRESH_MS = 10 * 60_000;
const FRAME_MS = 700;

type Overlay = 'radar' | 'clouds' | 'both';

const OVERLAYS = [
  { key: 'radar', label: 'Rain radar', description: 'last 2 hours' },
  { key: 'clouds', label: 'Clouds', description: 'satellite infrared' },
  { key: 'both', label: 'Both' },
];

interface RadarFrame {
  time: number;
  path: string;
}

interface RadarIndex {
  host: string;
  frames: RadarFrame[];
}

async function fetchRadarIndex(): Promise<RadarIndex> {
  const res = await fetch(RAINVIEWER_INDEX);
  if (!res.ok) throw new Error(`radar index ${res.status}`);
  const json = (await res.json()) as { host: string; radar?: { past?: RadarFrame[] } };
  return { host: json.host, frames: json.radar?.past ?? [] };
}

function formatFrameTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function MapPage() {
  const stationQuery = useQuery({ queryKey: ['station'], queryFn: fetchStation, staleTime: 300_000 });
  const radarQuery = useQuery({
    queryKey: ['radar-index'],
    queryFn: fetchRadarIndex,
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
  });

  const [overlay, setOverlay] = useState<Overlay>('radar');
  const [frameIndex, setFrameIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const station =
    stationQuery.data?.stations.find((s) => s.id === stationQuery.data?.activeStationId) ??
    stationQuery.data?.stations[0];
  const hasLocation = station != null && station.latitude !== null && station.longitude !== null;
  const radiusMetres = station?.locationRadiusMetres ?? 0;

  const frames = radarQuery.data?.frames ?? [];
  const lastFrame = frames.length - 1;
  const shownFrame = frameIndex === null ? lastFrame : Math.min(frameIndex, lastFrame);
  const showRadar = overlay !== 'clouds';
  const showClouds = overlay !== 'radar';

  // Snap back to the newest frame whenever a new set of frames arrives.
  useEffect(() => setFrameIndex(null), [radarQuery.data]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const timer = setInterval(() => {
      setFrameIndex((i) => ((i ?? lastFrame) + 1) % frames.length);
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [playing, frames.length, lastFrame]);

  return (
    <div>
      <h2 className="page-title">Map</h2>
      <p className="map-intro">
        {hasLocation
          ? radiusMetres > 0
            ? `The shaded circle is the station's area (within about ${Math.round(radiusMetres / 1000)} km), with the latest rain radar and cloud around it.`
            : "The dot is the station, with the latest rain radar and cloud around it."
          : 'The latest rain radar and cloud over Ireland.'}
      </p>

      <div className="map-controls">
        <SegmentedControl options={OVERLAYS} value={overlay} onChange={(k) => setOverlay(k as Overlay)} />
        {showRadar && frames.length > 0 && (
          <div className="map-timeline">
            <button
              type="button"
              className="map-play"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? 'Pause radar loop' : 'Play radar loop'}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <input
              type="range"
              min={0}
              max={lastFrame}
              value={shownFrame}
              onChange={(e) => {
                setPlaying(false);
                setFrameIndex(Number(e.target.value));
              }}
              aria-label="Radar time"
            />
            <span className="map-time">
              {formatFrameTime(frames[shownFrame]!.time)}
              {shownFrame === lastFrame && <span className="map-time__latest"> latest</span>}
            </span>
          </div>
        )}
      </div>

      <StationMap
        centre={hasLocation ? [station.latitude!, station.longitude!] : null}
        radiusMetres={radiusMetres}
        stationName={station?.name ?? 'Station'}
        radar={showRadar && radarQuery.data ? { host: radarQuery.data.host, frames, shown: shownFrame } : null}
        clouds={showClouds}
      />

      {radarQuery.isError && showRadar && (
        <p className="map-note">The rain radar could not be loaded just now. It will try again in a few minutes.</p>
      )}
    </div>
  );
}

interface StationMapProps {
  centre: L.LatLngTuple | null;
  radiusMetres: number;
  stationName: string;
  radar: { host: string; frames: RadarFrame[]; shown: number } | null;
  clouds: boolean;
}

/** Leaflet is driven imperatively; React only passes it the current choices. */
function StationMap({ centre, radiusMetres, stationName, radar, clouds }: StationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const radarLayers = useRef(new Map<string, L.TileLayer>());
  const cloudLayer = useRef<L.TileLayer.WMS | null>(null);

  useEffect(() => {
    const map = L.map(containerRef.current!, {
      center: IRELAND_CENTRE,
      zoom: REGIONAL_ZOOM,
      minZoom: 4,
      maxZoom: 11,
      scrollWheelZoom: false,
    });
    L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION, className: 'map-base' }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    mapRef.current = map;
    const layers = radarLayers.current;
    return () => {
      map.remove();
      mapRef.current = null;
      layers.clear();
      cloudLayer.current = null;
    };
  }, []);

  // The station: a dot when exact, a shaded circle when only the area is shown.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !centre) return;
    const marker =
      radiusMetres > 0
        ? L.circle(centre, { radius: radiusMetres, className: 'map-station map-station--area' })
        : L.circleMarker(centre, { radius: 7, className: 'map-station' });
    marker.bindTooltip(radiusMetres > 0 ? `${stationName} (approximate area)` : stationName);
    marker.addTo(map);
    map.setView(centre, REGIONAL_ZOOM);
    return () => {
      marker.remove();
    };
  }, [centre?.[0], centre?.[1], radiusMetres, stationName]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (clouds && !cloudLayer.current) {
      cloudLayer.current = L.tileLayer
        .wms(EUMETSAT_WMS, {
          layers: EUMETSAT_LAYER,
          format: 'image/png',
          transparent: true,
          version: '1.3.0',
          opacity: 0.55,
          attribution: EUMETSAT_ATTRIBUTION,
          zIndex: 5,
          className: 'map-clouds',
        })
        .addTo(map);
    } else if (!clouds && cloudLayer.current) {
      cloudLayer.current.remove();
      cloudLayer.current = null;
    }
  }, [clouds]);

  // One tile layer per radar frame, created when first shown and kept for the loop.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = radarLayers.current;
    const wanted = radar?.frames[radar.shown];
    const valid = new Set(radar?.frames.map((f) => f.path) ?? []);

    for (const [path, layer] of layers) {
      if (!valid.has(path)) {
        layer.remove();
        layers.delete(path);
      }
    }
    if (!radar || !wanted) {
      for (const layer of layers.values()) layer.remove();
      layers.clear();
      return;
    }
    if (!layers.has(wanted.path)) {
      const url = `${radar.host}${wanted.path}/512/{z}/{x}/{y}/${RAINVIEWER_COLOR}/1_1.png`;
      layers.set(
        wanted.path,
        L.tileLayer(url, {
          tileSize: 512,
          zoomOffset: -1,
          maxNativeZoom: 8, // with the offset, z 7 in the URL: the API's limit
          opacity: 0,
          zIndex: 10,
          attribution: RAINVIEWER_ATTRIBUTION,
        }).addTo(map),
      );
    }
    for (const [path, layer] of layers) layer.setOpacity(path === wanted.path ? 0.75 : 0);
  }, [radar?.host, radar?.frames, radar?.shown]);

  return <div ref={containerRef} className="station-map" role="region" aria-label="Map of the station and rain radar" />;
}
