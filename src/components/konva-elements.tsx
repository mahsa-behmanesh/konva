"use client";

import {
  Stage,
  Layer,
  Image as KonvaImage,
  Line,
  Circle,
  Rect,
} from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { ShapeData, Point } from "@/types/drawing";

interface KonvaElementsProps {
  width: number;
  height: number;
  currentFrameImage: string | null;
  currentFrameShapes: ShapeData[]; // Completed shapes for the current frame
  activePolygonPoints: Point[]; // Points for the polygon currently being drawn
  tempShapeStartPoint: Point | null; // First click for rectangle/circle
  tempShapeCurrentPoint: Point | null; // Current mouse position for dynamic preview
  drawingTool: "polygon" | "rectangle" | "circle"; // New prop to help rendering temp shapes
  onStageClick: (e: KonvaEventObject<MouseEvent>) => void;
  onStageMouseMove: (e: KonvaEventObject<MouseEvent>) => void; // New prop for mouse move
}

export default function KonvaElements({
  width,
  height,
  currentFrameImage,
  currentFrameShapes,
  activePolygonPoints,
  tempShapeStartPoint,
  tempShapeCurrentPoint,
  drawingTool,
  onStageClick,
  onStageMouseMove,
}: KonvaElementsProps) {
  if (!currentFrameImage || width === 0 || height === 0) {
    return (
      <div className="w-full h-96 bg-gray-200 flex items-center justify-center rounded-lg text-gray-500">
        Loading video...
      </div>
    );
  }

  // Helper to convert Point[] to number[] for Konva Line
  const pointsToNumberArray = (points: Point[]): number[] => {
    return points.flatMap((p) => [p.x, p.y]);
  };

  return (
    <Stage
      width={width}
      height={height}
      onMouseDown={onStageClick}
      onMouseMove={onStageMouseMove} // Add mouse move handler
      className="border border-gray-300 rounded-lg overflow-hidden"
    >
      <Layer>
        <KonvaImage
          image={Object.assign(new window.Image(), { src: currentFrameImage })}
        />

        {/* Render completed shapes */}
        {currentFrameShapes.map((shape) => {
          if (shape.type === "polygon") {
            return (
              <Line
                key={shape.id}
                points={pointsToNumberArray(shape.points)}
                stroke="red"
                strokeWidth={2}
                closed={shape.isClosed}
                lineJoin="round"
                lineCap="round"
              />
            );
          } else if (shape.type === "rectangle") {
            return (
              <Rect
                key={shape.id}
                x={shape.x}
                y={shape.y}
                width={shape.width}
                height={shape.height}
                stroke="green"
                strokeWidth={2}
              />
            );
          } else if (shape.type === "circle") {
            return (
              <Circle
                key={shape.id}
                x={shape.x}
                y={shape.y}
                radius={shape.radius}
                stroke="blue"
                strokeWidth={2}
              />
            );
          }
          return null;
        })}

        {/* Render active polygon points */}
        {activePolygonPoints.length > 0 && (
          <>
            <Line
              points={pointsToNumberArray(activePolygonPoints)}
              stroke="red"
              strokeWidth={2}
              closed={false}
              lineJoin="round"
              lineCap="round"
            />
            {activePolygonPoints.map((point, i) => (
              <Circle
                key={`active-poly-point-${i}`}
                x={point.x}
                y={point.y}
                radius={5}
                fill="blue"
                stroke="white"
                strokeWidth={1}
              />
            ))}
          </>
        )}

        {/* Render temporary rectangle/circle */}
        {tempShapeStartPoint && tempShapeCurrentPoint && (
          <>
            {drawingTool === "rectangle" && (
              <Rect
                x={Math.min(tempShapeStartPoint.x, tempShapeCurrentPoint.x)}
                y={Math.min(tempShapeStartPoint.y, tempShapeCurrentPoint.y)}
                width={Math.abs(
                  tempShapeStartPoint.x - tempShapeCurrentPoint.x
                )}
                height={Math.abs(
                  tempShapeStartPoint.y - tempShapeCurrentPoint.y
                )}
                stroke="green"
                strokeWidth={2}
                dash={[10, 5]} // Dashed line for temporary drawing
              />
            )}
            {drawingTool === "circle" && (
              <Circle
                x={tempShapeStartPoint.x}
                y={tempShapeStartPoint.y}
                radius={Math.sqrt(
                  Math.pow(tempShapeCurrentPoint.x - tempShapeStartPoint.x, 2) +
                    Math.pow(tempShapeCurrentPoint.y - tempShapeStartPoint.y, 2)
                )}
                stroke="blue"
                strokeWidth={2}
                dash={[10, 5]} // Dashed line for temporary drawing
              />
            )}
            {/* Indicate the start point */}
            <Circle
              x={tempShapeStartPoint.x}
              y={tempShapeStartPoint.y}
              radius={5}
              fill="blue"
              stroke="white"
              strokeWidth={1}
            />
          </>
        )}
      </Layer>
    </Stage>
  );
}
