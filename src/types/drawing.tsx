export interface Point {
  x: number;
  y: number;
}

export interface BaseShape {
  id: string;
  label: string;
  color: string;
}

export interface PolygonShape extends BaseShape {
  type: "polygon";
  points: Point[];
  isClosed: boolean;
}

export interface RectangleShape extends BaseShape {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CircleShape extends BaseShape {
  type: "circle";
  x: number;
  y: number;
  radius: number;
}

export type ShapeData = PolygonShape | RectangleShape | CircleShape;
export type Shape = ShapeData;
