import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeProps {
  value: string;
  width?: number;
  height?: number;
  fontSize?: number;
  displayValue?: boolean;
  format?: string;
}

export function Barcode({ value, width = 1, height = 25, fontSize = 8, displayValue = false, format = "CODE39" }: BarcodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && value) {
      try {
        const safeValue = format === "CODE128"
          ? value.replace(/[^\x00-\x7F]/g, "")
          : value.toUpperCase().replace(/[^A-Z0-9\-.\s$/+%]/g, "");
        JsBarcode(canvasRef.current, safeValue, {
          format,
          width,
          height,
          fontSize,
          displayValue,
          margin: 10,        // quiet zone — required for scanners
          marginLeft: 12,
          marginRight: 12,
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch {}
    }
  }, [value, width, height, fontSize, displayValue, format]);

  if (!value) return null;
  return <canvas ref={canvasRef} style={{ display: "block" }} />;
}
