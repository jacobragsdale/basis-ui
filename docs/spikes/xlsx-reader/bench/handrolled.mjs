// Spike only: a zero-dependency xlsx reader — zip via DecompressionStream, XML by string scanning.
const dec = new TextDecoder();
function entries(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = buf.length - 22;
  while (eocd >= 0 && v.getUint32(eocd, true) !== 0x06054b50) eocd--;
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const map = new Map();
  for (let i = 0; i < count; i++) {
    const method = v.getUint16(p + 10, true),
      csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true),
      elen = v.getUint16(p + 30, true),
      clen = v.getUint16(p + 32, true);
    const off = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    map.set(name, { method, csize, off });
    p += 46 + nlen + elen + clen;
  }
  return { map, v };
}
async function text(buf, z, name) {
  const e = z.map.get(name);
  if (!e) return undefined;
  const start = e.off + 30 + z.v.getUint16(e.off + 26, true) + z.v.getUint16(e.off + 28, true);
  const data = buf.subarray(start, start + e.csize);
  if (e.method === 0) return dec.decode(data);
  const s = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return dec.decode(await new Response(s).arrayBuffer());
}
const ent = /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g;
const unesc = (s) =>
  s.indexOf("&") < 0
    ? s
    : s.replace(ent, (m) =>
        m === "&amp;"
          ? "&"
          : m === "&lt;"
            ? "<"
            : m === "&gt;"
              ? ">"
              : m === "&quot;"
                ? '"'
                : m === "&apos;"
                  ? "'"
                  : String.fromCodePoint(
                      m[2] === "x" ? parseInt(m.slice(3, -1), 16) : parseInt(m.slice(2, -1), 10),
                    ),
      );
function strings(xml) {
  const out = [];
  let i = 0;
  for (;;) {
    const a = xml.indexOf("<si>", i);
    if (a < 0) break;
    const b = xml.indexOf("</si>", a);
    const si = xml.slice(a + 4, b);
    let s = "",
      j = 0;
    for (;;) {
      const t = si.indexOf("<t", j);
      if (t < 0) break;
      const gt = si.indexOf(">", t);
      if (si[gt - 1] === "/") {
        j = gt + 1;
        continue;
      }
      const e = si.indexOf("</t>", gt);
      s += si.slice(gt + 1, e);
      j = e + 4;
    }
    out.push(unesc(s));
    i = b + 5;
  }
  return out;
}
const col = (ref) => {
  let n = 0;
  for (let k = 0; k < ref.length; k++) {
    const c = ref.charCodeAt(k);
    if (c < 65) break;
    n = n * 26 + c - 64;
  }
  return n - 1;
};
function attr(tag, name) {
  const k = tag.indexOf(` ${name}="`);
  if (k < 0) return undefined;
  const e = tag.indexOf('"', k + name.length + 3);
  return tag.slice(k + name.length + 3, e);
}
function sheet(xml, sst) {
  const rows = [];
  let i = xml.indexOf("<sheetData");
  for (;;) {
    const r = xml.indexOf("<row", i);
    if (r < 0) break;
    const re = xml.indexOf("</row>", r);
    const row = [];
    let j = r;
    for (;;) {
      const c = xml.indexOf("<c ", j);
      if (c < 0 || c > re) break;
      const gt = xml.indexOf(">", c);
      const tag = xml.slice(c, gt);
      const idx = col(attr(tag, "r") ?? "");
      if (xml[gt - 1] === "/") {
        j = gt + 1;
        continue;
      }
      const ce = xml.indexOf("</c>", gt);
      const t = attr(tag, "t");
      let val;
      if (t === "inlineStr") {
        const a = xml.indexOf("<t", gt);
        val = unesc(xml.slice(xml.indexOf(">", a) + 1, xml.indexOf("</t>", a)));
      } else {
        const a = xml.indexOf("<v>", gt);
        val = a < 0 || a > ce ? "" : xml.slice(a + 3, xml.indexOf("</v>", a));
        if (t === "s") val = sst[+val];
        else if (t === "b") val = val === "1" ? "TRUE" : "FALSE";
        else if (t === "str" || t === "e") val = unesc(val);
      }
      row[idx] = val;
      j = ce + 4;
    }
    rows.push(row);
    i = re + 6;
  }
  return rows;
}
export async function readHandrolled(bytes) {
  const buf = new Uint8Array(bytes);
  const z = entries(buf);
  const [sst, ws] = await Promise.all([
    text(buf, z, "xl/sharedStrings.xml"),
    text(buf, z, "xl/worksheets/sheet1.xml"),
  ]);
  return sheet(ws, sst ? strings(sst) : []);
}
