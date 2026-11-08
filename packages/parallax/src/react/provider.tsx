/* `<ParallaxProvider>`: the page's engine and the theme parallax draws in, for the React tree inside it. */

import { useEffect, useInsertionEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { ParallaxClient } from "#engine/client.ts";
import { packagedWorker } from "#engine/packaged-worker.ts";
import type { WorkerSource } from "#engine/client.ts";
import { basisTheme } from "#theme/basis.ts";
import type { ParallaxTheme } from "#theme/define.ts";
import type { ResolvedScheme, Scheme } from "#theme/kinds.ts";
import { pageWatcher } from "#theme/page.ts";
import type { PageState } from "#theme/page.ts";
import { installTheme, installTokenStyles } from "#theme/styles.ts";

import { ParallaxClientContext, ParallaxThemeContext } from "./context.ts";

interface ParallaxProviderProps {
  /**
   * Where the engine's worker comes from. Leave it out: the package starts its own worker, which an app's bundler finds
   * beside the package's code. A test or a page that serves the worker itself passes a function that starts one, or
   * the URL that serves `@basis/parallax/worker`. Define it outside the component, or let the React Compiler keep it: a
   * different worker starts a new engine, without the data.
   */
  readonly worker?: WorkerSource;
  /**
   * Starts the worker when the provider mounts, rather than when the first data loads, so that the first rows show
   * sooner. Every page under the provider then downloads the engine, about 1 MB compressed, whether or not it shows
   * parallax. Off by default.
   */
  readonly prewarm?: boolean;
  /** The theme parallax draws in: `basisTheme`, `@basis/ui`'s own, by default. */
  readonly theme?: ParallaxTheme;
  /** The scheme it draws in: by default the page's mode, as `@basis/ui`'s preferences set it; `auto` follows the
   * system's. */
  readonly scheme?: Scheme;
  readonly children?: ReactNode;
}

function resolveScheme(scheme: Scheme | undefined, page: PageState): ResolvedScheme {
  if (scheme === undefined) {
    return page.mode;
  }
  if (scheme === "auto") {
    return page.systemDark ? "dark" : "light";
  }
  return scheme;
}

/**
 * Starts parallax's engine for the tree inside it, in a Web Worker, and ends it, freeing its memory, when it unmounts.
 * It installs the theme's stylesheets, and follows the page's mode and density, so that every grid, pivot and chart
 * inside repaints when they change.
 */
function ParallaxProvider({
  worker = packagedWorker,
  prewarm = false,
  theme = basisTheme,
  scheme,
  children,
}: ParallaxProviderProps): ReactNode {
  // A new worker source starts a new engine; the old one ends below, freeing its memory.
  const client = useMemo(() => new ParallaxClient(worker), [worker]);
  const watcher = pageWatcher(document);
  const page = useSyncExternalStore(watcher.subscribe, watcher.getSnapshot);
  useEffect(
    () => (): void => {
      client.close();
    },
    [client],
  );
  useEffect(() => {
    if (prewarm) {
      client.prewarm();
    }
  }, [client, prewarm]);
  // Before any layout effect, so a canvas that reads its tokens on mount finds them declared.
  useInsertionEffect(() => {
    installTokenStyles(document);
    installTheme(document, theme);
  }, [theme]);
  const themed = {
    changes: page.changes,
    density: page.density,
    scheme: resolveScheme(scheme, page),
    theme,
  };
  return (
    <ParallaxClientContext value={client}>
      <ParallaxThemeContext value={themed}>{children}</ParallaxThemeContext>
    </ParallaxClientContext>
  );
}

export { ParallaxProvider };
export type { ParallaxProviderProps };
