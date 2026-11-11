/* What the theme being made looks like: a few of @basis/ui's components under `data-theme="studio"`, whose rules the
 * page writes from the inputs as they change, into a stylesheet it adopts, over the shipped stylesheet's utilities, which read the variables. It
 * follows the page's mode, which the gallery's Mode links switch. */

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@basis/ui";
import { scopedThemeCss } from "@basis/ui/theming";
import type { ThemeInputs } from "@basis/ui/theming";
import { useLayoutEffect } from "react";
import type { ReactElement } from "react";

/** The name the preview's rules sit under, apart from every shipped theme's. */
const previewName = "studio";

const rows = [
  { book: "Rates", change: "+0.13", par: "25,000,000" },
  { book: "Agency", change: "-0.06", par: "10,000,000" },
  { book: "Credit", change: "+0.03", par: "5,000,000" },
] as const;

/** A small table of numbers, with a total. */
function Positions(): ReactElement {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Book</TableHead>
          <TableHead variant="numeric">Par</TableHead>
          <TableHead variant="numeric">Change</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.book}>
            <TableCell>{row.book}</TableCell>
            <TableCell variant="numeric">{row.par}</TableCell>
            <TableCell variant="numeric">
              <span className={row.change.startsWith("-") ? "text-loss" : "text-gain"}>
                {row.change}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell variant="numeric">40,000,000</TableCell>
          <TableCell variant="numeric" />
        </TableRow>
      </TableFooter>
    </Table>
  );
}

/** Buttons, badges and a field. */
function Controls(): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button>Book trade</Button>
        <Button variant="secondary">Save view</Button>
        <Button variant="outline">Export</Button>
        <Button variant="destructive">Cancel order</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="success">Settled</Badge>
        <Badge variant="warning">Pending</Badge>
        <Badge variant="info">Indicative</Badge>
        <Badge variant="destructive">Failed</Badge>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="studio-preview-amount">Amount</Label>
          <Input id="studio-preview-amount" defaultValue="5,000,000" />
        </div>
        <div className="flex items-center gap-2 pb-1">
          <Switch id="studio-preview-switch" defaultChecked />
          <Label htmlFor="studio-preview-switch">Live prices</Label>
        </div>
      </div>
    </div>
  );
}

/** Puts the rules of `inputs`, under the preview's name, on the page before it paints, in a stylesheet of their own
 * that the next change replaces. */
function useThemeRules(inputs: ThemeInputs): void {
  useLayoutEffect(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(scopedThemeCss({ ...inputs, name: previewName }));
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    return (): void => {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (adopted) => adopted !== sheet,
      );
    };
  }, [inputs]);
}

/** The preview, under the theme being made. */
function Preview({ inputs }: { readonly inputs: ThemeInputs }): ReactElement {
  useThemeRules(inputs);
  return (
    <div
      data-theme={previewName}
      className="flex flex-col gap-4 rounded-lg bg-background p-4 text-foreground"
    >
      <Controls />
      <Alert variant="warning">
        <AlertTitle>Approaching the DV01 limit</AlertTitle>
        <AlertDescription>The desk is at 92% of its limit.</AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>Positions</CardTitle>
          <CardDescription>Par by book, with the day&apos;s change.</CardDescription>
        </CardHeader>
        <CardContent>
          <Positions />
        </CardContent>
      </Card>
    </div>
  );
}

export { Preview };
