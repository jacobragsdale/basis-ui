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
  ChartCandlestickIcon,
  ChartColumnIcon,
  ChartLineIcon,
  ChartPieIcon,
  ChartScatterIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CircleCheckBigIcon,
  CircleCheckIcon,
  CircleExclamationPointIcon,
  CircleIcon,
  CircleXIcon,
  ClockIcon,
  Columns3Icon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  FunnelIcon,
  GaugeIcon,
  GripVerticalIcon,
  GroupIcon,
  InfoIcon,
  LayoutDashboardIcon,
  LoaderCircleIcon,
  LogOutIcon,
  Maximize2Icon,
  MenuIcon,
  Minimize2Icon,
  MinusIcon,
  OctagonXIcon,
  PaletteIcon,
  PanelLeftIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  SigmaIcon,
  SquarePenIcon,
  SunMoonIcon,
  TableIcon,
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
  ChartCandlestickIcon,
  ChartColumnIcon,
  ChartLineIcon,
  ChartPieIcon,
  ChartScatterIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CircleCheckBigIcon,
  CircleCheckIcon,
  CircleExclamationPointIcon,
  CircleIcon,
  CircleXIcon,
  ClockIcon,
  Columns3Icon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  FunnelIcon,
  GaugeIcon,
  GripVerticalIcon,
  GroupIcon,
  InfoIcon,
  LayoutDashboardIcon,
  LoaderCircleIcon,
  LogOutIcon,
  Maximize2Icon,
  MenuIcon,
  Minimize2Icon,
  MinusIcon,
  OctagonXIcon,
  PaletteIcon,
  PanelLeftIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  SigmaIcon,
  SquarePenIcon,
  SunMoonIcon,
  TableIcon,
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
