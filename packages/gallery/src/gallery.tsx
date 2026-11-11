/* The gallery's frame: links to each family's page and to each theme, mode and density, and the current page. Every link is
 * a plain query, so a screenshot can open any page in any combination directly. The links are ButtonLinks, links drawn
 * as buttons. A query that names a section, as `&section=button` does, shows that section alone, with no frame, as its
 * screenshot pictures it (pages/shot.ts). */

import { ButtonLink, themeNames } from "@basis/ui";
import type { Density, ResolvedMode, ThemeName } from "@basis/ui";
import type { ReactElement } from "react";

import { ShownSection } from "./pages/shot.ts";
import { pages } from "./pages.ts";
import type { GalleryPage } from "./pages.ts";

interface GalleryProps {
  readonly page: GalleryPage;
  /** The page's query, which every link keeps but for the parameter it changes. */
  readonly search: string;
  readonly mode: ResolvedMode;
  readonly density: Density;
  readonly theme: ThemeName;
  /** The section shown alone, or `null` for the whole page. */
  readonly section?: string | null;
}

/** The query `search` with one parameter set. */
function withParameter(search: string, name: string, value: string): string {
  const query = new URLSearchParams(search);
  query.set(name, value);
  return `?${query.toString()}`;
}

interface ChoiceProps {
  readonly label: string;
  readonly parameter: string;
  readonly options: readonly string[];
  readonly current: string;
  readonly search: string;
}

/** Links that set one query parameter, the current one marked. */
function Choice({ label, parameter, options, current, search }: ChoiceProps): ReactElement {
  return (
    <nav aria-label={label} className="flex items-center gap-1">
      <span className="pr-1 text-sm text-muted-foreground">{label}</span>
      {options.map((option) => (
        <ButtonLink
          key={option}
          href={withParameter(search, parameter, option)}
          aria-current={option === current ? "true" : undefined}
          size="sm"
          variant={option === current ? "secondary" : "ghost"}
        >
          {option}
        </ButtonLink>
      ))}
    </nav>
  );
}

/** The links to each theme, mode and density. */
function Choices({
  search,
  theme,
  mode,
  density,
}: Pick<GalleryProps, "search" | "theme" | "mode" | "density">): ReactElement {
  return (
    <div className="flex flex-wrap gap-6">
      <Choice
        label="Theme"
        parameter="theme"
        options={themeNames}
        current={theme}
        search={search}
      />
      <Choice
        label="Mode"
        parameter="mode"
        options={["light", "dark"]}
        current={mode}
        search={search}
      />
      <Choice
        label="Density"
        parameter="density"
        options={["comfortable", "compact"]}
        current={density}
        search={search}
      />
    </div>
  );
}

/** One section of `page` alone, with no frame, as its screenshot shows it. */
function SectionAlone({
  page,
  section,
}: {
  readonly page: GalleryPage;
  readonly section: string;
}): ReactElement {
  const { Content } = page;
  return (
    <ShownSection value={section}>
      <main className="mx-auto flex max-w-6xl flex-col gap-8 p-6">
        <h1 className="text-2xl font-semibold">{page.title}</h1>
        <Content />
      </main>
    </ShownSection>
  );
}

function Gallery({
  page,
  search,
  mode,
  density,
  theme,
  section = null,
}: GalleryProps): ReactElement {
  const { Content } = page;
  if (section !== null) {
    return <SectionAlone page={page} section={section} />;
  }
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-4 border-b pb-4">
        <p className="text-sm font-semibold">@basis/ui gallery</p>
        <nav aria-label="Component families" className="flex flex-wrap gap-1">
          {pages.map((entry) => (
            <ButtonLink
              key={entry.id}
              href={withParameter(search, "page", entry.id)}
              aria-current={entry.id === page.id ? "page" : undefined}
              size="sm"
              variant={entry.id === page.id ? "secondary" : "ghost"}
            >
              {entry.title}
            </ButtonLink>
          ))}
        </nav>
        <Choices search={search} theme={theme} mode={mode} density={density} />
      </header>
      <main className="flex flex-col gap-8">
        <h1 className="text-2xl font-semibold">{page.title}</h1>
        <Content />
      </main>
    </div>
  );
}

export { Gallery };
