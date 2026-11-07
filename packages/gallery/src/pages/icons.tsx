/* Every icon @basis/ui ships, under its lucide name. An icon takes its colour from the text around it and its size
 * from the component it sits in, and stands alone at 24 px. */

import {
  ArrowDownIcon,
  ArrowDownWideNarrowIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ArrowUpNarrowWideIcon,
  ArrowUpRightIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronsUpDownIcon,
  CircleCheckBigIcon,
  CircleCheckIcon,
  CircleExclamationPointIcon,
  CircleIcon,
  CircleXIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  FunnelIcon,
  GripVerticalIcon,
  InfoIcon,
  LoaderCircleIcon,
  LogOutIcon,
  MenuIcon,
  MinusIcon,
  OctagonXIcon,
  PanelLeftIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  SquarePenIcon,
  TrashIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  TriangleExclamationPointIcon,
  UploadIcon,
  UserIcon,
  XIcon,
} from "@basis/ui";
import type { ReactElement } from "react";

// Each icon by its current lucide name, which the shorthand keeps through minification.
const icons = {
  ArrowDownIcon,
  ArrowDownWideNarrowIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ArrowUpNarrowWideIcon,
  ArrowUpRightIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronsUpDownIcon,
  CircleCheckBigIcon,
  CircleCheckIcon,
  CircleExclamationPointIcon,
  CircleIcon,
  CircleXIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  FunnelIcon,
  GripVerticalIcon,
  InfoIcon,
  LoaderCircleIcon,
  LogOutIcon,
  MenuIcon,
  MinusIcon,
  OctagonXIcon,
  PanelLeftIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  SquarePenIcon,
  TrashIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  TriangleExclamationPointIcon,
  UploadIcon,
  UserIcon,
  XIcon,
};

function Icons(): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        lucide&apos;s icons, copied in. Each is also exported under lucide&apos;s older names, such
        as AlertTriangleIcon for TriangleExclamationPointIcon.
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {Object.entries(icons).map(([name, Glyph]) => (
          <li
            key={name}
            className="flex flex-col items-center gap-2 rounded-lg border px-2 py-3 text-center"
          >
            <Glyph />
            <span className="text-xs break-all text-muted-foreground">{name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { Icons };
