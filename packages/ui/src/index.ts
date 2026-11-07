/* @basis/ui's entry point. It names every export rather than using `export *`: `oxc/no-barrel-file` fails a file whose
 * `export *` lines load more than 100 modules, and Base UI's Select alone loads more than 180. */

// Forms and inputs. Each family's agent edits only its family's block, so families built at once do not collide.
export { Button } from "./components/button.tsx";
export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "./components/button-group.tsx";
export { ButtonLink } from "./components/button-link.ts";
export { Checkbox } from "./components/checkbox.tsx";
export {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
} from "./components/combobox.tsx";
export { useComboboxAnchor } from "./components/combobox-anchor.ts";
export { ComboboxChip, ComboboxChips, ComboboxChipsInput } from "./components/combobox-chips.tsx";
export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "./components/field.tsx";
export { Input } from "./components/input.tsx";
export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "./components/input-group.tsx";
export { Label } from "./components/label.tsx";
export {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "./components/native-select.tsx";
export { RadioGroup, RadioGroupItem } from "./components/radio-group.tsx";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./components/select.tsx";
export { Slider } from "./components/slider.tsx";
export { Switch } from "./components/switch.tsx";
export { Textarea } from "./components/textarea.tsx";
export { Toggle } from "./components/toggle.tsx";
export { ToggleGroup, ToggleGroupItem } from "./components/toggle-group.tsx";

// Overlays and menus.
/* oxlint-disable eslint/max-lines -- this file names every export, one a line as Oxfmt prints them, since
 * `oxc/no-barrel-file` forbids `export *`, and with each family's components it passes 300 lines. The directive sits in
 * this family's block because each family edits only its own; it holds to the end of the file. */
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./components/alert-dialog.tsx";
export {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
  CommandSeparator,
} from "./components/command.tsx";
export { CommandDialog } from "./components/command-dialog.tsx";
export { CommandItem, CommandShortcut } from "./components/command-item.tsx";
export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./components/context-menu.tsx";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./components/dialog.tsx";
export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerSwipeHandle,
  DrawerTitle,
  DrawerTrigger,
} from "./components/drawer.tsx";
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./components/dropdown-menu.tsx";
export { HoverCard, HoverCardContent, HoverCardTrigger } from "./components/hover-card.tsx";
export {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarPortal,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "./components/menubar.tsx";
export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./components/popover.tsx";
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./components/sheet.tsx";
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/tooltip.tsx";

// Navigation and layout.
export {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./components/accordion.tsx";
export { AspectRatio } from "./components/aspect-ratio.tsx";
export {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./components/breadcrumb.tsx";
export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/card.tsx";
export { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./components/collapsible.tsx";
export {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "./components/item.tsx";
export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuPositioner,
  NavigationMenuTrigger,
} from "./components/navigation-menu.tsx";
export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./components/pagination.tsx";
export { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/resizable.tsx";
export type { ResizableLayout } from "./components/resizable-layout.ts";
export { ScrollArea, ScrollBar } from "./components/scroll-area.tsx";
export { Separator } from "./components/separator.tsx";
export {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "./components/sidebar.tsx";
export {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInput,
  SidebarSeparator,
} from "./components/sidebar-sections.tsx";
export { useSidebar, type SidebarContextProps } from "./components/sidebar-context.ts";
export {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "./components/sidebar-group.tsx";
export {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "./components/sidebar-menu.tsx";
export { SidebarMenuButton } from "./components/sidebar-menu-button.tsx";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/tabs.tsx";

// Feedback and display.
export { Alert, AlertAction, AlertDescription, AlertTitle } from "./components/alert.tsx";
export {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "./components/avatar.tsx";
export { Badge } from "./components/badge.ts";
export {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./components/empty.tsx";
export { Kbd, KbdGroup } from "./components/kbd.tsx";
export {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "./components/progress.tsx";
export { Skeleton } from "./components/skeleton.tsx";
export { Spinner } from "./components/spinner.tsx";
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./components/table.tsx";
export {
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  Toaster,
} from "./components/toast.tsx";
export { createToastManager, toast, useToastManager } from "./components/toast-manager.ts";
export {
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyInlineCode,
  TypographyLead,
  TypographyList,
  TypographyMuted,
  TypographyP,
} from "./components/typography.ts";

// Numbers and dates: the firm's own components, which show and take values by parallax's rules.
export { AmountInput } from "./components/amount-input.tsx";
export { amountSchema } from "./components/amount-schema.ts";
export { AsOfDatePicker } from "./components/as-of-date-picker.tsx";
export { DateRangePicker } from "./components/date-range-picker.tsx";
export {
  dateRangePresets,
  rangeForPreset,
  type DateRangePreset,
} from "./components/date-range-presets.ts";
export { defaultAsOfDate, type AsOfOptions } from "./components/date-picking.ts";
export { DateTime } from "./components/date-time.tsx";
export type { DateTimePart, DateTimeValue } from "./components/date-time-text.ts";
export { Bps, Money, Num, Pct, Price32 } from "./components/num.tsx";
export type { BpsUnit, DecimalLike, NumericValue, PercentUnit } from "./components/num-text.ts";

// Data: the firm's own components for small tables, searching for an entity, and importing a CSV file.
export { DataTable, type DataTableProps } from "./components/data-table.tsx";
export type {
  DataTableColumn,
  DataTableNumericColumn,
  DataTableRowAction,
  DataTableSort,
  DataTableTextColumn,
} from "./components/data-table-columns.ts";
export { EntityPicker } from "./components/entity-picker.tsx";
export type {
  EntityPickerProps,
  MultipleEntityPickerProps,
  SingleEntityPickerProps,
} from "./components/entity-picker-props.ts";
export type { EntitySearch } from "./components/entity-search.ts";
export {
  SecurityPicker,
  type SecurityPickerProps,
  type SecuritySearch,
} from "./components/security-picker.tsx";
export type {
  SecurityIdentifier,
  SecurityIdentifierKind,
} from "./securities/security-identifier.ts";
export { FileImport, type FileImportProps } from "./components/file-import.tsx";
export type { ImportHeaders, ImportSchema } from "./components/file-import-rows.ts";

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
export { ChevronsDownUpIcon } from "./vendor/lucide/chevrons-down-up.tsx";
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
export { Columns3Icon, Columns3Icon as PanelsLeftRightIcon } from "./vendor/lucide/columns-3.tsx";
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
export { GroupIcon } from "./vendor/lucide/group.tsx";
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
export { PinIcon } from "./vendor/lucide/pin.tsx";
export { PlusIcon } from "./vendor/lucide/plus.tsx";
export { RefreshCwIcon } from "./vendor/lucide/refresh-cw.tsx";
export { SearchIcon } from "./vendor/lucide/search.tsx";
export { SettingsIcon } from "./vendor/lucide/settings.tsx";
export { SigmaIcon } from "./vendor/lucide/sigma.tsx";
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
  type SuffixStyle,
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
  fieldName,
  pointerPath,
  problemSchema,
  validationProblemSchema,
  type FieldError as ProblemFieldError,
  type Problem,
  type ValidationProblem,
} from "./api/problem.ts";

// The app shell: its providers, the sign-in adapter and its fake, telemetry, and how errors are shown.
export { ErrorAlert, type ErrorAlertProps } from "./components/error-alert.tsx";
export { BasisApp, type BasisAppProps } from "./shell/basis-app.tsx";
export { describeError, type ErrorDescription, type FieldProblem } from "./shell/describe-error.ts";
export { createQueryClient } from "./shell/query-client.ts";
export { useSession, type Session } from "./shell/session.ts";
export { toastError } from "./shell/toast-error.tsx";
export {
  fakeSignIn,
  fakeUser,
  type FakeSignInOptions,
  type SignIn,
  type User,
} from "./shell/sign-in.ts";
export {
  consoleTelemetry,
  useTelemetry,
  type Telemetry,
  type TelemetryAttributes,
} from "./shell/telemetry.ts";
