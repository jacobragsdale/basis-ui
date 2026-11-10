/* Menubar on the overlays and menus page: an application's File, Edit and View menus. */

import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { usePictured } from "#pages/shot.ts";

function FileMenu(): ReactElement {
  return (
    <MenubarMenu defaultOpen={usePictured()}>
      <MenubarTrigger>File</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>
          New view
          <MenubarShortcut>Ctrl+N</MenubarShortcut>
        </MenubarItem>
        <MenubarItem>Open view</MenubarItem>
        <MenubarSeparator />
        <MenubarSub>
          <MenubarSubTrigger>Export</MenubarSubTrigger>
          <MenubarSubContent>
            <MenubarItem>CSV</MenubarItem>
            <MenubarItem>Excel</MenubarItem>
          </MenubarSubContent>
        </MenubarSub>
        <MenubarSeparator />
        <MenubarItem variant="destructive">Delete view</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}

function EditMenu(): ReactElement {
  return (
    <MenubarMenu>
      <MenubarTrigger>Edit</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>
          Undo
          <MenubarShortcut>Ctrl+Z</MenubarShortcut>
        </MenubarItem>
        <MenubarItem disabled>
          Redo
          <MenubarShortcut>Ctrl+Y</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem>Copy</MenubarItem>
        <MenubarItem>Paste</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}

function ViewMenu(): ReactElement {
  return (
    <MenubarMenu>
      <MenubarTrigger>View</MenubarTrigger>
      <MenubarContent>
        <MenubarGroup>
          <MenubarLabel>Show</MenubarLabel>
          <MenubarCheckboxItem defaultChecked>Grid lines</MenubarCheckboxItem>
          <MenubarCheckboxItem>Totals</MenubarCheckboxItem>
        </MenubarGroup>
        <MenubarSeparator />
        <MenubarRadioGroup defaultValue="comfortable">
          <MenubarLabel>Density</MenubarLabel>
          <MenubarRadioItem value="comfortable">Comfortable</MenubarRadioItem>
          <MenubarRadioItem value="compact">Compact</MenubarRadioItem>
        </MenubarRadioGroup>
      </MenubarContent>
    </MenubarMenu>
  );
}

function MenubarExample(): ReactElement {
  return (
    <Menubar className="w-fit">
      <FileMenu />
      <EditMenu />
      <ViewMenu />
    </Menubar>
  );
}

function MenubarSection(): ReactElement {
  return (
    <Section
      title="Menubar"
      description="A row of menus, as in a desktop application. The arrow keys move between the menus and through each one."
    >
      <MenubarExample />
    </Section>
  );
}

export { MenubarExample, MenubarSection };
