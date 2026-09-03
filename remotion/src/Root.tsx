import React from "react";
import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";
import { Tutorial, TOTAL_FRAMES } from "./Tutorial";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="long"
      component={MainVideo}
      durationInFrames={1800}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ variant: "long" as const }}
    />
    <Composition
      id="short"
      component={MainVideo}
      durationInFrames={810}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ variant: "short" as const }}
    />
    <Composition
      id="tutorial"
      component={Tutorial}
      durationInFrames={TOTAL_FRAMES}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
