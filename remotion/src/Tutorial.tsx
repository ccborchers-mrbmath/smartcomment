import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadFraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { colors } from "./theme";

loadFraunces("normal", { weights: ["400", "600", "700"], subsets: ["latin"] });
loadInter("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

type Highlight = {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  labelBelow?: boolean;
  delay: number;
};

type Step = {
  chapter: string;
  title: string;
  lines: string[];
  image: string;
  seconds?: number;
  vo?: string;
  highlights?: Highlight[];
};

const STEPS: Step[] = [
  {
    chapter: "Getting started",
    title: "Create your account",
    lines: [
      "Go to smartcomment.co.za and click \u201cCreate an account\u201d, or sign in with Google.",
      "Once your name appears as a user, all features are switched on for you.",
    ],
    image: "01_signin.png",
    seconds: 11.7,
    vo: "s01",
  },
  {
    chapter: "Ed-admin \u00b7 Step 1",
    title: "Open Assessment Premium",
    lines: ["In Ed-admin, go to Assessment Premium."],
    image: "s02_0.png",
    seconds: 6.7,
    vo: "s02",
  },
  {
    chapter: "Ed-admin \u00b7 Step 2",
    title: "Select your registration class",
    lines: ["Choose the registration class you are writing reports for."],
    image: "s03_0.png",
    seconds: 5.4,
    vo: "s03",
  },
  {
    chapter: "Ed-admin \u00b7 Step 3",
    title: "Open the report tool",
    lines: ["Select the report tool."],
    image: "s04_0.png",
    seconds: 4.2,
    vo: "s04",
  },
  {
    chapter: "Ed-admin \u00b7 Step 4",
    title: "Choose \u201cReport Card PDF\u201d",
    lines: ["Pick the Report Card PDF option \u2014 one page per student."],
    image: "s05_0.png",
    seconds: 6.6,
    vo: "s05",
  },
  {
    chapter: "Ed-admin \u00b7 Step 5",
    title: "Download the report",
    lines: [
      "Download the PDF. This single file holds every student, subject and term mark.",
    ],
    image: "s06_0.png",
    seconds: 9.2,
    vo: "s06",
  },
  {
    chapter: "SmartComment \u00b7 Step 1",
    title: "Click \u201c+ New class\u201d",
    lines: ["On your Classes page, click \u201c+ New class\u201d."],
    image: "02_classes.png",
    seconds: 6.6,
    vo: "s07",
    highlights: [
      { x: 0.767, y: 0.160, w: 0.121, h: 0.048, label: "New class", delay: 2.6 },
    ],
  },
  {
    chapter: "SmartComment \u00b7 Step 2",
    title: "Name it and tick \u201cregistration class\u201d",
    lines: [
      "Give the class a name, then tick \u201cThis is a registration class\u201d.",
      "Under Roster, click \u201cUpload report PDF\u201d.",
    ],
    image: "04_newclass_reg.png",
    seconds: 10.0,
    vo: "s08",
    highlights: [
      { x: 0.130, y: 0.634, w: 0.348, h: 0.055, label: "Registration class", delay: 2.4 },
      { x: 0.532, y: 0.464, w: 0.132, h: 0.048, label: "Upload report PDF", delay: 5.6 },
    ],
  },
  {
    chapter: "SmartComment \u00b7 Step 3",
    title: "Select the report you downloaded",
    lines: ["From your Downloads folder, choose the report PDF and click \u201cOpen\u201d."],
    image: "s09_0.png",
    seconds: 6.9,
    vo: "s09",
  },
  {
    chapter: "SmartComment \u00b7 Step 4",
    title: "Wait while the report is read",
    lines: [
      "Roster will show \u201cReading report\u2026\u201d. This can take a few minutes \u2014 keep the page open.",
    ],
    image: "s10_0.png",
    seconds: 9.8,
    vo: "s10",
  },
  {
    chapter: "SmartComment \u00b7 Step 5",
    title: "Check names and set gender",
    lines: [
      "Correct any spelling, then set each student's gender.",
      "Left unset, comments stay gender-neutral.",
    ],
    image: "s11_0.png",
    seconds: 11.2,
    vo: "s11",
  },
  {
    chapter: "Your class",
    title: "Every mark is now saved",
    lines: [
      "Term 1, 2 and 3 marks for the whole class are stored and used when generating comments.",
    ],
    image: "05_classview.png",
    seconds: 10.3,
    vo: "s12",
  },
  {
    chapter: "Your class",
    title: "View the marksheet",
    lines: [
      "Click \u201cMarksheet\u201d to see every subject and term, add assessments, or paste marks in from Excel.",
    ],
    image: "07_marksheet.png",
    seconds: 10.0,
    vo: "s13",
  },
  {
    chapter: "Notes",
    title: "Four ways to add your own notes",
    lines: [
      "Open a student, then type a note \u2014 the quickest option for a line or two.",
    ],
    image: "09_notes.png",
    seconds: 10.0,
    vo: "s14",
    highlights: [
      { x: 0.132, y: 0.381, w: 0.090, h: 0.037, label: "Type", delay: 3.6 },
      { x: 0.132, y: 0.594, w: 0.344, h: 0.046, label: "Save note", labelBelow: true, delay: 6.6 },
    ],
  },
  {
    chapter: "Notes",
    title: "Record a voice note",
    lines: [
      "Speak your observations and they are transcribed for you.",
      "Typing and voice notes give the best results.",
    ],
    image: "11_voice.png",
    seconds: 10.7,
    vo: "s15",
    highlights: [
      { x: 0.218, y: 0.381, w: 0.088, h: 0.037, label: "Voice tab", delay: 1.8 },
      { x: 0.132, y: 0.443, w: 0.344, h: 0.052, label: "Record voice note", labelBelow: true, delay: 4.6 },
    ],
  },
  {
    chapter: "Notes",
    title: "Photograph handwritten notes",
    lines: ["Snap your handwritten notes and SmartComment reads them."],
    image: "12_handwriting.png",
    seconds: 8.6,
    vo: "s16",
    highlights: [
      { x: 0.302, y: 0.381, w: 0.088, h: 0.037, label: "Photo tab", delay: 1.8 },
    ],
  },
  {
    chapter: "Notes",
    title: "Or upload a file",
    lines: ["Already have notes saved? Upload the file straight onto the student."],
    image: "13_upload.png",
    seconds: 7.2,
    vo: "s17",
    highlights: [
      { x: 0.386, y: 0.381, w: 0.088, h: 0.037, label: "Attach tab", delay: 1.6 },
    ],
  },
  {
    chapter: "Generating",
    title: "One student at a time",
    lines: [
      "\u201cGenerate comment\u201d writes a comment for the student on screen.",
      "Use \u201cBack to class\u201d to return to the whole class.",
    ],
    image: "09_notes.png",
    seconds: 11.0,
    vo: "s18",
    highlights: [
      { x: 0.749, y: 0.186, w: 0.140, h: 0.048, label: "Generate comment", delay: 1.6 },
      { x: 0.118, y: 0.132, w: 0.100, h: 0.040, label: "Back to class", labelBelow: true, delay: 7.0 },
    ],
  },
  {
    chapter: "Generating",
    title: "Or the whole class at once",
    lines: [
      "\u201cGenerate all\u201d writes comments for every student in one go.",
      "For very large classes, work through it in chunks.",
    ],
    image: "05_classview.png",
    seconds: 9.5,
    vo: "s19",
    highlights: [
      { x: 0.779, y: 0.186, w: 0.125, h: 0.048, label: "Generate all", delay: 1.5 },
    ],
  },
  {
    chapter: "Review & export",
    title: "Review your comments",
    lines: [
      "\u201cReview comments\u201d shows every comment together, with word and character counts.",
    ],
    image: "05_classview.png",
    seconds: 7.0,
    vo: "s20",
    highlights: [
      { x: 0.645, y: 0.186, w: 0.140, h: 0.048, label: "Review comments", delay: 1.4 },
    ],
  },
  {
    chapter: "Review & export",
    title: "Tweak, then export",
    lines: [
      "Edit by hand, run \u201cSpelling & grammar\u201d, rewrite a selection, or regenerate.",
      "When you're happy, export to DOCX or CSV \u2014 or copy them all.",
    ],
    image: "08_review.png",
    seconds: 13.8,
    vo: "s21",
    highlights: [
      { x: 0.350, y: 0.336, w: 0.120, h: 0.032, label: "Spelling & grammar", delay: 3.2 },
      { x: 0.775, y: 0.220, w: 0.110, h: 0.042, label: "Export DOCX", delay: 8.6 },
    ],
  },
];

const FPS = 30;
const f = (s: number) => Math.round(s * FPS);

const Panel: React.FC<{ step: Step }> = ({ step }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 20 });
  const x = interpolate(s, [0, 1], [-60, 0]);

  return (
    <div
      style={{
        width: 620,
        padding: "0 72px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        transform: `translateX(${x}px)`,
        opacity: s,
      }}
    >
      <div
        style={{
          fontFamily: "Inter",
          fontSize: 22,
          letterSpacing: 2.4,
          textTransform: "uppercase",
          color: colors.accent,
          fontWeight: 600,
          marginBottom: 22,
        }}
      >
        {step.chapter}
      </div>
      <div
        style={{
          fontFamily: "Fraunces",
          fontSize: 58,
          lineHeight: 1.06,
          color: colors.ink,
          fontWeight: 600,
          marginBottom: 30,
        }}
      >
        {step.title}
      </div>
      {step.lines.map((l, i) => {
        const ls = spring({
          frame: frame - 12 - i * 8,
          fps,
          config: { damping: 200 },
          durationInFrames: 18,
        });
        return (
          <div
            key={i}
            style={{
              fontFamily: "Inter",
              fontSize: 27,
              lineHeight: 1.45,
              color: colors.inkSoft,
              marginBottom: 18,
              opacity: ls,
              transform: `translateY(${interpolate(ls, [0, 1], [16, 0])}px)`,
            }}
          >
            {l}
          </div>
        );
      })}
    </div>
  );
};

