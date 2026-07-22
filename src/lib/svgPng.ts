// Client-side PNG export of an inline SVG chart. The chart strokes/fills through theme CSS
// variables (rgb(var(--c-*)) and var(--thick-line|--canvas)); those DON'T survive serialization
// into a detached <img>, so we resolve them from the live :root computed style first, paint a
// panel-coloured background, and rasterize at `scale`× for a crisp share image. The SVG has no
// external refs, so the canvas never taints. Event-handler-only (creates object URLs + a download).

const RGB_VARS = ["--c-edge", "--c-muted", "--c-ink"] as const; // used as rgb(var(--x)) in the markup
const RAW_VARS = ["--thick-line", "--canvas"] as const; // used bare as var(--x)

export function downloadSvgAsPng(svg: SVGSVGElement, filename: string, scale = 2): void {
  const cs = getComputedStyle(document.documentElement);
  const vb = svg.viewBox?.baseVal;
  const w = vb && vb.width ? vb.width : svg.clientWidth || 640;
  const h = vb && vb.height ? vb.height : svg.clientHeight || 300;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  let markup = new XMLSerializer().serializeToString(clone);
  for (const v of RGB_VARS) {
    const val = cs.getPropertyValue(v).trim();
    if (val) markup = markup.split(`rgb(var(${v}))`).join(`rgb(${val})`);
  }
  for (const v of RAW_VARS) {
    const val = cs.getPropertyValue(v).trim();
    if (val) markup = markup.split(`var(${v})`).join(val);
  }
  const panel = cs.getPropertyValue("--c-panel").trim();
  const bg = panel ? `rgb(${panel})` : "#0b0e14";

  const svgUrl = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(svgUrl);
      return;
    }
    ctx.scale(scale, scale);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    canvas.toBlob((png) => {
      if (png) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(png);
        a.download = filename;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
      URL.revokeObjectURL(svgUrl);
    }, "image/png");
  };
  img.onerror = () => URL.revokeObjectURL(svgUrl);
  img.src = svgUrl;
}
