import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const Word: React.FC<{
  text: string;
  delay?: number;
  style?: React.CSSProperties;
  from?: "up" | "down" | "left";
}> = ({ text, delay = 0, style, from = "up" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 180 } });
  const opacity = interpolate(s, [0, 1], [0, 1]);
  const ty = from === "up" ? interpolate(s, [0, 1], [40, 0]) : from === "down" ? interpolate(s, [0, 1], [-40, 0]) : 0;
  const tx = from === "left" ? interpolate(s, [0, 1], [-60, 0]) : 0;
  return (
    <span
      style={{
        display: "inline-block",
        opacity,
        transform: `translate(${tx}px, ${ty}px)`,
        ...style,
      }}
    >
      {text}
    </span>
  );
};

export const Stagger: React.FC<{
  words: string[];
  baseDelay?: number;
  step?: number;
  style?: React.CSSProperties;
  wordStyle?: React.CSSProperties;
}> = ({ words, baseDelay = 0, step = 4, style, wordStyle }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4em", ...style }}>
    {words.map((w, i) => (
      <Word key={i} text={w} delay={baseDelay + i * step} style={wordStyle} />
    ))}
  </div>
);