const Ring: React.FC<{ hl: Highlight }> = ({ hl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = Math.round(hl.delay * fps);
  const local = frame - start;
  if (local < 0) return null;
  const appear = spring({
    frame: local,
    fps,
    config: { damping: 200 },
    durationInFrames: 14,
  });
  const pulse = 0.5 + 0.5 * Math.sin((local / fps) * Math.PI * 1.6);
  const pad = 12;

  return (
    <div
      style={{
        position: "absolute",
        left: `${hl.x * 100}%`,
        top: `${hl.y * 100}%`,
        width: `${hl.w * 100}%`,
        height: `${hl.h * 100}%`,
        opacity: appear,
        transform: `scale(${interpolate(appear, [0, 1], [1.14, 1])})`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -pad,
          borderRadius: 16,
          border: `4px solid ${colors.accent}`,
          boxShadow: `0 0 0 ${6 + pulse * 10}px rgba(214,110,52,${0.16 - pulse * 0.09}), 0 10px 30px rgba(23,34,52,0.18)`,
          background: `rgba(214,110,52,${0.06 + pulse * 0.06})`,
        }}
      />
      {hl.label ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            ...(hl.labelBelow
              ? { top: `calc(100% + ${pad + 14}px)` }
              : { bottom: `calc(100% + ${pad + 14}px)` }),
            transform: "translateX(-50%)",
            background: colors.accent,
            color: "#fff",
            fontFamily: "Inter",
            fontSize: 20,
            fontWeight: 600,
            padding: "8px 16px",
            borderRadius: 999,
            whiteSpace: "nowrap",
            boxShadow: "0 8px 22px rgba(23,34,52,0.25)",
          }}
        >
          {hl.label}
        </div>
      ) : null}
    </div>
  );
};

