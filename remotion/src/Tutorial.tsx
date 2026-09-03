import React from "react";
import {
  AbsoluteFill,
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

type Step = {
  chapter: string;
  title: string;
  lines: string[];
  image: string;
  seconds?: number;
};

const STEPS: Step[] = [
  // Chapter 1 — getting in
  {
    chapter: "Getting started",
    title: "Create your account",
    lines: [
      "Go to smartcomment.co.za and click “Create an account”, or sign in with Google.",
      "Once your name appears as a user, all features are switched on for you.",
    ],
    image: "01_signin.png",
    seconds: 8,
  },
  // Chapter 2 — Ed-admin export
  {
    chapter: "Ed-admin · Step 1",
    title: "Open Assessment Premium",
    lines: ["In Ed-admin, go to Assessment Premium."],
    image: "s02_0.png",
    seconds: 6,
  },
  {
    chapter: "Ed-admin · Step 2",
    title: "Select your registration class",
    lines: ["Choose the registration class you are writing reports for."],
    image: "s03_0.png",
    seconds: 6,
  },
  {
    chapter: "Ed-admin · Step 3",
    title: "Open the report tool",
    lines: ["Select the report tool."],
    image: "s04_0.png",
    seconds: 6,
  },
  {
    chapter: "Ed-admin · Step 4",
    title: "Choose “Report Card PDF”",
    lines: ["Pick the Report Card PDF option — one page per student."],
    image: "s05_0.png",
    seconds: 6,
  },
  {
    chapter: "Ed-admin · Step 5",
    title: "Download the report",
    lines: [
      "Download the PDF. This single file holds every student, subject and term mark.",
    ],
    image: "s06_0.png",
    seconds: 7,
  },
  // Chapter 3 — creating the class
  {
    chapter: "SmartComment · Step 1",
    title: "Click “+ New class”",
    lines: ["On your Classes page, click “+ New class”."],
    image: "02_classes.png",
    seconds: 6,
  },
  {
    chapter: "SmartComment · Step 2",
    title: "Name it and tick “registration class”",
    lines: [
      "Give the class a name, then tick “This is a registration class”.",
      "Under Roster, click “Upload report PDF”.",
    ],
    image: "04_newclass_reg.png",
    seconds: 9,
  },
  {
    chapter: "SmartComment · Step 3",
    title: "Select the report you downloaded",
    lines: ["From your Downloads folder, choose the report PDF and click “Open”."],
    image: "s09_0.png",
    seconds: 7,
  },
  {
    chapter: "SmartComment · Step 4",
    title: "Wait while the report is read",
    lines: [
      "Roster will show “Reading report…”. This can take a few minutes — keep the page open.",
    ],
    image: "s10_0.png",
    seconds: 7,
  },
  {
    chapter: "SmartComment · Step 5",
    title: "Check names and set gender",
    lines: [
      "Correct any spelling, then set each student's gender.",
      "Left unset, comments stay gender-neutral.",
    ],
    image: "s11_0.png",
    seconds: 9,
  },
  {
    chapter: "Your class",
    title: "Every mark is now saved",
    lines: [
      "Term 1, 2 and 3 marks for the whole class are stored and used when generating comments.",
    ],
    image: "05_classview.png",
    seconds: 8,
  },
  {
    chapter: "Your class",
    title: "View the marksheet",
    lines: [
      "Click “Marksheet” to see every subject and term, add assessments, or paste marks in from Excel.",
    ],
    image: "07_marksheet.png",
    seconds: 8,
  },
  // Chapter 4 — notes
  {
    chapter: "Notes",
    title: "Four ways to add your own notes",
    lines: [
      "Open a student, then type a note — the quickest option for a line or two.",
    ],
    image: "09_notes.png",
    seconds: 8,
  },
  {
    chapter: "Notes",
    title: "Record a voice note",
    lines: [
      "Speak your observations and they are transcribed for you.",
      "Typing and voice notes give the best results.",
    ],
    image: "11_voice.png",
    seconds: 8,
  },
  {
    chapter: "Notes",
    title: "Photograph handwritten notes",
    lines: ["Snap your handwritten notes and SmartComment reads them."],
    image: "12_handwriting.png",
    seconds: 7,
  },
  {
    chapter: "Notes",
    title: "Or upload a file",
    lines: ["Already have notes saved? Upload the file straight onto the student."],
    image: "13_upload.png",
    seconds: 7,
  },
  // Chapter 5 — generating
  {
    chapter: "Generating",
    title: "One student at a time",
    lines: [
      "“Generate comment” writes a comment for the student on screen.",
      "Use “Back to class” to return to the whole class.",
    ],
    image: "09_notes.png",
    seconds: 8,
  },
  {
    chapter: "Generating",
    title: "Or the whole class at once",
    lines: [
      "“Generate all” writes comments for every student in one go.",
      "For very large classes, work through it in chunks.",
    ],
    image: "06_classview_students.png",
    seconds: 9,
  },
  // Chapter 6 — review
  {
    chapter: "Review & export",
    title: "Review your comments",
    lines: [
      "“Review comments” shows every comment together, with word and character counts.",
    ],
    image: "08_review.png",
    seconds: 8,
  },
  {
    chapter: "Review & export",
    title: "Tweak, then export",
    lines: [
      "Edit by hand, run “Spelling & grammar”, rewrite a selection, or regenerate.",
      "When you're happy, export to DOCX or CSV — or copy them all.",
    ],
    image: "08_review.png",
    seconds: 10,
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

const Shot: React.FC<{ src: string; total: number }> = ({ src, total }) => {
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
          borderRadius: 20,
          overflow: "hidden",
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
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      </div>
    </div>
  );
};

const StepScene: React.FC<{ step: Step; total: number }> = ({ step, total }) => (
  <AbsoluteFill style={{ flexDirection: "row", alignItems: "center" }}>
    <Panel step={step} />
    <Shot src={step.image} total={total} />
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

export const TITLE_FRAMES = f(5);
export const OUTRO_FRAMES = f(5);
export const TOTAL_FRAMES =
  TITLE_FRAMES + OUTRO_FRAMES + STEPS.reduce((a, s) => a + f(s.seconds ?? 7), 0);

export const Tutorial: React.FC = () => {
  let cursor = TITLE_FRAMES;
  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <Bg />
      <Sequence from={0} durationInFrames={TITLE_FRAMES}>
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
