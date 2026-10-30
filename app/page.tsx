"use client";

import { useEffect, useRef, useState } from "react";
import EntryGate from "./components/EntryGate";
import WorldMap from "./components/WorldMap";
import Header from "./components/Header";
import { Toaster, useToasts } from "./components/Toasts";
import StatusPill from "./components/StatusPill";
import SessionExpired from "./components/SessionExpired";
import ConnectionPrompt from "./components/ConnectionPrompt";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";
import VideoPanel from "./components/VideoPanel";
import { join, leave, poll, sendSignal, SessionExpiredError } from "@/lib/api";
import { PeerSession, type DescType, type PeerControl } from "@/lib/webrtc";
import { POLL_INTERVAL_MS } from "@/lib/presence";
import { type PeerDot, type SignalMsg } from "@/lib/types";

type Conn =
  | { kind: "idle" }
  | { kind: "requesting"; peerId: string }
  | { kind: "incoming"; peerId: string }
  | { kind: "connecting"; peerId: string }
  | { kind: "connected"; peerId: string };

type VideoState = "none" | "requesting" | "incoming" | "active";

const REQUEST_TIMEOUT_MS = 30_000;

export default function Home() {
  const [phase, setPhase] = useState<"gate" | "live">("gate");
  // The gate outlives the "gate" phase by its fade-out (gate-out, 0.4 s).
  const [gateMounted, setGateMounted] = useState(true);
  const [sessionId, setSessionId] = useState("");
  const [peers, setPeers] = useState<PeerDot[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [expired, setExpired] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [myLocation, setMyLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  // Raw location kept client-side only, so we can rejoin if our row is reaped.
  const myLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  const [conn, _setConn] = useState<Conn>({ kind: "idle" });
  const connRef = useRef<Conn>(conn);
  const setConn = (c: Conn) => {
    connRef.current = c;
    _setConn(c);
  };

  const [video, _setVideo] = useState<VideoState>("none");
  const videoRef = useRef<VideoState>(video);
  const setVideo = (v: VideoState) => {
    videoRef.current = v;
    _setVideo(v);
  };

  const peerRef = useRef<PeerSession | null>(null);
  const msgId = useRef(0);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { toasts, toast } = useToasts();

  function addMessage(mine: boolean, text: string) {
    setMessages((prev) => [...prev, { id: msgId.current++, mine, text }]);
  }

  function teardown(message?: string) {
    if (requestTimer.current) clearTimeout(requestTimer.current);
    peerRef.current?.close();
    peerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
    setMessages([]);
    setConn({ kind: "idle" });
    if (message) toast(message);
  }

  function startPeer(peerId: string, initiator: boolean) {
    const ps = new PeerSession(initiator, {
      onSignal: (type: DescType, payload: string) => {
        void sendSignal(sessionId, peerId, type, payload);
      },
      onChat: (text) => addMessage(false, text),
      onControl: (ctrl) => handleControl(ctrl),
      onRemoteStream: (stream) => setRemoteStream(stream),
      onConnectionState: (state) => {
        if (state === "failed") {
          // Tell the server too, or both of us stay busy + paired.
          void sendSignal(sessionId, peerId, "end");
          teardown();
          toast("Connection failed (network).", { variant: "error" });
        }
      },
      onChannelOpen: () => {
        setConn({ kind: "connected", peerId });
      },
      onChannelClose: () => {
        // Guard: our own teardown closes the channel too.
        if (peerRef.current === ps) {
          void sendSignal(sessionId, peerId, "end");
          teardown("Stranger disconnected.");
        }
      },
    });
    peerRef.current = ps;
  }

  function handleControl(ctrl: PeerControl) {
    const ps = peerRef.current;
    switch (ctrl) {
      case "video-request":
        if (videoRef.current === "none") setVideo("incoming");
        break;
      case "video-accept":
        if (videoRef.current === "requesting" && ps) {
          ps.startVideo()
            .then((stream) => {
              setLocalStream(stream);
              setVideo("active");
            })
            .catch(() => {
              setVideo("none");
              ps.sendControl("video-end");
              toast("Camera unavailable.", { variant: "error" });
            });
        }
        break;
      case "video-decline":
        if (videoRef.current === "requesting") {
          setVideo("none");
          toast("Video declined.");
        }
        break;
      case "video-end":
        ps?.stopVideo();
        setLocalStream(null);
        setRemoteStream(null);
        setVideo("none");
        break;
    }
  }

  // A tap on someone's dot. Taps that can't connect used to do nothing
  // (or, on a busy dot, send a request that was auto-declined), so say why.
  function handlePeerClick(peerId: string, busy: boolean) {
    const kind = connRef.current.kind;
    if (kind === "requesting") return toast("You're already waiting for an answer.");
    if (kind !== "idle") return toast("Finish your current chat first.");
    if (busy) return toast("They're in another chat right now.");
    requestConnection(peerId);
  }

  function requestConnection(peerId: string) {
    if (connRef.current.kind !== "idle") return;
    setConn({ kind: "requesting", peerId });
    void sendSignal(sessionId, peerId, "request");
    requestTimer.current = setTimeout(() => {
      if (
        connRef.current.kind === "requesting" &&
        connRef.current.peerId === peerId
      ) {
        void sendSignal(sessionId, peerId, "end");
        teardown("No answer.");
      }
    }, REQUEST_TIMEOUT_MS);
  }

  function cancelRequest() {
    if (connRef.current.kind === "requesting") {
      void sendSignal(sessionId, connRef.current.peerId, "end");
    }
    teardown();
  }

  function acceptIncoming() {
    if (connRef.current.kind !== "incoming") return;
    const peerId = connRef.current.peerId;
    startPeer(peerId, false);
    void sendSignal(sessionId, peerId, "accept");
    setConn({ kind: "connecting", peerId });
  }

  function declineIncoming() {
    if (connRef.current.kind !== "incoming") return;
    void sendSignal(sessionId, connRef.current.peerId, "decline");
    setConn({ kind: "idle" });
  }

  function endConnection() {
    const c = connRef.current;
    if (c.kind === "connecting" || c.kind === "connected") {
      void sendSignal(sessionId, c.peerId, "end");
    }
    teardown();
  }

  function startVideoRequest() {
    if (videoRef.current !== "none" || !peerRef.current) return;
    setVideo("requesting");
    peerRef.current.sendControl("video-request");
  }

  function cancelVideoRequest() {
    if (videoRef.current !== "requesting") return;
    // video-end also closes the other side's "Start video call?" prompt.
    peerRef.current?.sendControl("video-end");
    setVideo("none");
  }

  function acceptVideo() {
    const ps = peerRef.current;
    if (!ps) return;
    ps.startVideo()
      .then((stream) => {
        setLocalStream(stream);
        ps.sendControl("video-accept");
        setVideo("active");
      })
      .catch(() => {
        ps.sendControl("video-decline");
        setVideo("none");
        toast("Camera unavailable.", { variant: "error" });
      });
  }

  function declineVideo() {
    peerRef.current?.sendControl("video-decline");
    setVideo("none");
  }

  function endVideo() {
    const ps = peerRef.current;
    ps?.stopVideo();
    ps?.sendControl("video-end");
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
  }

  function processSignal(sig: SignalMsg) {
    switch (sig.type) {
      case "request": {
        if (connRef.current.kind === "idle") {
          setConn({ kind: "incoming", peerId: sig.fromId });
        } else {
          void sendSignal(sessionId, sig.fromId, "decline");
        }
        break;
      }
      case "accept": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          startPeer(sig.fromId, true);
          setConn({ kind: "connecting", peerId: sig.fromId });
        }
        break;
      }
      case "decline": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          teardown("Request declined.");
        }
        break;
      }
      case "offer":
      case "answer":
      case "ice": {
        const c = connRef.current;
        const peerId =
          c.kind === "connecting" || c.kind === "connected" ? c.peerId : null;
        if (peerRef.current && peerId === sig.fromId) {
          void peerRef.current.handleSignal(
            sig.type as DescType,
            sig.payload ?? "",
          );
        }
        break;
      }
      case "end": {
        const c = connRef.current;
        if (c.kind !== "idle" && c.peerId === sig.fromId) {
          if (c.kind === "incoming") setConn({ kind: "idle" });
          else if (c.kind === "requesting") teardown("Stranger left.");
          else teardown("Stranger disconnected.");
        }
        break;
      }
    }
  }

  const processSignalRef = useRef(processSignal);
  useEffect(() => {
    processSignalRef.current = processSignal;
  });

  useEffect(() => {
    if (phase !== "live" || !sessionId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const data = await poll(sessionId);
        if (!active) return;
        // Our presence row is gone (reaped while throttled, or deleted by a
        // pagehide leave before a bfcache restore) — recreate it. A failure
        // throws into the catch below and is retried on the next tick.
        if (!data.self && myLocationRef.current) {
          const { lat, lng } = myLocationRef.current;
          await join(lat, lng);
        }
        setPeers(data.peers);
        for (const s of data.signals) processSignalRef.current(s);
      } catch (err) {
        // Token rejected (e.g. SESSION_SECRET rotated) — retrying can't
        // succeed, so stop polling and ask for a reload.
        if (err instanceof SessionExpiredError) {
          setExpired(true);
          return;
        }
      }
      if (active) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase, sessionId]);

  useEffect(() => {
    if (!sessionId || phase !== "live") return;
    // The server knows who we're linked to, so leave only sends our id.
    const onLeave = () => leave(sessionId);
    // pagehide alone covers tab close, navigation and bfcache entry;
    // beforeunload was redundant and can make the page bfcache-ineligible.
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
    };
  }, [sessionId, phase]);

  // A request in a background tab would time out unseen, so flash the tab
  // title until the tab is looked at or the request is answered.
  const titleAlert =
    conn.kind === "incoming"
      ? "Someone wants to connect"
      : video === "incoming"
        ? "Video call request"
        : null;
  useEffect(() => {
    if (!titleAlert) return;
    const original = document.title;
    let flashOn = false;
    const id = setInterval(() => {
      flashOn = document.hidden && !flashOn;
      document.title = flashOn ? `● ${titleAlert}` : original;
    }, 1000);
    return () => {
      clearInterval(id);
      document.title = original;
    };
  }, [titleAlert]);

  async function handleReady(lat: number, lng: number) {
    myLocationRef.current = { lat, lng };
    const id = await join(lat, lng); // throws on failure → EntryGate shows error
    // Only after a successful join, and together: the gate closes, the map
    // flies to us and our pin lands in the same render.
    setMyLocation({ lat, lng });
    setSessionId(id);
    setPhase("live");
    setTimeout(() => setGateMounted(false), 400);
  }

  const inChat = conn.kind === "connecting" || conn.kind === "connected";

  // The map is mounted from the first render, so the gate sits on top of a
  // live globe and entering is one camera move, not a fresh map load.
  // Polling and presence still wait for phase === "live" (effects above).
  return (
    <main className="fixed inset-0 overflow-hidden">
      <WorldMap
        peers={peers}
        me={myLocation}
        onPeerClick={handlePeerClick}
        // The other person in a pending request, either direction.
        targetId={
          conn.kind === "requesting" || conn.kind === "incoming"
            ? conn.peerId
            : null
        }
      />

      {gateMounted && (
        <EntryGate onReady={handleReady} leaving={phase === "live"} />
      )}

      {phase === "live" && <Header online={peers.length} />}

      {/* With the chat panel open on wide screens, center over the map
          area that's still visible (panel w-96 + 1rem gap = 25rem). */}
      <Toaster toasts={toasts} className={inChat ? "md:right-[25rem]" : ""}>
        {conn.kind === "requesting" && (
          // Mounts with the request, so the ring and REQUEST_TIMEOUT_MS start
          // together; keyed so a new request always gets a full ring.
          <StatusPill
            key={conn.peerId}
            onCancel={cancelRequest}
            countdownMs={REQUEST_TIMEOUT_MS}
          >
            Requesting connection…
          </StatusPill>
        )}
        {video === "requesting" && (
          <StatusPill onCancel={cancelVideoRequest}>Requesting video…</StatusPill>
        )}
      </Toaster>

      {conn.kind === "incoming" && (
        // The requester gives up after REQUEST_TIMEOUT_MS; their "end" closes
        // this card, so the ring is a close (poll-delayed) view of that.
        <ConnectionPrompt
          key={conn.peerId}
          kind="connect"
          title="A stranger wants to connect"
          subtitle="Accept to start a private chat."
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
          countdownMs={REQUEST_TIMEOUT_MS}
        />
      )}

      {inChat && (
        <ChatPanel
          messages={messages}
          connected={conn.kind === "connected"}
          videoBusy={video !== "none"}
          onSend={(text) => {
            peerRef.current?.sendChat(text);
            addMessage(true, text);
          }}
          onStartVideo={startVideoRequest}
          onEnd={endConnection}
        />
      )}

      {video === "incoming" && (
        <ConnectionPrompt
          kind="video"
          title="Start video call?"
          subtitle="The stranger wants to turn on video."
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptVideo}
          onDecline={declineVideo}
          // Center over the map beside the chat panel, like the toasts.
          className="md:right-[25rem]"
        />
      )}

      {video === "active" && (
        <VideoPanel
          localStream={localStream}
          remoteStream={remoteStream}
          onEnd={endVideo}
        />
      )}

      {expired && <SessionExpired />}
    </main>
  );
}
