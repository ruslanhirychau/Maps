// Marker shapes a workspace can use. The glyph is rendered as a Mapbox symbol
// and tinted with the layer color; a custom emoji can be used instead.
export const MARKER_SHAPES = [
  { id: "circle", glyph: "●", label: "Circle" },
  { id: "square", glyph: "■", label: "Square" },
  { id: "diamond", glyph: "◆", label: "Diamond" },
  { id: "star", glyph: "★", label: "Star" },
  { id: "pin", glyph: "📍", label: "Pin" },
] as const;

export type MarkerId = (typeof MARKER_SHAPES)[number]["id"];

// Marker value is a known shape id OR any emoji typed by the user.
export function markerGlyph(marker: string): string {
  const shape = MARKER_SHAPES.find((m) => m.id === marker);
  return shape ? shape.glyph : marker;
}
