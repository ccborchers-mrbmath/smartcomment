import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Img, staticFile } from "remotion";
import { colors } from "../theme";
import { Word } from "../components/Type";

// Scene 1 — HOOK
export const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const outOpacity = interpolate(frame, [280, 330], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 100, opacity: Math.min(inOpacity, outOpacity) }}>
      <div style={{ position: "relative", width: "100%", maxWidth: 1500 }}>
        <div style={{ fontFamily: "Inter", fontSize: 28, color: colors.accent, letterSpacing: 6, fontWeight: 600, marginBottom: 30 }}>
          <Word text="SMARTCOMMENT" delay={0} />
        </div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 150, lineHeight: 1.05, color: colors.ink, fontWeight: 600, letterSpacing: -3 }}>
          <div><Word text="Report" delay={8} /> <Word text="card" delay={14} /> <Word text="season." delay={20} /></div>
          <div style={{ marginTop: 10 }}><Word text="Thirty" delay={36} /> <Word text="students." delay={44} /></div>
          <div style={{ marginTop: 10, color: colors.accent }}><Word text="One" delay={62} /> <Word text="weekend." delay={70} /></div>
        </div>
        <div style={{ fontFamily: "Inter", fontSize: 56, color: colors.inkSoft, marginTop: 60, fontWeight: 500, display: "flex", gap: 32 }}>
          {["Snap it.", "Say it.", "Paste it."].map((t, i) => {
            const s = spring({ frame: frame - (130 + i * 18), fps, config: { damping: 14 } });
            return (
              <span key={i} style={{
                opacity: s,
                transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px) scale(${interpolate(s, [0, 1], [0.8, 1])})`,
                color: i === 0 ? colors.accent : colors.ink,
                fontWeight: 600,
              }}>{t}</span>
            );
          })}
        </div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 44, color: colors.inkSoft, marginTop: 50, maxWidth: 1200, lineHeight: 1.3, fontStyle: "italic" }}>
          <Word text="Report-ready comments — in your voice — for every student." delay={210} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 2 — CLASS SETUP
export const SceneClass: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tag = spring({ frame, fps, config: { damping: 14 } });
  const imgIn = spring({ frame: frame - 10, fps, config: { damping: 18, stiffness: 120 } });
  const imgScale = interpolate(imgIn, [0, 1], [1.05, 1]);
  const imgY = interpolate(imgIn, [0, 1], [60, 0]);
  // slow ken-burns
  const kb = interpolate(frame, [0, 300], [1, 1.04]);
  return (
    <AbsoluteFill style={{ padding: 80, gap: 40 }}>
      <Tag text="01 / SET UP YOUR CLASS" progress={tag} />
      <div style={{ display: "flex", gap: 60, alignItems: "center", flex: 1 }}>
        <div style={{ flex: 1 }}>
          <Headline lines={["Paste a roster.", "Drag a CSV.", "Snap a photo."]} />
          <SubText delay={70} text="AI extracts the names. Confirm spelling, set pronouns, done." />
        </div>
        <div style={{ flex: 1.1, opacity: imgIn, transform: `translateY(${imgY}px) scale(${imgScale * kb})`, transformOrigin: "center" }}>
          <Frame><Img src={staticFile("images/02-newclass.png")} style={{ width: "100%", display: "block" }} /></Frame>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 3 — CAPTURE EVIDENCE
export const SceneCapture: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tag = spring({ frame, fps, config: { damping: 14 } });
  const chips = ["Voice → Text", "Photo → Text", "Just type"];
  const kb = interpolate(frame, [0, 390], [1, 1.06]);
  return (
    <AbsoluteFill style={{ padding: 80, gap: 30 }}>
      <Tag text="02 / CAPTURE EVIDENCE — ANY WAY" progress={tag} />
      <div style={{ display: "flex", gap: 50, alignItems: "center", flex: 1 }}>
        <div style={{ flex: 1.1 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {chips.map((c, i) => {
              const s = spring({ frame: frame - (30 + i * 22), fps, config: { damping: 14 } });
              return (
                <div key={i} style={{
                  opacity: s,
                  transform: `translateX(${interpolate(s, [0, 1], [-80, 0])}px)`,
                  fontFamily: "Inter", fontWeight: 700, fontSize: 64,
                  color: i === 0 ? colors.accent : colors.ink,
                  display: "flex", alignItems: "center", gap: 24,
                }}>
                  <span style={{ width: 18, height: 18, background: colors.accent, borderRadius: 999 }} />
                  {c}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 60, display: "flex", gap: 16, flexWrap: "wrap" }}>
            {["Style bank", "School requirements", "Your voice"].map((t, i) => {
              const s = spring({ frame: frame - (140 + i * 14), fps, config: { damping: 18 } });
              return (
                <Pill key={i} text={t} progress={s} />
              );
            })}
          </div>
        </div>
        <div style={{ flex: 1, transform: `scale(${kb})` }}>
          <Frame><Img src={staticFile("images/04-studentcard.png")} style={{ width: "100%", display: "block" }} /></Frame>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 4 — GENERATE
export const SceneGenerate: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tag = spring({ frame, fps, config: { damping: 14 } });
  const click = spring({ frame: frame - 30, fps, config: { damping: 8, stiffness: 200 } });
  const fillProgress = interpolate(frame, [40, 200], [0, 1], { extrapolateRight: "clamp" });
  const kb = interpolate(frame, [0, 270], [1, 1.05]);
  return (
    <AbsoluteFill style={{ padding: 80, gap: 30 }}>
      <Tag text="03 / GENERATE THE WHOLE CLASS" progress={tag} />
      <div style={{ display: "flex", gap: 60, alignItems: "center", flex: 1 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 130, lineHeight: 1, color: colors.ink, fontWeight: 600, letterSpacing: -2 }}>
            <Word text="One" delay={0} /> <Word text="click." delay={6} />
          </div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 130, lineHeight: 1, color: colors.accent, fontWeight: 600, letterSpacing: -2, marginTop: 10 }}>
            <Word text="Whole" delay={20} /> <Word text="class." delay={28} />
          </div>
          <SubText delay={60} text="Right name. Right pronouns. Right tone. Yours." />
          <div style={{ marginTop: 60, display: "inline-flex", padding: "28px 60px", borderRadius: 999, background: colors.accent, color: colors.cream, fontFamily: "Inter", fontWeight: 700, fontSize: 42, transform: `scale(${interpolate(click, [0, 1], [0.6, 1])})`, opacity: click, boxShadow: "0 20px 50px -10px rgba(228,117,58,0.5)" }}>
            ✦ Generate Comments
          </div>
          <div style={{ marginTop: 40, width: 600, height: 16, background: colors.bgDeep, borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${fillProgress * 100}%`, height: "100%", background: colors.ink, transition: "none" }} />
          </div>
          <div style={{ fontFamily: "Inter", fontSize: 28, color: colors.inkSoft, marginTop: 16, fontWeight: 500 }}>
            Processing in parallel — {Math.round(fillProgress * 30)} / 30 students
          </div>
        </div>
        <div style={{ flex: 1, transform: `scale(${kb})` }}>
          <Frame><Img src={staticFile("images/03-classview.png")} style={{ width: "100%", display: "block" }} /></Frame>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 5 — REVIEW
export const SceneReview: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tag = spring({ frame, fps, config: { damping: 14 } });
  const kb = interpolate(frame, [0, 330], [1, 1.06]);
  const labels = [
    { t: "Highlight → Rewrite", d: 30 },
    { t: "Manual edit", d: 70 },
    { t: "Spelling & grammar", d: 110 },
    { t: "Export", d: 160 },
  ];
  return (
    <AbsoluteFill style={{ padding: 80, gap: 30 }}>
      <Tag text="04 / REVIEW · REFINE · EXPORT" progress={tag} />
      <div style={{ display: "flex", gap: 60, alignItems: "center", flex: 1 }}>
        <div style={{ flex: 1.1, transform: `scale(${kb})` }}>
          <Frame><Img src={staticFile("images/05-review.png")} style={{ width: "100%", display: "block" }} /></Frame>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 28 }}>
          {labels.map((l, i) => {
            const s = spring({ frame: frame - l.d, fps, config: { damping: 16 } });
            return (
              <div key={i} style={{
                opacity: s,
                transform: `translateX(${interpolate(s, [0, 1], [60, 0])}px)`,
                fontFamily: "Inter", fontWeight: 700, fontSize: 56,
                color: i === 0 ? colors.accent : colors.ink,
                display: "flex", alignItems: "center", gap: 20,
              }}>
                <span style={{ fontFamily: "Fraunces, serif", color: colors.accent, fontWeight: 600 }}>0{i+1}</span>
                {l.t}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 6 — CTA
export const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t1 = spring({ frame, fps, config: { damping: 14 } });
  const t2 = spring({ frame: frame - 25, fps, config: { damping: 14 } });
  const pulse = 1 + Math.sin(frame / 8) * 0.02;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80, textAlign: "center" }}>
      <div style={{ fontFamily: "Inter", fontSize: 28, color: colors.accent, letterSpacing: 8, fontWeight: 700, opacity: t1 }}>
        SMARTCOMMENT
      </div>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 160, lineHeight: 1.05, color: colors.ink, fontWeight: 600, letterSpacing: -4, marginTop: 30, opacity: t1, transform: `translateY(${interpolate(t1, [0, 1], [40, 0])}px)` }}>
        Spend less time <em style={{ color: colors.accent, fontStyle: "italic" }}>writing.</em>
      </div>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 160, lineHeight: 1.05, color: colors.ink, fontWeight: 600, letterSpacing: -4, marginTop: 10, opacity: t2, transform: `translateY(${interpolate(t2, [0, 1], [40, 0])}px)` }}>
        More time <em style={{ color: colors.accent, fontStyle: "italic" }}>teaching.</em>
      </div>
      <div style={{ marginTop: 80, display: "inline-flex", padding: "32px 80px", borderRadius: 999, background: colors.ink, color: colors.cream, fontFamily: "Inter", fontWeight: 700, fontSize: 44, transform: `scale(${pulse})`, opacity: spring({ frame: frame - 60, fps, config: { damping: 14 } }) }}>
        smartcomment.lovable.app
      </div>
    </AbsoluteFill>
  );
};