const Shot: React.FC<{ src: string; total: number; highlights?: Highlight[] }> = ({
  src,
  total,
  highlights,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });
  const drift = interpolate(frame, [0, total], [0, -18], { extrapolateRight: "clamp" });
  const zoom = interpolate(frame, [0, total], [1, 1.035], { extrapolateRight: "clamp" });

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingRight: 90,
      }}
    >
      <div
        style={{
          position: "relative",
          borderRadius: 20,
          border: `1px solid rgba(23,34,52,0.10)`,
          boxShadow: "0 40px 90px rgba(23,34,52,0.20)",
          background: colors.cream,
          opacity: s,
          transform: `translateY(${interpolate(s, [0, 1], [34, 0])}px) translateY(${drift}px) scale(${zoom})`,
          width: "100%",
          maxWidth: 1120,
        }}
      >
        <Img
          src={staticFile(`images/tut/${src}`)}
          style={{ display: "block", width: "100%", height: "auto", borderRadius: 20 }}
        />
        {(highlights ?? []).map((hl, i) => (
          <Ring key={i} hl={hl} />
        ))}
      </div>
    </div>
  );
};

const StepScene: React.FC<{ step: Step; total: number }> = ({ step, total }) => (
  <AbsoluteFill style={{ flexDirection: "row", alignItems: "center" }}>
    {step.vo ? <Audio src={staticFile(`audio/vo/${step.vo}.mp3`)} /> : null}
    <Panel step={step} />
    <Shot src={step.image} total={total} highlights={step.highlights} />
  </AbsoluteFill>
);


