/** Fitting text to room: wrapping it into lines, and cutting it short. */

/** Words in lines no wider than `width`, as `measure` measures them; a word wider than that has a line of its own. */
export function wrapText(text: string, width: number, measure: (text: string) => number): readonly string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const longer = line === "" ? word : `${line} ${word}`;
    if (line !== "" && measure(longer) > width) {
      lines.push(line);
      line = word;
    } else {
      line = longer;
    }
  }
  return line === "" ? lines : [...lines, line];
}

/** `text` cut to fit `width`, ending in an ellipsis where it was cut. */
export function fitText(text: string, width: number, measure: (text: string) => number): string {
  if (measure(text) <= width) {
    return text;
  }
  let cut = text.length;
  while (cut > 0 && measure(`${text.slice(0, cut)}…`) > width) {
    cut -= 1;
  }
  return cut === 0 ? "" : `${text.slice(0, cut).trimEnd()}…`;
}