// ——— shared bits ———
const Tag: React.FC<{ text: string; progress: number }> = ({ text, progress }) => (
  <div style={{
    fontFamily: "Inter", fontWeight: 700, letterSpacing: 6, fontSize: 24,
    color: colors.accent, opacity: progress,
    transform: `translateX(${interpolate(progress, [0, 1], [-30, 0])}px)`,
    display: "flex", alignItems: "center", gap: 20,
  }}>
    <span style={{ width: 60, height: 3, background: colors.accent }} />
    {text}
  </div>
);

const Headline: React.FC<{ lines: string[] }> = ({ lines }) => (
  <div style={{ fontFamily: "Fraunces, serif", fontSize: 110, lineHeight: 1.05, color: colors.ink, fontWeight: 600, letterSpacing: -2 }}>
    {lines.map((l, i) => (
      <div key={i} style={{ color: i === 0 ? colors.ink : i === 1 ? colors.inkSoft : colors.accent }}>
        <Word text={l} delay={20 + i * 18} />
      </div>
    ))}
  </div>
);

const SubText: React.FC<{ text: string; delay: number }> = ({ text, delay }) => (
  <div style={{ fontFamily: "Inter", fontSize: 36, color: colors.inkSoft, marginTop: 40, maxWidth: 700, lineHeight: 1.4, fontWeight: 500 }}>
    <Word text={text} delay={delay} />
  </div>
);

const Pill: React.FC<{ text: string; progress: number }> = ({ text, progress }) => (
  <div style={{
    opacity: progress,
    transform: `scale(${interpolate(progress, [0, 1], [0.6, 1])})`,
    border: `2px solid ${colors.ink}`, padding: "12px 28px",
    fontFamily: "Inter", fontWeight: 600, fontSize: 26, color: colors.ink, borderRadius: 999,
  }}>
    {text}
  </div>
);

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    borderRadius: 24, overflow: "hidden",
    boxShadow: "0 40px 80px -20px rgba(23,34,52,0.35), 0 0 0 1px rgba(23,34,52,0.08)",
    background: "white",
  }}>
    {children}
  </div>
);
