import { useEffect, useState } from "react";
import { Play, Pause } from "lucide-react";
import type { RainFrame } from "./useRainLayer";

// Weather radar timeline: scrub frames (past → forecast) and play the animation.
export function RainTimeline({
  frames,
  index,
  onIndex,
}: {
  frames: RainFrame[];
  index: number;
  onIndex: (updater: number | ((i: number) => number)) => void;
}) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(
      () => onIndex((i) => (i + 1) % frames.length),
      600,
    );
    return () => window.clearInterval(t);
  }, [playing, frames.length, onIndex]);

  const time = new Date((frames[index]?.time ?? 0) * 1000);
  const label = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="rain-timeline">
      <button className="rt-play" onClick={() => setPlaying((p) => !p)}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <input
        className="rt-range"
        type="range"
        min={0}
        max={frames.length - 1}
        value={index}
        onChange={(e) => onIndex(Number(e.target.value))}
      />
      <span className="rt-time">{label}</span>
    </div>
  );
}
