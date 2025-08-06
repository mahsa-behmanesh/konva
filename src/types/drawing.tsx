export interface Point {
  x: number;
  y: number;
}

export interface PolygonShape {
  id: string; // Unique ID for the shape
  type: "polygon";
  points: Point[];
  isClosed: boolean;
  label: string; // New: Label for the shape
  color: string; // New: Color for the shape
}

export interface RectangleShape {
  id: string; // Unique ID for the shape
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  label: string; // New: Label for the shape
  color: string; // New: Color for the shape
}

export interface CircleShape {
  id: string; // Unique ID for the shape
  type: "circle";
  x: number; // center x
  y: number; // center y
  radius: number;
  label: string; // New: Label for the shape
  color: string; // New: Color for the shape
}

export type ShapeData = PolygonShape | RectangleShape | CircleShape;
