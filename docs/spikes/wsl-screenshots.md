# Spike 0.4: screenshots in WSL (work)

**Status: waiting for the maintainer's runs on two Citrix desktops.** The kit below is ready; this page records the
answers when the runs come back.

The question: do visual baselines made in WSL on one Citrix desktop hold on another? The design compares screenshots
only in WSL, with the Chromium build Playwright pins and the fonts `@basis/ui` bundles, because the desktops run no
Docker to pin a Linux image in. If two desktops render the same page to the same pixels, a baseline committed from one
desktop is checkable on every other.

## The kit

[`wsl-screenshots/`](wsl-screenshots) holds everything, and needs nothing from the rest of the repo:

- `page.html`: a page styled by `@basis/ui`'s theme, with Inter and JetBrains Mono embedded, so it loads from a file
  with no server and no network. `build-page.mjs` regenerates it from `body.html` and the theme.
- `shoot.mjs`: screenshots the page in light, dark and compact at 1100 × 600 pixels, scale 1, with no GPU and no font
  hinting, and prints the Chromium version, whether it ran in WSL, and each screenshot's SHA-256.
- `package.json` and `package-lock.json`: Playwright 1.65.0 exactly, which pins Chrome Headless Shell 158.0.8127.18.

## Steps, on each of two Citrix desktops

In a WSL terminal, with Node 22.18 or later (`node --version`):

```sh
# Copy the folder into WSL's own file system; /mnt/c is slow and its permissions differ.
cp -r /mnt/c/path/to/basis-ui/docs/spikes/wsl-screenshots ~/wsl-screenshots && cd ~/wsl-screenshots
npm ci                              # Playwright, from the internal feed if npm is set up for it
npx playwright install chromium     # Chrome Headless Shell into ~/.cache/ms-playwright, without admin rights
node shoot.mjs
```

If `npx playwright install chromium` cannot reach Microsoft's download host, set `PLAYWRIGHT_DOWNLOAD_HOST` to the
firm's mirror, if there is one. If `node shoot.mjs` fails because a shared library is missing, don't run
`npx playwright install-deps`: it needs `sudo`. Send back the library's name instead, because "WSL lacks it and nobody
can install it without admin rights" is itself an answer.

## What to send back

From each desktop: the lines `node shoot.mjs` printed. If the two desktops' hashes differ, also the three PNGs in
`out/` from both.

## The reference run

On the build host (Debian 13, kernel 6.12, not WSL, no GPU), two runs printed identical hashes, so the page and the
script are deterministic on one machine:

```text
chromium 158.0.8127.18
light a7a7d3d396fb47aff82041189168a4c897ebfa49c5417068ecda933740dd0fdd fonts=true
dark 56e02950db49f9377ed37bd62c969e4502bfbad83882a6c4911b6fcf6fa9e315 fonts=true
compact d1fb9a7b280b77e2903df3ae586f539cc3c58051ddabe791887b28dec62c1ae4 fonts=true
```

A desktop matching these hashes as well would mean baselines can be made here too, but the spike doesn't need it.

## Answers

| Question                                                                      | Answer  |
| ----------------------------------------------------------------------------- | ------- |
| Does Playwright's Chromium install and run in WSL without admin rights?       | Pending |
| Do the same page's screenshots match between two Citrix desktops' WSL setups? | Pending |
| Do they match the build host's?                                               | Pending |

## Fallbacks

- **The hashes differ, but only by anti-aliasing at glyph edges:** compare with a small per-pixel tolerance in
  `vp run check-full` and record the ratio that separates the two desktops from a real change.
- **They differ in layout or font:** a desktop setting is reaching into WSL's rendering. Find it from the PNGs before
  choosing a tolerance.
- **Chromium cannot run without admin rights:** baselines are made and compared on one designated desktop until CI
  exists, and in CI after.
