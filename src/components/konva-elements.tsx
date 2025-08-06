"use client";

import {
  Stage,
  Layer,
  Image as KonvaImage,
  Line,
  Circle,
  Rect,
  Transformer,
  Text,
} from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type {
  ShapeData,
  Point,
  PolygonShape,
  RectangleShape,
  CircleShape,
} from "@/types/drawing";
import React, { useRef, useEffect } from "react";
import Konva from "konva"; // Import Konva for specific types

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
  onShapeTransformEnd: (
    shapeId: string,
    newAttrs: {
      x: number;
      y: number;
      width?: number;
      height?: number;
      radius?: number;
    },
    type: ShapeData["type"]
  ) => void; // New prop for shape transform end
  onPolygonPointDragEnd: (
    polygonId: string,
    pointIndex: number,
    newX: number,
    newY: number
  ) => void; // New prop for polygon point drag end
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
  onShapeTransformEnd,
  onPolygonPointDragEnd,
}: KonvaElementsProps) {
  const transformerRef = useRef<Konva.Transformer>(null);
  // Changed type to Konva.Node to be compatible with Line, Rect, Circle
  const selectedShapeRef = useRef<Konva.Node | null>(null);

  useEffect(() => {
    if (
      toolMode === "select" &&
      transformerRef.current &&
      selectedShapeRef.current
    ) {
      transformerRef.current.nodes([selectedShapeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [toolMode, selectedShapeId, currentFrameShapes]); // Re-attach transformer if selected shape changes or its properties update

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
          const strokeColor = shape.color || "#FF0000"; // Use shape's color or default to red

          let textX = 0;
          let textY = 0;

          if (shape.type === "polygon") {
            // Use the first point of the polygon for label position
            if (shape.points.length > 0) {
              textX = shape.points[0].x;
              textY = shape.points[0].y - 20; // Offset above the point
            }
          } else if (shape.type === "rectangle") {
            textX = shape.x;
            textY = shape.y - 20; // Offset above the rectangle
          } else if (shape.type === "circle") {
            textX = shape.x - shape.radius; // Left edge of the circle
            textY = shape.y - shape.radius - 20; // Offset above the circle
          }

          return (
            <React.Fragment key={shape.id}>
              {shape.type === "polygon" && (
                <Line
                  //@ts-expect-error ok . .
                  ref={isSelected ? selectedShapeRef : null} // Attach ref if selected
                  points={pointsToNumberArray(shape.points)}
                  stroke={strokeColor} // Use custom color
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
              )}
              {shape.type === "rectangle" && (
                <Rect
                  key={shape.id}
                  //@ts-expect-error ok . .

                  ref={isSelected ? selectedShapeRef : null} // Attach ref if selected
                  x={shape.x}
                  y={shape.y}
                  width={shape.width}
                  height={shape.height}
                  stroke={strokeColor} // Use custom color
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
                  onTransformEnd={(e) => {
                    // transformer is changing scale of the node
                    // and NOT its width/height
                    // but in the store we have only width/height
                    // to match the data structure we need to reset scale values
                    const node = e.target as Konva.Rect; // Type assertion
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();

                    // reset scale to 1
                    node.scaleX(1);
                    node.scaleY(1);

                    onShapeTransformEnd(
                      shape.id,
                      {
                        x: node.x(),
                        y: node.y(),
                        width: Math.max(5, node.width() * scaleX),
                        height: Math.max(5, node.height() * scaleY),
                      },
                      shape.type
                    );
                  }}
                />
              )}
              {shape.type === "circle" && (
                <Circle
                  key={shape.id}
                  //@ts-expect-error ok . .

                  ref={isSelected ? selectedShapeRef : null} // Attach ref if selected
                  x={shape.x}
                  y={shape.y}
                  radius={shape.radius}
                  stroke={strokeColor} // Use custom color
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
                  onTransformEnd={(e) => {
                    const node = e.target as Konva.Circle; // Type assertion
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();

                    node.scaleX(1);
                    node.scaleY(1);

                    // For a circle, radius is scaled by the larger of scaleX/scaleY
                    const newRadius = Math.max(
                      5,
                      node.radius() * Math.max(scaleX, scaleY)
                    );

                    onShapeTransformEnd(
                      shape.id,
                      {
                        x: node.x(),
                        y: node.y(),
                        radius: newRadius,
                      },
                      shape.type
                    );
                  }}
                />
              )}

              {/* Render draggable points for selected polygons */}
              {isSelected &&
                toolMode === "select" &&
                shape.type === "polygon" &&
                (shape as PolygonShape).points.map((point, index) => (
                  <Circle
                    key={`${shape.id}-point-${index}`}
                    x={point.x}
                    y={point.y}
                    radius={6} // Slightly larger for easier dragging
                    fill="blue"
                    stroke="white"
                    strokeWidth={1}
                    draggable
                    onDragEnd={(e) =>
                      onPolygonPointDragEnd(
                        shape.id,
                        index,
                        e.target.x(),
                        e.target.y()
                      )
                    }
                  />
                ))}

              {/* Render label for selected shape */}
              {isSelected && (
                <Text
                  x={textX}
                  y={textY}
                  text={shape.label}
                  fontSize={20}
                  fill="yellow"
                  stroke="black"
                  strokeWidth={1}
                  padding={5}
                  // shadowColor="black"
                  // shadowBlur={5}
                  // shadowOffset={{ x: 2, y: 2 }}
                  // shadowOpacity={0.5}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Render active polygon points */}
        {activePolygonPoints.length > 0 && (
          <>
            <Line
              points={pointsToNumberArray(activePolygonPoints)}
              stroke="red" // Active polygon always red
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
                stroke="green" // Temp rectangle always green
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
                    Math.pow(tempShapeCurrentPoint.y - tempShapeStartPoint.y, 2) // Corrected: use tempShapeStartPoint.y
                )}
                stroke="blue" // Temp circle always blue
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

        {/* Render Transformer for selected Rectangles and Circles */}
        {toolMode === "select" &&
          selectedShapeId &&
          selectedShapeRef.current && (
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                // limit resize
                if (newBox.width < 5 || newBox.height < 5) {
                  return oldBox;
                }
                return newBox;
              }}
            />
          )}
      </Layer>
    </Stage>
  );
}
