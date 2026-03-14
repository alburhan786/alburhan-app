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
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value.toUpperCase().replace(/[^A-Z0-9\-.\s$/+%]/g, ""), {
          format,
          width,
          height,
          fontSize,
          displayValue,
          margin: 0,
          background: "transparent",
        });
      } catch {}
    }
  }, [value, width, height, fontSize, displayValue, format]);

  if (!value) return null;
  return <svg ref={svgRef} />;
}
