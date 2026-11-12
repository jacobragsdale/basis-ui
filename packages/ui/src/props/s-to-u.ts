/* The props types of the components from Spinner to UserMenu whose files declare none of their own: `ComponentProps`
 * of each, named for it, as `ButtonProps`, so an app that wraps a component or passes its props names them. A test
 * (tests/props-types.test.ts) holds every exported component to having one. A generic component's type parameters are
 * unknown here. */

import type { ComponentProps } from "react";

import type {
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  Toaster,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyInlineCode,
  TypographyLead,
  TypographyList,
  TypographyMuted,
  TypographyP,
  UserMenu,
} from "#index.ts";

type SpinnerProps = ComponentProps<typeof Spinner>;
type SwitchProps = ComponentProps<typeof Switch>;
type TableProps = ComponentProps<typeof Table>;
type TableBodyProps = ComponentProps<typeof TableBody>;
type TableCaptionProps = ComponentProps<typeof TableCaption>;
type TableCellProps = ComponentProps<typeof TableCell>;
type TableFooterProps = ComponentProps<typeof TableFooter>;
type TableHeadProps = ComponentProps<typeof TableHead>;
type TableHeaderProps = ComponentProps<typeof TableHeader>;
type TableRowProps = ComponentProps<typeof TableRow>;
type TabsProps = ComponentProps<typeof Tabs>;
type TabsContentProps = ComponentProps<typeof TabsContent>;
type TabsListProps = ComponentProps<typeof TabsList>;
type TabsTriggerProps = ComponentProps<typeof TabsTrigger>;
type TextareaProps = ComponentProps<typeof Textarea>;
type ToastProps = ComponentProps<typeof Toast>;
type ToastActionProps = ComponentProps<typeof ToastAction>;
type ToastCloseProps = ComponentProps<typeof ToastClose>;
type ToastContentProps = ComponentProps<typeof ToastContent>;
type ToastDescriptionProps = ComponentProps<typeof ToastDescription>;
type ToasterProps = ComponentProps<typeof Toaster>;
type ToastPortalProps = ComponentProps<typeof ToastPortal>;
type ToastProviderProps = ComponentProps<typeof ToastProvider>;
type ToastTitleProps = ComponentProps<typeof ToastTitle>;
type ToastViewportProps = ComponentProps<typeof ToastViewport>;
type ToggleProps = ComponentProps<typeof Toggle>;
type ToggleGroupProps = ComponentProps<typeof ToggleGroup>;
type ToggleGroupItemProps = ComponentProps<typeof ToggleGroupItem>;
type ToolbarProps = ComponentProps<typeof Toolbar>;
type ToolbarButtonProps = ComponentProps<typeof ToolbarButton>;
type ToolbarGroupProps = ComponentProps<typeof ToolbarGroup>;
type ToolbarSeparatorProps = ComponentProps<typeof ToolbarSeparator>;
type TooltipProps = ComponentProps<typeof Tooltip>;
type TooltipContentProps = ComponentProps<typeof TooltipContent>;
type TooltipProviderProps = ComponentProps<typeof TooltipProvider>;
type TooltipTriggerProps = ComponentProps<typeof TooltipTrigger>;
type TypographyH1Props = ComponentProps<typeof TypographyH1>;
type TypographyH2Props = ComponentProps<typeof TypographyH2>;
type TypographyH3Props = ComponentProps<typeof TypographyH3>;
type TypographyH4Props = ComponentProps<typeof TypographyH4>;
type TypographyInlineCodeProps = ComponentProps<typeof TypographyInlineCode>;
type TypographyLeadProps = ComponentProps<typeof TypographyLead>;
type TypographyListProps = ComponentProps<typeof TypographyList>;
type TypographyMutedProps = ComponentProps<typeof TypographyMuted>;
type TypographyPProps = ComponentProps<typeof TypographyP>;
type UserMenuProps = ComponentProps<typeof UserMenu>;

export type {
  SpinnerProps,
  SwitchProps,
  TableProps,
  TableBodyProps,
  TableCaptionProps,
  TableCellProps,
  TableFooterProps,
  TableHeadProps,
  TableHeaderProps,
  TableRowProps,
  TabsProps,
  TabsContentProps,
  TabsListProps,
  TabsTriggerProps,
  TextareaProps,
  ToastProps,
  ToastActionProps,
  ToastCloseProps,
  ToastContentProps,
  ToastDescriptionProps,
  ToasterProps,
  ToastPortalProps,
  ToastProviderProps,
  ToastTitleProps,
  ToastViewportProps,
  ToggleProps,
  ToggleGroupProps,
  ToggleGroupItemProps,
  ToolbarProps,
  ToolbarButtonProps,
  ToolbarGroupProps,
  ToolbarSeparatorProps,
  TooltipProps,
  TooltipContentProps,
  TooltipProviderProps,
  TooltipTriggerProps,
  TypographyH1Props,
  TypographyH2Props,
  TypographyH3Props,
  TypographyH4Props,
  TypographyInlineCodeProps,
  TypographyLeadProps,
  TypographyListProps,
  TypographyMutedProps,
  TypographyPProps,
  UserMenuProps,
};
