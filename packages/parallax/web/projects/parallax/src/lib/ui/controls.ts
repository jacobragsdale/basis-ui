/**
 * Declarations the components' stylesheets share. A select loses the browser's own arrow, which ignores the theme,
 * for a chevron drawn in the text's colour.
 */
export const SELECT_ARROW = `
      appearance: none;
      padding-right: calc(var(--_px-spacing) * 6);
      background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
      background-position: calc(100% - 14px) 55%, calc(100% - 9px) 55%;
      background-size: 5px 5px;
      background-repeat: no-repeat;`;
