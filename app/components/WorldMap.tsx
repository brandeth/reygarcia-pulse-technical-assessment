"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { PeerDot } from "@/lib/types";
import { applyNightSignal, hideLabels, showLabels } from "@/lib/map-theme";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const DOT_EXIT_MS = 300; // matches dot-out in globals.css

export default function WorldMap({
  peers,
  me,
  onPeerClick,
}: {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  // Every tap is reported, busy or not; the page decides what it means.
  onPeerClick: (id: string, busy: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);

  // Marker click handlers are bound once, so read the live click handler
  // through a ref (synced in an effect, never during render).
  const onPeerClickRef = useRef(onPeerClick);
  useEffect(() => {
    onPeerClickRef.current = onPeerClick;
  });

  // Initialise the map once.
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        // Mounted behind the entry gate, before we know where the user is:
        // open on the whole globe; the fly-in below takes it from there.
        center: [0, 20],
        zoom: 1.4,
        attributionControl: true,
      });
      // Recolor dark-v11 to the app palette before its first frame, and start
      // label-free: the map opens behind the entry gate.
      map.on("style.load", () => {
        applyNightSignal(map);
        hideLabels(map);
      });
      map.on("load", () => {
        if (!cancelled) setReady(true);
      });
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      markers.clear();
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Slowly spin the globe while nobody has entered yet (behind the gate).
  // Each easeTo nudges it a few degrees; its moveend queues the next nudge.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || me) return;
    // Under reduced motion Mapbox makes easeTo instant, so moveend would fire
    // immediately and this would loop as fast as it can. Skip the spin.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const spin = () => {
      const center = map.getCenter();
      center.lng -= 3; // ~120 s per revolution
      map.easeTo({ center, duration: 1000, easing: (t) => t });
    };
    map.on("moveend", spin);
    spin();

    return () => {
      map.off("moveend", spin);
      map.stop();
    };
  }, [ready, me]);

  // Show / move the user's own "you are here" pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !me) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      if (!meMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "pulse-me";
        el.title = "You are here";
        el.innerHTML = `<span class="pulse-me-label">Me</span>📍`;
        // anchor "bottom" → the pin's tip sits on the exact coordinate.
        meMarkerRef.current = new mapboxgl.Marker({
          element: el,
          anchor: "bottom",
        })
          .setLngLat([me.lng, me.lat])
          .addTo(map);
        // First fix: fly down from the globe to the user. Not `essential`,
        // so Mapbox jumps instead of flying under reduced motion.
        map.flyTo({ center: [me.lng, me.lat], zoom: 4, duration: 2800 });
        showLabels(map);
      } else {
        meMarkerRef.current.setLngLat([me.lng, me.lat]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, ready]);

  // Reconcile markers whenever the peer list changes (or the map becomes ready).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      const markers = markersRef.current;
      const seen = new Set<string>();

      for (const peer of peers) {
        seen.add(peer.id);
        let marker = markers.get(peer.id);
        if (!marker) {
          const el = document.createElement("button");
          el.type = "button";
          el.className = "pulse-dot";
          // Mapbox owns this element's inline transform/opacity, so all
          // visuals live on the inner core (see .pulse-dot in globals.css).
          const core = document.createElement("span");
          core.className = "pulse-dot-core";
          // Random phase so the dots twinkle independently.
          core.style.setProperty("--dot-delay", `${-Math.random() * 2.4}s`);
          el.appendChild(core);
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            onPeerClickRef.current(peer.id, el.hasAttribute("data-busy"));
          });
          marker = new mapboxgl.Marker({ element: el })
            .setLngLat([peer.lng, peer.lat])
            .addTo(map);
          markers.set(peer.id, marker);
        }
        // Busy is a data attribute, not inline opacity: Mapbox rewrites the
        // marker's opacity on every pan/zoom, which used to flash busy dots
        // back to "available" until the next poll.
        const el = marker.getElement();
        el.toggleAttribute("data-busy", peer.busy);
        el.setAttribute(
          "aria-label",
          peer.busy ? "Stranger, busy in another chat" : "Connect to a stranger",
        );
        el.setAttribute("aria-disabled", String(peer.busy));
      }

      // Peers that went offline shrink away, then their marker is removed.
      for (const [id, marker] of markers) {
        if (!seen.has(id)) {
          markers.delete(id);
          marker.getElement().setAttribute("data-leaving", "");
          setTimeout(() => marker.remove(), DOT_EXIT_MS);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [peers, ready]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full bg-ink" />

      {!TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="max-w-md rounded-lg bg-zinc-800 p-4 text-sm text-zinc-200">
            Set{" "}
            <code className="text-emerald-400">NEXT_PUBLIC_MAPBOX_TOKEN</code>{" "}
            in <code>.env</code> to load the map.
          </p>
        </div>
      )}
    </div>
  );
}
