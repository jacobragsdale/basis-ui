/* The feedback and display family: each component's section, from feedback-and-display/, in the design's order, with
 * every variant. Each status is shown by an icon or a word as well as its colour. */

import type { ReactElement } from "react";

import { AlertSection } from "./feedback-and-display/alert.tsx";
import { AvatarSection } from "./feedback-and-display/avatar.tsx";
import { BadgeSection } from "./feedback-and-display/badge.tsx";
import { EmptySection } from "./feedback-and-display/empty.tsx";
import { KbdSection } from "./feedback-and-display/kbd.tsx";
import { ProgressSection } from "./feedback-and-display/progress.tsx";
import { SkeletonSection } from "./feedback-and-display/skeleton.tsx";
import { SpinnerSection } from "./feedback-and-display/spinner.tsx";
import { TableSection } from "./feedback-and-display/table.tsx";
import { ToastSection } from "./feedback-and-display/toast.tsx";
import { TypographySection } from "./feedback-and-display/typography.tsx";

function FeedbackAndDisplay(): ReactElement {
  return (
    <>
      <AlertSection />
      <ToastSection />
      <BadgeSection />
      <AvatarSection />
      <KbdSection />
      <ProgressSection />
      <SpinnerSection />
      <SkeletonSection />
      <EmptySection />
      <TableSection />
      <TypographySection />
    </>
  );
}

export { FeedbackAndDisplay };
