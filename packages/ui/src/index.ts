/* @basis/ui's entry point. It names every export rather than using `export *`: `oxc/no-barrel-file` fails a file whose
 * `export *` lines load more than 100 modules, and Base UI's Select alone loads more than 180. The app shell arrives in
 * a later roadmap step. */

// Forms and inputs. Each family's agent edits only its family's block, so families built at once do not collide.
export { Button } from "./components/button.tsx";
export { ButtonLink } from "./components/button-link.ts";

// Overlays and menus: none yet.

// Navigation and layout.
export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/card.tsx";

// Feedback and display.
export { Badge } from "./components/badge.ts";

export type { CssVariable } from "./components/css-variables.ts";

/* The icons, copied from lucide-react 1.70.0: each under every name lucide-react gives it with the `Icon` suffix, its
 * current name first and then its older aliases, so what an agent knows of lucide carries over. */
export { ArrowDownIcon } from "./vendor/lucide/arrow-down.tsx";
export {
  ArrowDownWideNarrowIcon,
  ArrowDownWideNarrowIcon as SortDescIcon,
} from "./vendor/lucide/arrow-down-wide-narrow.tsx";
export { ArrowLeftIcon } from "./vendor/lucide/arrow-left.tsx";
export { ArrowRightIcon } from "./vendor/lucide/arrow-right.tsx";
export { ArrowUpIcon } from "./vendor/lucide/arrow-up.tsx";
export { ArrowUpDownIcon } from "./vendor/lucide/arrow-up-down.tsx";
export {
  ArrowUpNarrowWideIcon,
  ArrowUpNarrowWideIcon as SortAscIcon,
} from "./vendor/lucide/arrow-up-narrow-wide.tsx";
export { ArrowUpRightIcon } from "./vendor/lucide/arrow-up-right.tsx";
export { CalendarIcon } from "./vendor/lucide/calendar.tsx";
export { CheckIcon } from "./vendor/lucide/check.tsx";
export { ChevronDownIcon } from "./vendor/lucide/chevron-down.tsx";
export { ChevronLeftIcon } from "./vendor/lucide/chevron-left.tsx";
export { ChevronRightIcon } from "./vendor/lucide/chevron-right.tsx";
export { ChevronUpIcon } from "./vendor/lucide/chevron-up.tsx";
export { ChevronsLeftIcon } from "./vendor/lucide/chevrons-left.tsx";
export { ChevronsRightIcon } from "./vendor/lucide/chevrons-right.tsx";
export { ChevronsUpDownIcon } from "./vendor/lucide/chevrons-up-down.tsx";
export { CircleIcon } from "./vendor/lucide/circle.tsx";
export {
  CircleCheckIcon,
  CircleCheckIcon as CheckCircle2Icon,
} from "./vendor/lucide/circle-check.tsx";
export {
  CircleCheckBigIcon,
  CircleCheckBigIcon as CheckCircleIcon,
} from "./vendor/lucide/circle-check-big.tsx";
export {
  CircleExclamationPointIcon,
  CircleExclamationPointIcon as AlertCircleIcon,
  CircleExclamationPointIcon as CircleAlertIcon,
} from "./vendor/lucide/circle-exclamation-point.tsx";
export { CircleXIcon, CircleXIcon as XCircleIcon } from "./vendor/lucide/circle-x.tsx";
export { ClockIcon } from "./vendor/lucide/clock.tsx";
export { CopyIcon } from "./vendor/lucide/copy.tsx";
export { DownloadIcon } from "./vendor/lucide/download.tsx";
export { EllipsisIcon, EllipsisIcon as MoreHorizontalIcon } from "./vendor/lucide/ellipsis.tsx";
export {
  EllipsisVerticalIcon,
  EllipsisVerticalIcon as MoreVerticalIcon,
} from "./vendor/lucide/ellipsis-vertical.tsx";
export { ExternalLinkIcon } from "./vendor/lucide/external-link.tsx";
export { EyeIcon } from "./vendor/lucide/eye.tsx";
export { EyeOffIcon } from "./vendor/lucide/eye-off.tsx";
export { FunnelIcon, FunnelIcon as FilterIcon } from "./vendor/lucide/funnel.tsx";
export { GripVerticalIcon } from "./vendor/lucide/grip-vertical.tsx";
export { InfoIcon } from "./vendor/lucide/info.tsx";
export {
  LoaderCircleIcon,
  LoaderCircleIcon as Loader2Icon,
} from "./vendor/lucide/loader-circle.tsx";
export { LogOutIcon } from "./vendor/lucide/log-out.tsx";
export { MenuIcon } from "./vendor/lucide/menu.tsx";
export { MinusIcon } from "./vendor/lucide/minus.tsx";
export { OctagonXIcon, OctagonXIcon as XOctagonIcon } from "./vendor/lucide/octagon-x.tsx";
export { PanelLeftIcon, PanelLeftIcon as SidebarIcon } from "./vendor/lucide/panel-left.tsx";
export { PencilIcon } from "./vendor/lucide/pencil.tsx";
export { PlusIcon } from "./vendor/lucide/plus.tsx";
export { RefreshCwIcon } from "./vendor/lucide/refresh-cw.tsx";
export { SearchIcon } from "./vendor/lucide/search.tsx";
export { SettingsIcon } from "./vendor/lucide/settings.tsx";
export {
  SquarePenIcon,
  SquarePenIcon as EditIcon,
  SquarePenIcon as PenBoxIcon,
  SquarePenIcon as PenSquareIcon,
} from "./vendor/lucide/square-pen.tsx";
export { TrashIcon, TrashIcon as Trash2Icon } from "./vendor/lucide/trash.tsx";
export { TrendingDownIcon } from "./vendor/lucide/trending-down.tsx";
export { TrendingUpIcon } from "./vendor/lucide/trending-up.tsx";
export {
  TriangleExclamationPointIcon,
  TriangleExclamationPointIcon as AlertTriangleIcon,
  TriangleExclamationPointIcon as TriangleAlertIcon,
} from "./vendor/lucide/triangle-exclamation-point.tsx";
export { UploadIcon } from "./vendor/lucide/upload.tsx";
export { UserIcon } from "./vendor/lucide/user.tsx";
export { XIcon } from "./vendor/lucide/x.tsx";
export type { IconProps } from "./vendor/lucide/icon.tsx";

