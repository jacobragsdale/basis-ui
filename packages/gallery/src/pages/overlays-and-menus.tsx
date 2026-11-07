/* The overlays and menus family's page, which fills as the family's components arrive. */

import type { ReactElement } from "react";

function OverlaysAndMenus(): ReactElement {
  return (
    <p className="text-sm text-muted-foreground">
      Dialog, Alert Dialog, Sheet, Drawer, Popover, Hover Card, Tooltip, Dropdown Menu, Context
      Menu, Menubar and Command arrive here with the overlays and menus family.
    </p>
  );
}

export { OverlaysAndMenus };
