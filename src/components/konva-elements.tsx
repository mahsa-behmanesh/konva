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
  toolMode: "draw" | "select"; // New prop for tool mode
  selectedShapeId: string | null; // New prop for selected shape
  onStageClick: (e: KonvaEventObject<MouseEvent>) => void;
  onStageMouseMove: (e: KonvaEventObject<MouseEvent>) => void; // New prop for mouse move
  onShapeClick: (shapeId: string) => void; // New prop for shape click
  onShapeDragEnd: (
    shapeId: string,
    newX: number,
    newY: number,
    type: ShapeData["type"]
  ) => void; // New prop for shape drag end
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
  toolMode,
  selectedShapeId,
  onStageClick,
  onStageMouseMove,
  onShapeClick,
  onShapeDragEnd,
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
          const isSelected = shape.id === selectedShapeId;
          const strokeWidth = isSelected ? 4 : 2; // Thicker stroke for selected shape

          if (shape.type === "polygon") {
            return (
              <Line
                key={shape.id}
                points={pointsToNumberArray(shape.points)}
                stroke="red"
                strokeWidth={strokeWidth}
                closed={shape.isClosed}
                lineJoin="round"
                lineCap="round"
                draggable={toolMode === "select"} // Make draggable in select mode
                onClick={() => onShapeClick(shape.id)}
                onTap={() => onShapeClick(shape.id)} // For mobile tap
                onDragEnd={(e) => {
                  // Konva Line's x and y are relative to its initial position (0,0 by default)
                  // We need to apply this translation to each point and reset Konva's internal x,y
                  const newPoints = shape.points.map((p) => ({
                    x: p.x + e.target.x(),
                    y: p.y + e.target.y(),
                  }));
                  e.target.x(0); // Reset Konva's internal x
                  e.target.y(0); // Reset Konva's internal y
                  onShapeDragEnd(
                    shape.id,
                    newPoints[0].x,
                    newPoints[0].y,
                    shape.type
                  ); // Pass first point's new x,y
                }}
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
                strokeWidth={strokeWidth}
                draggable={toolMode === "select"} // Make draggable in select mode
                onClick={() => onShapeClick(shape.id)}
                onTap={() => onShapeClick(shape.id)} // For mobile tap
                onDragEnd={(e) =>
                  onShapeDragEnd(
                    shape.id,
                    e.target.x(),
                    e.target.y(),
                    shape.type
                  )
                }
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
                strokeWidth={strokeWidth}
                draggable={toolMode === "select"} // Make draggable in select mode
                onClick={() => onShapeClick(shape.id)}
                onTap={() => onShapeClick(shape.id)} // For mobile tap
                onDragEnd={(e) =>
                  onShapeDragEnd(
                    shape.id,
                    e.target.x(),
                    e.target.y(),
                    shape.type
                  )
                }
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
