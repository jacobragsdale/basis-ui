/* The theme studio, a tool for whoever ports a brand onto the theme's inputs: it edits a `ThemeInputs`, runs the
 * generator in the page over a preview of the components, shows `checkTheme`'s result as it goes, and exports the
 * inputs file, which goes into `packages/ui/src/theme/themes/` beside the shipped themes. It lives in the gallery and
 * ships in no app. */

import { Alert, AlertDescription, AlertTitle, Button } from "@basis/ui";
import { checkTheme, defaultTheme, themeFile } from "@basis/ui/theming";
import type { ThemeInputs, ThemeProblem } from "@basis/ui/theming";
import { useMemo, useState } from "react";
import type { ReactElement } from "react";

import { Section } from "./section.tsx";
import { Controls } from "./theme-studio/controls.tsx";
import { Preview } from "./theme-studio/preview.tsx";
import { themeName } from "./theme-studio/state.ts";

/** `checkTheme`'s result: that the theme passes, or each failure's line with its nearest passing value. */
function Verdict({ problems }: { readonly problems: readonly ThemeProblem[] }): ReactElement {
  if (problems.length === 0) {
    return (
      <Alert variant="success" aria-live="polite">
        <AlertTitle>Passes checkTheme</AlertTitle>
        <AlertDescription>
          Every contrast, fill and chart series holds, in both modes.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive" aria-live="polite">
      <AlertTitle>
        {problems.length === 1 ? "One failure" : `${String(problems.length)} failures`} of
        checkTheme
      </AlertTitle>
      <AlertDescription>
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {problems.map((problem) => (
            <li key={problem.message}>{problem.message}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/** Saves the inputs file, named after the theme, as a download. */
function download(file: string, name: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([file], { type: "text/typescript" }));
  link.download = `${name}.ts`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Copies the inputs file, saying how it went. */
async function copy(file: string, setNote: (note: string) => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(file);
    setNote("Copied");
  } catch {
    setNote("The clipboard refused it");
  }
}

/** The export's buttons and what the copy did. */
function Export({ inputs }: { readonly inputs: ThemeInputs }): ReactElement {
  const [note, setNote] = useState("");
  const file = themeFile(inputs);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={() => {
          download(file, inputs.name);
        }}
      >
        Download {inputs.name}.ts
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          copy(file, setNote).catch(reportError);
        }}
      >
        Copy the inputs file
      </Button>
      <output className="text-xs text-muted-foreground">{note}</output>
    </div>
  );
}

function ThemeStudio(): ReactElement {
  const [inputs, setInputs] = useState<ThemeInputs>(defaultTheme);
  const [name, setName] = useState("brand");
  const named = useMemo(() => ({ ...inputs, name: themeName(name) }), [inputs, name]);
  const problems = useMemo(() => checkTheme(named), [named]);
  return (
    <Section
      title="Theme studio"
      description="Edit a theme's inputs, see the components drawn with it, and export its inputs file. checkTheme runs on every change."
    >
      <div className="grid grid-cols-2 gap-8">
        <div className="flex flex-col gap-6">
          <Controls inputs={inputs} change={setInputs} name={name} rename={setName} />
          <Export inputs={named} />
        </div>
        <div className="flex flex-col gap-4">
          <Verdict problems={problems} />
          <Preview inputs={inputs} />
        </div>
      </div>
    </Section>
  );
}

export { ThemeStudio };
