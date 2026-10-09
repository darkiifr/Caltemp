import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import {
    MAX_ZOOM, MIN_ZOOM, TILE_SIZE, clamp, clusterPoints, fitBounds, getVisibleTiles, unproject, worldSize,
} from '../domain/geo';
import { OSM_TILES } from '../domain/mapTiles';

// A dependency-free slippy map tuned for the WebView:
// - panning and fractional zoom only rewrite one CSS transform per layer, on the
//   compositor; React re-renders only when the set of visible tiles or the
//   integer zoom level changes,
// - the previous zoom level stays underneath until the new tiles have loaded,
//   so zooming never flashes an empty map,
// - markers are clustered on a screen-space grid once per zoom level.


const BACK_LAYER_TIMEOUT_MS = 1500;
const CLICK_TOLERANCE_PX = 5;
const ZOOM_SETTLE_MS = 120;
const prefersReducedMotion = () => typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function tileUrl(provider, tile) {
    return provider.url(tile.z, tile.wrappedX, tile.y);
}

function clampView(view, height) {
    const zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM);
    const size = worldSize(zoom);
    const halfH = height / 2 / size;
    const cy = halfH >= 0.5 ? 0.5 : clamp(view.cy, halfH, 1 - halfH);
    return { cx: ((view.cx % 1) + 1) % 1, cy, zoom };
}

const Tile = memo(function Tile({ tile, ox, oy, provider, onSettled }) {
    return (
        <img
            alt=""
            draggable={false}
            decoding="async"
            src={tileUrl(provider, tile)}
            className="caltemp-map-tile absolute"
            style={{ left: (tile.x - ox) * TILE_SIZE, top: (tile.y - oy) * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE }}
            onLoad={(event) => { event.currentTarget.dataset.loaded = '1'; onSettled?.(); }}
            onError={(event) => { event.currentTarget.dataset.failed = '1'; onSettled?.(); }}
        />
    );
});

const Marker = memo(function Marker({ cluster, z, ox, oy, selected, onSelect }) {
    const size = worldSize(z);
    const count = cluster.items.length;
    const [first] = cluster.items;
    const isCluster = count > 1;
    const diameter = isCluster ? Math.min(52, 30 + Math.log2(count) * 5) : 26;
    return (
        <button
            type="button"
            data-map-marker=""
            onClick={(event) => { event.stopPropagation(); onSelect?.(cluster); }}
            aria-label={isCluster ? `${count} événements à cet endroit` : first.label}
            title={isCluster ? `${count} événements` : first.label}
            className={`caltemp-map-marker absolute flex items-center justify-center rounded-full border-2 font-semibold text-white shadow-lg ${
                selected ? 'border-white ring-4 ring-white/30' : 'border-white/80'
            }`}
            style={{
                left: cluster.x * size - ox * TILE_SIZE,
                top: cluster.y * size - oy * TILE_SIZE,
                width: diameter,
                height: diameter,
                marginLeft: -diameter / 2,
                marginTop: -diameter / 2,
                fontSize: isCluster ? 12 : 10,
                background: isCluster ? 'rgba(37, 99, 235, 0.92)' : first.color || '#3b82f6',
                zIndex: selected ? 3 : isCluster ? 2 : 1,
            }}
        >
            {isCluster ? count : first.badge || ''}
        </button>
    );
});

