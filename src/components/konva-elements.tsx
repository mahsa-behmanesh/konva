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
  tempRectStartPoint: Point | null; // First click for rectangle
  tempCircleCenterPoint: Point | null; // First click for circle
  onStageClick: (e: KonvaEventObject<MouseEvent>) => void;
}

export default function KonvaElements({
  width,
  height,
  currentFrameImage,
  currentFrameShapes,
  activePolygonPoints,
  tempRectStartPoint,
  tempCircleCenterPoint,
  onStageClick,
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

  // Calculate temporary rectangle dimensions
  const tempRect =
    tempRectStartPoint && tempCircleCenterPoint // tempCircleCenterPoint is used as the second click for rect
      ? {
          x: Math.min(tempRectStartPoint.x, tempCircleCenterPoint.x),
          y: Math.min(tempRectStartPoint.y, tempCircleCenterPoint.y),
          width: Math.abs(tempRectStartPoint.x - tempCircleCenterPoint.x),
          height: Math.abs(tempRectStartPoint.y - tempCircleCenterPoint.y),
        }
      : null;

  // Calculate temporary circle radius
  const tempCircleRadius =
    tempCircleCenterPoint && tempRectStartPoint // tempRectStartPoint is used as the second click for circle
      ? Math.sqrt(
          Math.pow(tempRectStartPoint.x - tempCircleCenterPoint.x, 2) +
            Math.pow(tempRectStartPoint.y - tempCircleCenterPoint.y, 2)
        )
      : 0;

  return (
    <Stage
      width={width}
      height={height}
      onMouseDown={onStageClick}
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

        {/* Render temporary rectangle */}
        {tempRectStartPoint && tempCircleCenterPoint && tempRect && (
          <Rect
            x={tempRect.x}
            y={tempRect.y}
            width={tempRect.width}
            height={tempRect.height}
            stroke="green"
            strokeWidth={2}
            dash={[10, 5]} // Dashed line for temporary drawing
          />
        )}
        {tempRectStartPoint && (
          <Circle
            x={tempRectStartPoint.x}
            y={tempRectStartPoint.y}
            radius={5}
            fill="blue"
            stroke="white"
            strokeWidth={1}
          />
        )}

        {/* Render temporary circle */}
        {tempCircleCenterPoint &&
          tempRectStartPoint &&
          tempCircleRadius > 0 && (
            <Circle
              x={tempCircleCenterPoint.x}
              y={tempCircleCenterPoint.y}
              radius={tempCircleRadius}
              stroke="blue"
              strokeWidth={2}
              dash={[10, 5]} // Dashed line for temporary drawing
            />
          )}
        {tempCircleCenterPoint && (
          <Circle
            x={tempCircleCenterPoint.x}
            y={tempCircleCenterPoint.y}
            radius={5}
            fill="blue"
            stroke="white"
            strokeWidth={1}
          />
        )}
      </Layer>
    </Stage>
  );
}
