import React from "react";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { wipe } from "@remotion/transitions/wipe";
import { fade } from "@remotion/transitions/fade";
import { loadFont as loadFraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { Background } from "./components/Background";
import {
  SceneHook, SceneClass, SceneCapture, SceneGenerate, SceneReview, SceneCTA,
} from "./scenes";

loadFraunces("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
loadInter("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });

const t = (frames = 18) => springTiming({ config: { damping: 200 }, durationInFrames: frames });

type Props = { variant: "long" | "short" };

export const MainVideo: React.FC<Props> = ({ variant }) => {
  const isLong = variant === "long";
  const audio = isLong ? "audio/vo60.mp3" : "audio/vo30.mp3";

  return (
    <AbsoluteFill>
      <Background />
      <Audio src={staticFile(audio)} volume={1} />

      {isLong ? (
        <TransitionSeries>
          <TransitionSeries.Sequence durationInFrames={345}><SceneHook /></TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={t(20)} />
          <TransitionSeries.Sequence durationInFrames={300}><SceneClass /></TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={wipe({ direction: "from-bottom" })} timing={t(20)} />
          <TransitionSeries.Sequence durationInFrames={390}><SceneCapture /></TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={t(20)} />
          <TransitionSeries.Sequence durationInFrames={285}><SceneGenerate /></TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={wipe({ direction: "from-left" })} timing={t(20)} />
          <TransitionSeries.Sequence durationInFrames={330}><SceneReview /></TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={t(18)} />
          <TransitionSeries.Sequence durationInFrames={210}><SceneCTA /></TransitionSeries.Sequence>
        </TransitionSeries>
      ) : (
        <TransitionSeries>
          <TransitionSeries.Sequence durationInFrames={250}><SceneHook /></TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={t(16)} />
          <TransitionSeries.Sequence durationInFrames={200}><SceneCapture /></TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={wipe({ direction: "from-bottom" })} timing={t(16)} />
          <TransitionSeries.Sequence durationInFrames={200}><SceneGenerate /></TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={t(16)} />
          <TransitionSeries.Sequence durationInFrames={180}><SceneCTA /></TransitionSeries.Sequence>
        </TransitionSeries>
      )}
    </AbsoluteFill>
  );
};
