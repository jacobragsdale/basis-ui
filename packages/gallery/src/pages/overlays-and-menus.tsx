/* The overlays and menus family's page: each component with a trigger that opens it. Each group of components lives
 * in overlays-and-menus/, beside its tests. */

import type { ReactElement } from "react";

import { CommandSection } from "./overlays-and-menus/command.tsx";
import { DialogSections } from "./overlays-and-menus/dialogs.tsx";
import { MenubarSection } from "./overlays-and-menus/menubar.tsx";
import { MenuSections } from "./overlays-and-menus/menus.tsx";
import { PanelSections } from "./overlays-and-menus/panels.tsx";
import { PopupSections } from "./overlays-and-menus/popups.tsx";
import { TypedConfirmDialogSection } from "./overlays-and-menus/typed-confirm.tsx";

function OverlaysAndMenus(): ReactElement {
  return (
    <div className="flex flex-col gap-8">
      <DialogSections />
      <TypedConfirmDialogSection />
      <PanelSections />
      <PopupSections />
      <MenuSections />
      <MenubarSection />
      <CommandSection />
    </div>
  );
}

export { OverlaysAndMenus };