const Title: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 26 });
  const s2 = spring({ frame: frame - 16, fps, config: { damping: 200 }, durationInFrames: 26 });
  return (
    <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 150 }}>
      <div
        style={{
          fontFamily: "Inter",
          fontSize: 24,
          letterSpacing: 3,
          textTransform: "uppercase",
          color: colors.accent,
          fontWeight: 600,
          opacity: s,
        }}
      >
        SmartComment
      </div>
      <div
        style={{
          fontFamily: "Fraunces",
          fontSize: 110,
          lineHeight: 1.02,
          color: colors.ink,
          fontWeight: 600,
          marginTop: 24,
          opacity: s,
          transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)`,
        }}
      >
        Registration class
        <br />
        report comments
      </div>
      <div
        style={{
          fontFamily: "Inter",
          fontSize: 34,
          color: colors.inkSoft,
          marginTop: 34,
          opacity: s2,
          transform: `translateY(${interpolate(s2, [0, 1], [24, 0])}px)`,
        }}
      >
        From Ed-admin export to finished, exported comments.
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 26 });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          fontFamily: "Fraunces",
          fontSize: 92,
          color: colors.ink,
          fontWeight: 600,
          opacity: s,
          transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)`,
        }}
      >
        That's the whole flow.
      </div>
      <div
        style={{
          fontFamily: "Inter",
          fontSize: 32,
          color: colors.inkSoft,
          marginTop: 28,
          opacity: s,
        }}
      >
        smartcomment.co.za
      </div>
    </AbsoluteFill>
  );
};

const Bg: React.FC = () => {
  const frame = useCurrentFrame();
  const shift = interpolate(frame, [0, 4000], [0, 40]);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at ${18 + shift / 4}% 12%, ${colors.cream} 0%, ${colors.bg} 45%, ${colors.bgDeep} 100%)`,
      }}
    />
  );
};

export const TITLE_FRAMES = f(12.6);
export const OUTRO_FRAMES = f(6.4);
export const TOTAL_FRAMES =
  TITLE_FRAMES + OUTRO_FRAMES + STEPS.reduce((a, s) => a + f(s.seconds ?? 7), 0);

export const Tutorial: React.FC = () => {
  let cursor = TITLE_FRAMES;
  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <Bg />
      <Sequence from={0} durationInFrames={TITLE_FRAMES}>
        <Audio src={staticFile("audio/vo/intro.mp3")} />
        <Title />
      </Sequence>
      {STEPS.map((step, i) => {
        const dur = f(step.seconds ?? 7);
        const from = cursor;
        cursor += dur;
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <StepScene step={step} total={dur} />
          </Sequence>
        );
      })}
      <Sequence from={cursor} durationInFrames={OUTRO_FRAMES}>
        <Audio src={staticFile("audio/vo/outro.mp3")} />
        <Outro />
      </Sequence>
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-end", padding: 44 }}>
        <div style={{ fontFamily: "Inter", fontSize: 20, color: "rgba(23,34,52,0.35)" }}>
          SmartComment
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
