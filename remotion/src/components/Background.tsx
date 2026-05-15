import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { colors } from "./theme";

export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const drift = interpolate(frame, [0, durationInFrames], [0, 80]);
  return (
    <AbsoluteFill style={{ background: colors.bg, overflow: "hidden" }}>
      {/* Gradient warm wash */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${20 + drift / 4}% ${30 + drift / 6}%, ${colors.bgDeep} 0%, transparent 55%), radial-gradient(circle at ${80 - drift / 5}% ${75 + drift / 8}%, ${colors.accentSoft}55 0%, transparent 50%)`,
        }}
      />
      {/* Subtle noise grid */}
      <AbsoluteFill
        style={{
          opacity: 0.06,
          backgroundImage: `linear-gradient(${colors.ink} 1px, transparent 1px), linear-gradient(90deg, ${colors.ink} 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
          transform: `translate(${-drift}px, ${-drift / 2}px)`,
        }}
      />
    </AbsoluteFill>
  );
};
