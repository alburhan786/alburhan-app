import { useEffect, useRef, useState, useCallback } from "react";
import { renderPage } from "@/lib/pdfjs";
import type { PdfDocument } from "@/lib/pdfjs";
import { drawAnnotation, hitTest, type Annotation } from "./drawAnnotation";
import { v4 as uuid } from "uuid";

interface PageViewProps {
  pageNum: number;
  pdfDoc: PdfDocument;
  zoom: number;
  annotations: Annotation[];
  selectedId: string | null;
  activeTool: string;
  activeColor: string;
  activeOpacity: number;
  activeLineWidth: number;
  activeFontSize: number;
  activeStamp: string;
  nightMode: boolean;
  searchHighlights: Array<{ page: number; x: number; y: number; w: number; h: number }>;
  onAnnotationAdd: (ann: Annotation) => void;
  onAnnotationSelect: (id: string | null) => void;
  onAnnotationMove: (id: string, dx: number, dy: number) => void;
  onAnnotationDelete: (id: string) => void;
  onPageVisible: (p: number) => void;
  onTextInput: (opts: { x: number; y: number; page: number; onDone: (text: string) => void }) => void;
}

function getCursor(tool: string, overAnn: boolean): string {
  if (tool === "select" && overAnn) return "move";
  if (tool === "select") return "default";
  if (tool === "pan") return "grab";
  if (tool === "text" || tool === "typewriter") return "text";
  if (tool === "freehand") return "crosshair";
  if (tool === "eraser") return "cell";
  return "crosshair";
}