export {
  FormatError,
  createFormatter,
  defaultZone,
  maxDecimals,
  nullText,
  outOfRangeText,
  undefinedText,
  type Abbreviation,
  type Format,
  type FormatErrorReason,
  type Formatter,
  type Negative,
  type TimePrecision,
} from "./format/format.ts";
export {
  amountSuffixes,
  parSuffixes,
  parseAmount,
  rateSuffixes,
  type ParseResult,
  type Suffixes,
} from "./format/parse.ts";
export {
  applyPreferences,
  defaultPreferences,
  followPreferences,
  headScript,
  parsePreferences,
  preferencesCookie,
  readPreferences,
  resolveMode,
  serializePreferences,
  writePreferences,
  type CookieOptions,
  type Density,
  type ModePreference,
  type Preferences,
  type PreferencesRoot,
  type ResolvedMode,
} from "./theme/preferences.ts";
export { tokenNames } from "./theme/tokens.ts";
export {
  ApiError,
  apiFetch,
  apiPrefix,
  arrowStream,
  isApiError,
  setTokenSource,
  type AnyProblem,
  type ApiRequestInit,
  type ApiResponse,
  type ErrorType,
  type TokenSource,
} from "./api/fetch.ts";
export {
  fieldErrorSchema,
  fieldErrors,
  pointerPath,
  problemSchema,
  validationProblemSchema,
  type FieldError,
  type Problem,
  type ValidationProblem,
} from "./api/problem.ts";
