export interface Annotation {
  id: string;
  type: string;
  page: number;
  x: number; y: number; w: number; h: number; // normalized 0-1 (y from top)
  color: string;
  opacity: number;
  lineWidth?: number;
  fontSize?: number;
  fontName?: string;
  bold?: boolean;
  italic?: boolean;
  content?: string;
  points?: number[]; // freehand/arrow/line [nx1,ny1,nx2,ny2,...] normalized
  fillColor?: string;
  author?: string;
  createdAt?: string;
}

export function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  ann: Annotation,
  W: number,
  H: number,
  selected = false
) {
  const x = ann.x * W;
  const y = ann.y * H;
  const w = ann.w * W;
  const h = ann.h * H;
  const op = ann.opacity ?? 1;
  const lw = ann.lineWidth ?? 2;

  ctx.save();
  ctx.lineCap  = "round";
  ctx.lineJoin = "round";

  switch (ann.type) {
    case "highlight": {
      const colors: Record<string, string> = {
        "#ffff00": "rgba(255,255,0,0.38)",
        "#00ff00": "rgba(100,220,100,0.35)",
        "#ff69b4": "rgba(255,105,180,0.35)",
        "#00bfff": "rgba(0,191,255,0.35)",
        "#ffa500": "rgba(255,165,0,0.38)",
      };
      ctx.globalAlpha = op;
      ctx.fillStyle = colors[ann.color] || `${ann.color}60`;
      ctx.fillRect(x, y, w, h);
      break;
    }
    case "underline":
      ctx.globalAlpha = op; ctx.strokeStyle = ann.color; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke();
      break;
    case "strikeout":
      ctx.globalAlpha = op; ctx.strokeStyle = ann.color; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
      break;
    case "rectangle":
      ctx.globalAlpha = op; ctx.strokeStyle = ann.color; ctx.lineWidth = lw;
      ctx.strokeRect(x, y, w, h);
      if (ann.fillColor) {
        ctx.globalAlpha = op * 0.2;
        ctx.fillStyle = ann.fillColor;
        ctx.fillRect(x, y, w, h);
      }
      break;
    case "circle": {
      ctx.globalAlpha = op; ctx.strokeStyle = ann.color; ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (ann.fillColor) {
        ctx.globalAlpha = op * 0.2;
        ctx.fillStyle = ann.fillColor;
        ctx.fill();
      }
      break;
    }
    case "arrow":
    case "line": {
      const pts = ann.points?.length ? ann.points : [ann.x, ann.y, ann.x + ann.w, ann.y + ann.h];
      const [x1, y1, x2, y2] = [pts[0] * W, pts[1] * H, pts[2] * W, pts[3] * H];
      ctx.globalAlpha = op; ctx.strokeStyle = ann.color; ctx.fillStyle = ann.color; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (ann.type === "arrow") {
        const dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
        if (len > 1) {
          const ux = dx / len, uy = dy / len, al = 14, aw = 7;
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - al * ux + aw * uy, y2 - al * uy - aw * ux);
          ctx.lineTo(x2 - al * ux - aw * uy, y2 - al * uy + aw * ux);
          ctx.closePath(); ctx.fill();
        }
      }
      break;
    }
    case "freehand": {
      const pts = ann.points || [];
      if (pts.length < 4) break;
      ctx.globalAlpha = op; ctx.strokeStyle = ann.color; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(pts[0] * W, pts[1] * H);
      for (let i = 2; i < pts.length - 1; i += 2)
        ctx.lineTo(pts[i] * W, pts[i + 1] * H);
      ctx.stroke();
      break;
    }
    case "text":
    case "typewriter": {
      const fs = ann.fontSize ?? 14;
      ctx.globalAlpha = op;
      ctx.font = `${ann.bold ? "bold " : ""}${ann.italic ? "italic " : ""}${fs}px ${ann.fontName || "Arial"}`;
      ctx.fillStyle = ann.color;
      const lines = (ann.content || "").split("\n");
      lines.forEach((line, i) => ctx.fillText(line, x, y + fs + i * fs * 1.3, w || 999));
      break;
    }
    case "sticky": {
      ctx.globalAlpha = 0.93; ctx.fillStyle = "#fffde7"; ctx.fillRect(x, y, 130, 90);
      ctx.fillStyle = "#ffd600"; ctx.fillRect(x, y, 130, 16);
      ctx.globalAlpha = 0.5; ctx.strokeStyle = "#bbb"; ctx.lineWidth = 1; ctx.strokeRect(x, y, 130, 90);
      if (ann.content) {
        ctx.globalAlpha = 1; ctx.fillStyle = "#333"; ctx.font = "10px Arial";
        ann.content.split("\n").slice(0, 5).forEach((l, i) =>
          ctx.fillText(l.slice(0, 18), x + 5, y + 30 + i * 12));
      }
      break;
    }
    case "stamp": {
      const label = ann.content || "APPROVED";
      ctx.globalAlpha = op;
      ctx.strokeStyle = ann.color; ctx.lineWidth = 3;
      ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      const fs = Math.min(h * 0.55, 40);
      ctx.font = `bold ${fs}px Arial`;
      ctx.fillStyle = ann.color;
      ctx.textAlign = "center";
      ctx.fillText(label, x + w / 2, y + h / 2 + fs / 3, w - 12);
      ctx.textAlign = "left";
      break;
    }
    case "callout": {
      ctx.globalAlpha = op; ctx.strokeStyle = ann.color; ctx.lineWidth = lw;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 5);
      ctx.fill(); ctx.stroke();
      if (ann.content) {
        ctx.fillStyle = "#333"; ctx.font = `${ann.fontSize || 12}px Arial`;
        ctx.fillText(ann.content, x + 6, y + (ann.fontSize || 12) + 4, w - 12);
      }
      break;
    }
    case "measure": {
      const pts = ann.points?.length ? ann.points : [ann.x, ann.y, ann.x + ann.w, ann.y + ann.h];
      const [x1, y1, x2, y2] = [pts[0] * W, pts[1] * H, pts[2] * W, pts[3] * H];
      ctx.globalAlpha = op; ctx.strokeStyle = ann.color; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      const label = `${dist.toFixed(0)}px`;
      ctx.fillStyle = ann.color; ctx.font = "11px Arial";
      ctx.fillText(label, (x1 + x2) / 2 + 4, (y1 + y2) / 2 - 4);
      break;
    }
  }

  if (selected) {
    ctx.save();
    ctx.globalAlpha = 1; ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
    ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
    ctx.setLineDash([]);
    [[x - 4, y - 4], [x + w, y - 4], [x - 4, y + h], [x + w, y + h],
     [x + w / 2, y - 4], [x + w / 2, y + h], [x - 4, y + h / 2], [x + w, y + h / 2]]
      .forEach(([hx, hy]) => {
        ctx.fillStyle = "#fff"; ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 1;
        ctx.fillRect(hx - 4, hy - 4, 8, 8); ctx.strokeRect(hx - 4, hy - 4, 8, 8);
      });
    ctx.restore();
  }
  ctx.restore();
}

export function hitTest(ann: Annotation, nx: number, ny: number): boolean {
  const pad = 0.01;
  if (ann.type === "freehand" || ann.type === "line" || ann.type === "arrow" || ann.type === "measure") {
    const pts = ann.points || [ann.x, ann.y, ann.x + ann.w, ann.y + ann.h];
    for (let i = 0; i < pts.length - 3; i += 2) {
      const dx = pts[i + 2] - pts[i], dy = pts[i + 3] - pts[i + 1];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.001) continue;
      const t = ((nx - pts[i]) * dx + (ny - pts[i + 1]) * dy) / (len * len);
      const tc = Math.max(0, Math.min(1, t));
      const px = pts[i] + tc * dx - nx, py = pts[i + 1] + tc * dy - ny;
      if (Math.sqrt(px * px + py * py) < 0.02) return true;
    }
    return false;
  }
  return nx >= ann.x - pad && nx <= ann.x + ann.w + pad &&
         ny >= ann.y - pad && ny <= ann.y + ann.h + pad;
}