export default function PageView({
  pageNum, pdfDoc, zoom, annotations, selectedId,
  activeTool, activeColor, activeOpacity, activeLineWidth, activeFontSize, activeStamp,
  nightMode, searchHighlights,
  onAnnotationAdd, onAnnotationSelect, onAnnotationMove, onAnnotationDelete,
  onPageVisible, onTextInput,
}: PageViewProps) {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const annCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef   = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const drawRef = useRef<{
    drawing: boolean; x0: number; y0: number;
    pts: number[]; previewId: string | null;
    dragging: string | null; dragX0: number; dragY0: number;
    annX0: number; annY0: number;
  }>({ drawing: false, x0: 0, y0: 0, pts: [], previewId: null, dragging: null, dragX0: 0, dragY0: 0, annX0: 0, annY0: 0 });

  // Intersection observer to notify parent about visibility
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) onPageVisible(pageNum); },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [pageNum, onPageVisible]);

  // Render PDF page
  useEffect(() => {
    let cancelled = false;
    async function go() {
      if (!pdfDoc || !pdfCanvasRef.current) return;
      const d = await renderPage(pdfDoc, pageNum, pdfCanvasRef.current, zoom);
      if (!cancelled) setDims({ w: d.width, h: d.height });
    }
    go();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum, zoom]);

  // Redraw annotation canvas whenever annotations/dims/searchHighlights change
  const redraw = useCallback(() => {
    const canvas = annCanvasRef.current;
    if (!canvas || !dims.w) return;
    canvas.width  = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, dims.w, dims.h);

    // Search highlights (cyan)
    for (const sh of searchHighlights.filter(s => s.page === pageNum)) {
      ctx.save();
      ctx.fillStyle = "rgba(0,200,255,0.35)";
      ctx.fillRect(sh.x * dims.w, sh.y * dims.h, sh.w * dims.w, sh.h * dims.h);
      ctx.restore();
    }

    for (const ann of annotations.filter(a => a.page === pageNum)) {
      drawAnnotation(ctx, ann, dims.w, dims.h, selectedId === ann.id);
    }
  }, [annotations, dims, selectedId, pageNum, searchHighlights]);

  useEffect(() => { redraw(); }, [redraw]);

  // Night mode overlay
  useEffect(() => {
    const canvas = pdfCanvasRef.current;
    if (!canvas || !dims.w) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (nightMode) {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = "#1a1a2e";
      ctx.globalAlpha = 0.55;
      ctx.fillRect(0, 0, dims.w, dims.h);
      ctx.restore();
    }
  }, [nightMode, dims]);

  function toNorm(canvas: HTMLCanvasElement, e: React.MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    return {
      nx: (e.clientX - rect.left) / rect.width,
      ny: (e.clientY - rect.top)  / rect.height,
    };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = annCanvasRef.current!;
    const { nx, ny } = toNorm(canvas, e);
    const d = drawRef.current;

    if (activeTool === "select") {
      const hit = [...annotations].reverse().find(a => a.page === pageNum && hitTest(a, nx, ny));
      if (hit) {
        onAnnotationSelect(hit.id);
        d.dragging = hit.id;
        d.dragX0   = nx; d.dragY0 = ny;
        d.annX0    = hit.x; d.annY0 = hit.y;
      } else {
        onAnnotationSelect(null);
      }
      return;
    }
    if (activeTool === "eraser") {
      const hit = [...annotations].reverse().find(a => a.page === pageNum && hitTest(a, nx, ny));
      if (hit) onAnnotationDelete(hit.id);
      return;
    }
    if (activeTool === "text" || activeTool === "typewriter") {
      onTextInput({
        x: nx, y: ny, page: pageNum,
        onDone: (text: string) => {
          if (!text.trim()) return;
          onAnnotationAdd({
            id: uuid(), type: "text", page: pageNum,
            x: nx, y: ny, w: 0.25, h: 0.06,
            color: activeColor, opacity: activeOpacity,
            fontSize: activeFontSize, content: text,
            createdAt: new Date().toISOString(),
          });
        },
      });
      return;
    }
    if (activeTool === "sticky") {
      onTextInput({
        x: nx, y: ny, page: pageNum,
        onDone: (text: string) => {
          onAnnotationAdd({
            id: uuid(), type: "sticky", page: pageNum,
            x: nx, y: ny, w: 0.18, h: 0.12,
            color: activeColor, opacity: activeOpacity,
            content: text || " ", createdAt: new Date().toISOString(),
          });
        },
      });
      return;
    }
    if (activeTool === "stamp") {
      onAnnotationAdd({
        id: uuid(), type: "stamp", page: pageNum,
        x: nx - 0.1, y: ny - 0.04, w: 0.2, h: 0.08,
        color: activeColor, opacity: 0.75,
        content: activeStamp, createdAt: new Date().toISOString(),
      });
      return;
    }

    d.drawing = true;
    d.x0 = nx; d.y0 = ny;
    d.pts = [nx, ny];
    d.previewId = null;
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = annCanvasRef.current!;
    const { nx, ny } = toNorm(canvas, e);
    const d = drawRef.current;

    // Detect hover for cursor
    if (!d.drawing && !d.dragging && activeTool === "select") {
      const over = annotations.some(a => a.page === pageNum && hitTest(a, nx, ny));
      canvas.style.cursor = over ? "move" : "default";
    }

    // Drag selected annotation
    if (d.dragging) {
      const ddx = nx - d.dragX0, ddy = ny - d.dragY0;
      onAnnotationMove(d.dragging, ddx, ddy);
      d.dragX0 = nx; d.dragY0 = ny;
      return;
    }

    if (!d.drawing) return;

    const ctx = canvas.getContext("2d")!;
    // Re-render base annotations + preview
    redraw();

    const x = Math.min(d.x0, nx), y = Math.min(d.y0, ny);
    const w = Math.abs(nx - d.x0), h = Math.abs(ny - d.y0);

    ctx.save();
    ctx.globalAlpha = activeOpacity;
    ctx.strokeStyle = activeColor;
    ctx.fillStyle   = activeColor;
    ctx.lineWidth   = activeLineWidth;
    ctx.lineCap = "round"; ctx.lineJoin = "round";

    switch (activeTool) {
      case "highlight":
        ctx.globalAlpha = activeOpacity * 0.35;
        ctx.fillRect(x * dims.w, y * dims.h, w * dims.w, h * dims.h);
        break;
      case "underline":
        ctx.beginPath();
        ctx.moveTo(d.x0 * dims.w, ny * dims.h);
        ctx.lineTo(nx * dims.w, ny * dims.h);
        ctx.stroke();
        break;
      case "strikeout":
        ctx.beginPath();
        ctx.moveTo(d.x0 * dims.w, (d.y0 + ny) / 2 * dims.h);
        ctx.lineTo(nx * dims.w, (d.y0 + ny) / 2 * dims.h);
        ctx.stroke();
        break;
      case "rectangle":
        ctx.strokeRect(x * dims.w, y * dims.h, w * dims.w, h * dims.h);
        break;
      case "circle":
        ctx.beginPath();
        ctx.ellipse((x + w / 2) * dims.w, (y + h / 2) * dims.h, (w / 2) * dims.w, (h / 2) * dims.h, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "arrow":
      case "line": {
        const x1 = d.x0 * dims.w, y1 = d.y0 * dims.h;
        const x2 = nx * dims.w,   y2 = ny * dims.h;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        if (activeTool === "arrow") {
          const ddx = x2-x1, ddy = y2-y1, l = Math.sqrt(ddx*ddx+ddy*ddy);
          if (l>1) {
            const ux=ddx/l, uy=ddy/l, al=14, aw=7;
            ctx.beginPath(); ctx.moveTo(x2,y2);
            ctx.lineTo(x2-al*ux+aw*uy, y2-al*uy-aw*ux);
            ctx.lineTo(x2-al*ux-aw*uy, y2-al*uy+aw*ux);
            ctx.closePath(); ctx.fill();
          }
        }
        break;
      }
      case "freehand":
        d.pts.push(nx, ny);
        ctx.beginPath(); ctx.moveTo(d.pts[0]*dims.w, d.pts[1]*dims.h);
        for (let i=2;i<d.pts.length;i+=2) ctx.lineTo(d.pts[i]*dims.w, d.pts[i+1]*dims.h);
        ctx.stroke();
        break;
      case "measure": {
        const x1=d.x0*dims.w, y1=d.y0*dims.h, x2=nx*dims.w, y2=ny*dims.h;
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
        const dist = Math.sqrt((x2-x1)**2+(y2-y1)**2).toFixed(0);
        ctx.font="11px Arial"; ctx.fillText(`${dist}px`, (x1+x2)/2+4, (y1+y2)/2-4);
        break;
      }
    }
    ctx.restore();
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = annCanvasRef.current!;
    const { nx, ny } = toNorm(canvas, e);
    const d = drawRef.current;

    if (d.dragging) { d.dragging = null; return; }
    if (!d.drawing) return;
    d.drawing = false;

    const x = Math.min(d.x0, nx), y = Math.min(d.y0, ny);
    const w = Math.abs(nx - d.x0) || 0.001;
    const h = Math.abs(ny - d.y0) || 0.001;

    const base: Omit<Annotation, "type" | "x" | "y" | "w" | "h"> = {
      id: uuid(), page: pageNum,
      color: activeColor, opacity: activeOpacity,
      lineWidth: activeLineWidth, fontSize: activeFontSize,
      createdAt: new Date().toISOString(),
    };

    switch (activeTool) {
      case "highlight": case "underline": case "strikeout":
      case "rectangle": case "circle":
        onAnnotationAdd({ ...base, type: activeTool, x, y, w, h });
        break;
      case "arrow": case "line": case "measure":
        onAnnotationAdd({ ...base, type: activeTool, x, y, w, h, points: [d.x0, d.y0, nx, ny] });
        break;
      case "freehand":
        if (d.pts.length >= 4)
          onAnnotationAdd({ ...base, type: "freehand", x, y, w, h, points: [...d.pts] });
        break;
    }
    d.pts = [];
  }

  const pageAnns = annotations.filter(a => a.page === pageNum);
  const hasSelected = pageAnns.some(a => a.id === selectedId);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative", display: "inline-block",
        boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
        border: "1px solid #333",
        marginBottom: 24, background: "#fff",
      }}
    >
      <canvas ref={pdfCanvasRef} style={{ display: "block" }} />
      <canvas
        ref={annCanvasRef}
        style={{
          position: "absolute", top: 0, left: 0,
          width: "100%", height: "100%",
          cursor: getCursor(activeTool, hasSelected),
          touchAction: "none",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { drawRef.current.drawing = false; drawRef.current.dragging = null; }}
        onContextMenu={e => {
          e.preventDefault();
          const canvas = annCanvasRef.current!;
          const { nx, ny } = { nx: (e.clientX - canvas.getBoundingClientRect().left) / canvas.getBoundingClientRect().width,
                                ny: (e.clientY - canvas.getBoundingClientRect().top)  / canvas.getBoundingClientRect().height };
          const hit = [...annotations].reverse().find(a => a.page === pageNum && hitTest(a, nx, ny));
          if (hit) onAnnotationDelete(hit.id);
        }}
      />
      {/* Page number badge */}
      <div style={{
        position: "absolute", bottom: 6, right: 8,
        background: "rgba(0,0,0,0.5)", color: "#fff",
        fontSize: 10, borderRadius: 3, padding: "1px 5px",
        pointerEvents: "none",
      }}>
        {pageNum}
      </div>
    </div>
  );
}