function SlippyMap({
    points = [],
    fitKey = '',
    theme = 'dark',
    selectedKey = '',
    onSelect,
    onMapClick,
    clusterRadius = 56,
    className = '',
    initialView = { cx: 0.5, cy: 0.35, zoom: 3 },
    children,
}, ref) {
    const containerRef = useRef(null);
    const frontRef = useRef(null);
    const backRef = useRef(null);
    const markerRef = useRef(null);
    const viewRef = useRef({ ...initialView });
    const sizeRef = useRef({ width: 0, height: 0 });
    const frameRef = useRef(0);
    const animationRef = useRef(0);
    const pointersRef = useRef(new Map());
    const gestureRef = useRef(null);
    const frontStateRef = useRef({ rangeKey: '', z: -1, pending: 0, origin: { ox: 0, oy: 0 }, layer: null });
    const backTimerRef = useRef(0);
    const settleTimerRef = useRef(0);
    const lastZoomInputRef = useRef(0);

    // Each level is laid out around a local origin tile so pixel offsets stay
    // small (GPU transforms are float32: absolute offsets jitter at high zoom).
    const [front, setFront] = useState({ z: Math.round(initialView.zoom), ox: 0, oy: 0, tiles: [] });
    const [back, setBack] = useState(null);
    const [settleTick, setSettleTick] = useState(0);
    const provider = OSM_TILES;

    // Transform for a rendered layer, from the level/origin it actually shows.
    const layerTransform = (element) => {
        if (!element?.dataset.z) return null;
        const z = Number(element.dataset.z);
        const ox = Number(element.dataset.ox) * TILE_SIZE;
        const oy = Number(element.dataset.oy) * TILE_SIZE;
        const { cx, cy, zoom } = viewRef.current;
        const { width, height } = sizeRef.current;
        const scale = 2 ** (zoom - z);
        const size = worldSize(z);
        return {
            transform: `translate3d(${width / 2 - (cx * size - ox) * scale}px, ${height / 2 - (cy * size - oy) * scale}px, 0) scale(${scale})`,
            scale,
        };
    };

    const clearBackSoon = useCallback((delay = 0) => {
        clearTimeout(backTimerRef.current);
        backTimerRef.current = setTimeout(() => setBack(null), delay);
    }, []);

    const handleFrontSettled = useCallback(() => {
        const state = frontStateRef.current;
        state.pending -= 1;
        if (state.pending <= 0) clearBackSoon(120);
    }, [clearBackSoon]);

    // One write per layer per frame; React is only involved when tiles change.
    const apply = useCallback(() => {
        frameRef.current = 0;
        const { width, height } = sizeRef.current;
        if (!width || !height) return;
        viewRef.current = clampView(viewRef.current, height);
        const { cx, cy, zoom } = viewRef.current;
        const z = clamp(Math.round(zoom), MIN_ZOOM, MAX_ZOOM);
        const state = frontStateRef.current;
        // While a zoom animation or a wheel burst is running, keep scaling the
        // current level instead of downloading every intermediate one.
        const zoomBusy = animationRef.current || performance.now() - lastZoomInputRef.current < ZOOM_SETTLE_MS;
        const deferLevel = state.z !== -1 && z !== state.z && zoomBusy;
        const shownZ = deferLevel ? state.z : z;

        for (const element of [frontRef.current, backRef.current]) {
            const layer = layerTransform(element);
            if (layer) element.style.transform = layer.transform;
        }
        const markerLayer = layerTransform(markerRef.current);
        if (markerLayer) {
            markerRef.current.style.transform = markerLayer.transform;
            markerRef.current.style.setProperty('--map-inv', String(1 / markerLayer.scale));
        }

        if (deferLevel) {
            // Only rescale what is already there: covering the viewport with
            // the old level after zooming out several levels would mean
            // thousands of tiles.
            clearTimeout(settleTimerRef.current);
            settleTimerRef.current = setTimeout(() => setSettleTick(tick => tick + 1), ZOOM_SETTLE_MS + 20);
            return;
        }
        const tiles = getVisibleTiles({ cx, cy, z: shownZ, width, height, scale: 2 ** (zoom - shownZ) });
        if (tiles.rangeKey === state.rangeKey) return;
        if (state.z !== shownZ) {
            if (state.z !== -1) {
                // Keep the old level visible while the new one streams in.
                setBack(state.layer);
                clearBackSoon(BACK_LAYER_TIMEOUT_MS);
                state.pending = tiles.length;
            }
            state.origin = {
                ox: Math.floor(cx * 2 ** shownZ),
                oy: Math.floor(cy * 2 ** shownZ),
            };
        }
        state.layer = { z: shownZ, ...state.origin, tiles };
        setFront(state.layer);
        state.rangeKey = tiles.rangeKey;
        state.z = shownZ;
    }, [clearBackSoon]);

    const requestApply = useCallback(() => {
        if (!frameRef.current) frameRef.current = requestAnimationFrame(apply);
    }, [apply]);

    // Zoom input stopped: switch to the right tile level.
    useEffect(() => {
        if (settleTick) requestApply();
    }, [settleTick, requestApply]);

    // Layers re-mount on zoom-level change: position them before paint.
    useLayoutEffect(() => {
        apply();
    }, [front.z, back?.z, apply]);

    const stopAnimation = () => {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = 0;
    };

    const animateTo = useCallback((target, duration = 380) => {
        stopAnimation();
        const from = { ...viewRef.current };
        // Go the short way around the antimeridian.
        let dx = target.cx - from.cx;
        if (dx > 0.5) dx -= 1;
        if (dx < -0.5) dx += 1;
        if (prefersReducedMotion() || duration <= 0) {
            viewRef.current = { cx: from.cx + dx, cy: target.cy, zoom: target.zoom };
            requestApply();
            return;
        }
        const start = performance.now();
        const step = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const ease = 1 - (1 - t) ** 3;
            viewRef.current = {
                cx: from.cx + dx * ease,
                cy: from.cy + (target.cy - from.cy) * ease,
                zoom: from.zoom + (target.zoom - from.zoom) * ease,
            };
            animationRef.current = t < 1 ? requestAnimationFrame(step) : 0;
            apply();
        };
        animationRef.current = requestAnimationFrame(step);
    }, [apply, requestApply]);

    const zoomAround = useCallback((nextZoom, clientX, clientY, animate = false) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const { cx, cy, zoom } = viewRef.current;
        const target = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
        const ox = rect && clientX != null ? clientX - rect.left - rect.width / 2 : 0;
        const oy = rect && clientY != null ? clientY - rect.top - rect.height / 2 : 0;
        // Keep the world point under the cursor fixed.
        const px = cx + ox / worldSize(zoom);
        const py = cy + oy / worldSize(zoom);
        const next = { cx: px - ox / worldSize(target), cy: py - oy / worldSize(target), zoom: target };
        if (animate) animateTo(next, 260);
        else {
            viewRef.current = next;
            requestApply();
        }
    }, [animateTo, requestApply]);

    const fitTo = useCallback((fitPoints, animate = true) => {
        const { width, height } = sizeRef.current;
        const target = fitBounds(fitPoints, { width, height, padding: 64, maxZoom: 15 });
        if (!target) return;
        if (animate) animateTo(target);
        else {
            viewRef.current = target;
            requestApply();
        }
    }, [animateTo, requestApply]);

    useImperativeHandle(ref, () => ({
        fitTo,
        flyTo: (point, zoom) => animateTo({ cx: point.x, cy: point.y, zoom: zoom ?? Math.max(viewRef.current.zoom, 13) }),
        getView: () => ({ ...viewRef.current }),
    }), [animateTo, fitTo]);

    // Size tracking.
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return undefined;
        const measure = () => {
            const rect = container.getBoundingClientRect();
            sizeRef.current = { width: rect.width, height: rect.height };
            frontStateRef.current.rangeKey = '';
            requestApply();
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measure);
        observer.observe(container);
        return () => observer.disconnect();
    }, [requestApply]);

    // Fit to the points whenever the caller asks for it (fitKey changes).
    const pointsRef = useRef(points);
    useLayoutEffect(() => {
        pointsRef.current = points;
    }, [points]);
    const hasFittedRef = useRef(false);
    useEffect(() => {
        if (!fitKey || !pointsRef.current.length) return;
        if (!sizeRef.current.width) return;
        fitTo(pointsRef.current, hasFittedRef.current);
        hasFittedRef.current = true;
    }, [fitKey, fitTo]);

    // Wheel needs a non-passive listener to prevent page scroll.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return undefined;
        const handleWheel = (event) => {
            event.preventDefault();
            stopAnimation();
            const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 800 : 1;
            // Trackpad pinch arrives as ctrl+wheel with small deltas.
            const factor = event.ctrlKey ? 0.012 : 0.0022;
            lastZoomInputRef.current = performance.now();
            zoomAround(viewRef.current.zoom - event.deltaY * unit * factor, event.clientX, event.clientY);
        };
        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [zoomAround]);

    useEffect(() => () => {
        cancelAnimationFrame(frameRef.current);
        cancelAnimationFrame(animationRef.current);
        clearTimeout(backTimerRef.current);
        clearTimeout(settleTimerRef.current);
    }, []);

    const handlePointerDown = (event) => {
        if (event.button !== 0 && event.pointerType === 'mouse') return;
        if (event.target.closest?.('[data-map-marker],[data-map-control]')) return;
        stopAnimation();
        containerRef.current?.setPointerCapture?.(event.pointerId);
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const pointers = Array.from(pointersRef.current.values());
        if (pointers.length === 2) {
            const [a, b] = pointers;
            gestureRef.current = {
                type: 'pinch',
                distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
                zoom: viewRef.current.zoom,
            };
        } else {
            gestureRef.current = {
                type: 'pan',
                startX: event.clientX,
                startY: event.clientY,
                lastX: event.clientX,
                lastY: event.clientY,
                lastT: performance.now(),
                vx: 0,
                vy: 0,
                moved: 0,
            };
        }
    };

    const handlePointerMove = (event) => {
        if (!pointersRef.current.has(event.pointerId)) return;
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const gesture = gestureRef.current;
        if (!gesture) return;
        if (gesture.type === 'pinch') {
            const [a, b] = Array.from(pointersRef.current.values());
            if (!b) return;
            const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            lastZoomInputRef.current = performance.now();
            zoomAround(gesture.zoom + Math.log2(distance / gesture.distance), (a.x + b.x) / 2, (a.y + b.y) / 2);
            return;
        }
        const now = performance.now();
        const dx = event.clientX - gesture.lastX;
        const dy = event.clientY - gesture.lastY;
        const dt = Math.max(1, now - gesture.lastT);
        gesture.vx = 0.8 * (dx / dt) + 0.2 * gesture.vx;
        gesture.vy = 0.8 * (dy / dt) + 0.2 * gesture.vy;
        gesture.lastX = event.clientX;
        gesture.lastY = event.clientY;
        gesture.lastT = now;
        gesture.moved = Math.max(gesture.moved, Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY));
        const size = worldSize(viewRef.current.zoom);
        viewRef.current = { ...viewRef.current, cx: viewRef.current.cx - dx / size, cy: viewRef.current.cy - dy / size };
        requestApply();
    };

    const handlePointerUp = (event) => {
        if (!pointersRef.current.has(event.pointerId)) return;
        pointersRef.current.delete(event.pointerId);
        const gesture = gestureRef.current;
        if (pointersRef.current.size > 0) {
            // Pinch -> pan with the remaining finger.
            const [remaining] = pointersRef.current.values();
            gestureRef.current = { type: 'pan', startX: remaining.x, startY: remaining.y, lastX: remaining.x, lastY: remaining.y, lastT: performance.now(), vx: 0, vy: 0, moved: CLICK_TOLERANCE_PX + 1 };
            return;
        }
        gestureRef.current = null;
        if (!gesture || gesture.type !== 'pan') return;

        if (gesture.moved <= CLICK_TOLERANCE_PX) {
            if (onMapClick && event.type === 'pointerup') {
                const rect = containerRef.current.getBoundingClientRect();
                const { cx, cy, zoom } = viewRef.current;
                const size = worldSize(zoom);
                const x = cx + (event.clientX - rect.left - rect.width / 2) / size;
                const y = cy + (event.clientY - rect.top - rect.height / 2) / size;
                onMapClick({ ...unproject(((x % 1) + 1) % 1, y), x: ((x % 1) + 1) % 1, y });
            }
            return;
        }

        // Inertia.
        const idle = performance.now() - gesture.lastT;
        let vx = idle > 80 ? 0 : gesture.vx;
        let vy = idle > 80 ? 0 : gesture.vy;
        if (prefersReducedMotion() || Math.hypot(vx, vy) < 0.15) return;
        let last = performance.now();
        const step = (now) => {
            const dt = now - last;
            last = now;
            const decay = Math.exp(-dt / 220);
            vx *= decay;
            vy *= decay;
            const size = worldSize(viewRef.current.zoom);
            viewRef.current = { ...viewRef.current, cx: viewRef.current.cx - (vx * dt) / size, cy: viewRef.current.cy - (vy * dt) / size };
            apply();
            animationRef.current = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(step) : 0;
        };
        animationRef.current = requestAnimationFrame(step);
    };

    const handleDoubleClick = (event) => {
        if (event.target.closest?.('[data-map-marker],[data-map-control]')) return;
        zoomAround(Math.round(viewRef.current.zoom) + (event.shiftKey ? -1 : 1), event.clientX, event.clientY, true);
    };

    const handleKeyDown = (event) => {
        const size = worldSize(viewRef.current.zoom);
        const moves = { ArrowLeft: [-120, 0], ArrowRight: [120, 0], ArrowUp: [0, -120], ArrowDown: [0, 120] };
        if (moves[event.key]) {
            event.preventDefault();
            const [dx, dy] = moves[event.key];
            animateTo({ ...viewRef.current, cx: viewRef.current.cx + dx / size, cy: viewRef.current.cy + dy / size }, 180);
        } else if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            zoomAround(Math.round(viewRef.current.zoom) + 1, null, null, true);
        } else if (event.key === '-' || event.key === '_') {
            event.preventDefault();
            zoomAround(Math.round(viewRef.current.zoom) - 1, null, null, true);
        }
    };

    const clusters = useMemo(() => clusterPoints(points, front.z, clusterRadius), [points, front.z, clusterRadius]);

    return (
        <div
            ref={containerRef}
            tabIndex={0}
            role="application"
            aria-label="Carte interactive : glisser pour se déplacer, molette ou +/- pour zoomer"
            className={`caltemp-map relative overflow-hidden select-none outline-none touch-none ${theme === 'light' ? 'caltemp-map-light' : 'caltemp-map-dark'} ${className}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            onKeyDown={handleKeyDown}
        >
            {back && (
                <div ref={backRef} data-z={back.z} data-ox={back.ox} data-oy={back.oy} className="caltemp-map-tiles absolute left-0 top-0 origin-top-left pointer-events-none" key={`back-${back.z}`}>
                    {back.tiles.map(tile => <Tile key={tile.key} tile={tile} ox={back.ox} oy={back.oy} provider={provider} />)}
                </div>
            )}
            <div ref={frontRef} data-z={front.z} data-ox={front.ox} data-oy={front.oy} className="caltemp-map-tiles absolute left-0 top-0 origin-top-left pointer-events-none will-change-transform" key={`front-${front.z}`}>
                {front.tiles.map(tile => <Tile key={tile.key} tile={tile} ox={front.ox} oy={front.oy} provider={provider} onSettled={handleFrontSettled} />)}
            </div>
            <div ref={markerRef} data-z={front.z} data-ox={front.ox} data-oy={front.oy} className="caltemp-map-markers absolute left-0 top-0 origin-top-left will-change-transform" key={`markers-${front.z}`}>
                {clusters.map(cluster => (
                    <Marker
                        key={cluster.key}
                        cluster={cluster}
                        z={front.z}
                        ox={front.ox}
                        oy={front.oy}
                        selected={Boolean(selectedKey) && cluster.items.some(item => item.key === selectedKey)}
                        onSelect={onSelect}
                    />
                ))}
            </div>

            <div data-map-control="" className="absolute right-3 top-3 z-10 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black/55 text-white shadow-lg backdrop-blur-md">
                <button type="button" aria-label="Zoomer" className="p-2 hover:bg-white/10" onClick={() => zoomAround(Math.round(viewRef.current.zoom) + 1, null, null, true)}>
                    <Plus size={16} />
                </button>
                <button type="button" aria-label="Dézoomer" className="border-t border-white/10 p-2 hover:bg-white/10" onClick={() => zoomAround(Math.round(viewRef.current.zoom) - 1, null, null, true)}>
                    <Minus size={16} />
                </button>
                {points.length > 0 && (
                    <button type="button" aria-label="Afficher tous les lieux" className="border-t border-white/10 p-2 hover:bg-white/10" onClick={() => fitTo(points)}>
                        <Maximize2 size={14} />
                    </button>
                )}
            </div>
            <div data-map-control="" className="absolute bottom-1 right-1 z-10 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/60">
                {provider.attribution}
            </div>
            {children}
        </div>
    );
}

export default memo(forwardRef(SlippyMap));
