"use client";

import type React from "react";
import { useRef, useEffect, useState, useCallback } from "react";
import type { ShapeData, Point } from "@/types/drawing";
import { v4 as uuidv4 } from "uuid";

interface VideoCanvasProps {
  videoSrc: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  isPlaying: boolean;
  currentFrameShapes: ShapeData[];
  activePolygonPoints: Point[];
  tempShapeStart: Point | null;
  tempShapeCurrent: Point | null;
  drawingTool: "polygon" | "rectangle" | "circle";
  toolMode: "draw" | "select";
  selectedShapeId: string | null;
  defaultShapeLabel: string;
  defaultShapeColor: string;
  onVideoLoadedData: () => void;
  onVideoTimeUpdate: () => void;
  onVideoEnded: () => void;
  onShapeComplete: (shape: ShapeData) => void;
  onShapeSelect: (shapeId: string | null) => void;
  onShapeUpdate: (shapeId: string, updates: Partial<ShapeData>) => void;
  onActivePolygonUpdate: (points: Point[]) => void;
  onTempShapeUpdate: (start: Point | null, current: Point | null) => void;
  onCommitChanges: () => void;
}

type DragMode = "shape" | "point" | "resize";
interface DragState {
  mode: DragMode;
  pointIndex?: number; // For point dragging
  resizeHandle?: "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w"; // For resize handles
}

export function VideoCanvas({
  videoSrc,
  videoRef,
  isPlaying,
  currentFrameShapes,
  activePolygonPoints,
  tempShapeStart,
  tempShapeCurrent,
  drawingTool,
  toolMode,
  selectedShapeId,
  defaultShapeLabel,
  defaultShapeColor,
  onVideoLoadedData,
  onVideoTimeUpdate,
  onVideoEnded,
  onShapeComplete,
  onShapeSelect,
  onShapeUpdate,
  onActivePolygonUpdate,
  onTempShapeUpdate,
  onCommitChanges,
}: VideoCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerSize, setContainerSize] = useState({
    width: 800,
    height: 450,
  });
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [lastMousePos, setLastMousePos] = useState<Point | null>(null);

  // Update container size
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Update video size when metadata loads
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setVideoSize({ width: video.videoWidth, height: video.videoHeight });
      onVideoLoadedData();
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", onVideoTimeUpdate);
    video.addEventListener("ended", onVideoEnded);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", onVideoTimeUpdate);
      video.removeEventListener("ended", onVideoEnded);
    };
  }, [videoRef, onVideoLoadedData, onVideoTimeUpdate, onVideoEnded]);

  // Calculate video display dimensions
  const getVideoDisplayDimensions = useCallback(() => {
    if (!videoSize.width || !videoSize.height)
      return { width: 0, height: 0, offsetX: 0, offsetY: 0 };

    const containerAspect = containerSize.width / containerSize.height;
    const videoAspect = videoSize.width / videoSize.height;

    let displayWidth, displayHeight, offsetX, offsetY;

    if (videoAspect > containerAspect) {
      displayWidth = containerSize.width;
      displayHeight = containerSize.width / videoAspect;
      offsetX = 0;
      offsetY = (containerSize.height - displayHeight) / 2;
    } else {
      displayWidth = containerSize.height * videoAspect;
      displayHeight = containerSize.height;
      offsetX = (containerSize.width - displayWidth) / 2;
      offsetY = 0;
    }

    return { width: displayWidth, height: displayHeight, offsetX, offsetY };
  }, [containerSize, videoSize]);

  // Convert canvas coordinates to video coordinates
  const canvasToVideo = useCallback(
    (x: number, y: number): Point => {
      const { width, height, offsetX, offsetY } = getVideoDisplayDimensions();
      if (width === 0 || height === 0) return { x: 0, y: 0 };

      const videoX = ((x - offsetX) / width) * videoSize.width;
      const videoY = ((y - offsetY) / height) * videoSize.height;
      return { x: videoX, y: videoY };
    },
    [getVideoDisplayDimensions, videoSize]
  );

  // Convert video coordinates to canvas coordinates
  const videoToCanvas = useCallback(
    (x: number, y: number): Point => {
      const { width, height, offsetX, offsetY } = getVideoDisplayDimensions();
      if (videoSize.width === 0 || videoSize.height === 0)
        return { x: 0, y: 0 };

      const canvasX = (x / videoSize.width) * width + offsetX;
      const canvasY = (y / videoSize.height) * height + offsetY;
      return { x: canvasX, y: canvasY };
    },
    [getVideoDisplayDimensions, videoSize]
  );

  // Get mouse position relative to canvas
  const getMousePos = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    []
  );

  // Check if point is near another point
  const isPointNear = useCallback(
    (p1: Point, p2: Point, threshold = 10): boolean => {
      const distance = Math.sqrt(
        Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2)
      );
      return distance <= threshold;
    },
    []
  );

  const findControlPoint = useCallback(
    (
      mousePos: Point,
      shape: ShapeData
    ): {
      mode: DragMode;
      pointIndex?: number;
      resizeHandle?: string;
    } | null => {
      if (shape.type === "polygon") {
        // Check if clicking on a polygon point
        for (let i = 0; i < shape.points.length; i++) {
          const canvasPoint = videoToCanvas(
            shape.points[i].x,
            shape.points[i].y
          );
          if (isPointNear(mousePos, canvasPoint, 8)) {
            return { mode: "point", pointIndex: i };
          }
        }
      } else if (shape.type === "rectangle") {
        // Check resize handles for rectangle
        const topLeft = videoToCanvas(shape.x, shape.y);
        const topRight = videoToCanvas(shape.x + shape.width, shape.y);
        const bottomLeft = videoToCanvas(shape.x, shape.y + shape.height);
        const bottomRight = videoToCanvas(
          shape.x + shape.width,
          shape.y + shape.height
        );
        const topCenter = videoToCanvas(shape.x + shape.width / 2, shape.y);
        const bottomCenter = videoToCanvas(
          shape.x + shape.width / 2,
          shape.y + shape.height
        );
        const leftCenter = videoToCanvas(shape.x, shape.y + shape.height / 2);
        const rightCenter = videoToCanvas(
          shape.x + shape.width,
          shape.y + shape.height / 2
        );

        if (isPointNear(mousePos, topLeft, 8))
          return { mode: "resize", resizeHandle: "nw" };
        if (isPointNear(mousePos, topRight, 8))
          return { mode: "resize", resizeHandle: "ne" };
        if (isPointNear(mousePos, bottomLeft, 8))
          return { mode: "resize", resizeHandle: "sw" };
        if (isPointNear(mousePos, bottomRight, 8))
          return { mode: "resize", resizeHandle: "se" };
        if (isPointNear(mousePos, topCenter, 8))
          return { mode: "resize", resizeHandle: "n" };
        if (isPointNear(mousePos, bottomCenter, 8))
          return { mode: "resize", resizeHandle: "s" };
        if (isPointNear(mousePos, leftCenter, 8))
          return { mode: "resize", resizeHandle: "w" };
        if (isPointNear(mousePos, rightCenter, 8))
          return { mode: "resize", resizeHandle: "e" };
      } else if (shape.type === "circle") {
        // Check resize handles for circle (4 cardinal directions)
        const center = videoToCanvas(shape.x, shape.y);
        const { width } = getVideoDisplayDimensions();
        const canvasRadius = (shape.radius / videoSize.width) * width;

        const north = { x: center.x, y: center.y - canvasRadius };
        const south = { x: center.x, y: center.y + canvasRadius };
        const east = { x: center.x + canvasRadius, y: center.y };
        const west = { x: center.x - canvasRadius, y: center.y };

        if (isPointNear(mousePos, north, 8))
          return { mode: "resize", resizeHandle: "n" };
        if (isPointNear(mousePos, south, 8))
          return { mode: "resize", resizeHandle: "s" };
        if (isPointNear(mousePos, east, 8))
          return { mode: "resize", resizeHandle: "e" };
        if (isPointNear(mousePos, west, 8))
          return { mode: "resize", resizeHandle: "w" };
      }

      return null;
    },
    [videoToCanvas, isPointNear, getVideoDisplayDimensions, videoSize.width]
  );

  // Find shape at point
  const findShapeAtPoint = useCallback(
    (point: Point): string | null => {
      const videoPoint = canvasToVideo(point.x, point.y);

      for (let i = currentFrameShapes.length - 1; i >= 0; i--) {
        const shape = currentFrameShapes[i];

        if (shape.type === "rectangle") {
          if (
            videoPoint.x >= shape.x &&
            videoPoint.x <= shape.x + shape.width &&
            videoPoint.y >= shape.y &&
            videoPoint.y <= shape.y + shape.height
          ) {
            return shape.id;
          }
        } else if (shape.type === "circle") {
          const distance = Math.sqrt(
            Math.pow(videoPoint.x - shape.x, 2) +
              Math.pow(videoPoint.y - shape.y, 2)
          );
          if (distance <= shape.radius) {
            return shape.id;
          }
        } else if (shape.type === "polygon" && shape.points.length > 2) {
          // Simple point-in-polygon test
          let inside = false;
          for (
            let j = 0, k = shape.points.length - 1;
            j < shape.points.length;
            k = j++
          ) {
            if (
              shape.points[j].y > videoPoint.y !==
                shape.points[k].y > videoPoint.y &&
              videoPoint.x <
                ((shape.points[k].x - shape.points[j].x) *
                  (videoPoint.y - shape.points[j].y)) /
                  (shape.points[k].y - shape.points[j].y) +
                  shape.points[j].x
            ) {
              inside = !inside;
            }
          }
          if (inside) return shape.id;
        }
      }

      return null;
    },
    [currentFrameShapes, canvasToVideo]
  );

  // Handle mouse down
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPlaying) return;

      const mousePos = getMousePos(e);
      const videoPos = canvasToVideo(mousePos.x, mousePos.y);

      if (toolMode === "select") {
        if (selectedShapeId) {
          const selectedShape = currentFrameShapes.find(
            (s) => s.id === selectedShapeId
          );
          if (selectedShape) {
            const controlPoint = findControlPoint(mousePos, selectedShape);
            if (controlPoint) {
              setIsDragging(true);
              //@ts-expect-error ok .
              setDragState(controlPoint);
              setLastMousePos(videoPos);
              return;
            }
          }
        }

        const shapeId = findShapeAtPoint(mousePos);
        if (shapeId !== selectedShapeId) {
          onShapeSelect(shapeId);
          onCommitChanges();
        } else if (shapeId === null && selectedShapeId !== null) {
          onShapeSelect(null);
          onCommitChanges();
        }

        if (shapeId) {
          setIsDragging(true);
          setDragState({ mode: "shape" });
          setLastMousePos(videoPos);
        }
      } else if (toolMode === "draw") {
        if (drawingTool === "polygon") {
          // Check if clicking near first point to close polygon
          if (activePolygonPoints.length >= 3) {
            const firstCanvasPoint = videoToCanvas(
              activePolygonPoints[0].x,
              activePolygonPoints[0].y
            );
            if (isPointNear(mousePos, firstCanvasPoint)) {
              // Close polygon
              const newShape: ShapeData = {
                id: uuidv4(),
                type: "polygon",
                points: activePolygonPoints,
                isClosed: true,
                label: defaultShapeLabel,
                color: defaultShapeColor,
              };
              onShapeComplete(newShape);
              onActivePolygonUpdate([]);
              return;
            }
          }

          // Add point to polygon
          const newPoints = [...activePolygonPoints, videoPos];
          onActivePolygonUpdate(newPoints);
        } else {
          // Start rectangle or circle
          onTempShapeUpdate(videoPos, videoPos);
        }
      }
    },
    [
      isPlaying,
      toolMode,
      drawingTool,
      getMousePos,
      canvasToVideo,
      selectedShapeId,
      currentFrameShapes,
      findControlPoint,
      findShapeAtPoint,
      onShapeSelect,
      onCommitChanges,
      activePolygonPoints,
      videoToCanvas,
      isPointNear,
      defaultShapeLabel,
      defaultShapeColor,
      onShapeComplete,
      onActivePolygonUpdate,
      onTempShapeUpdate,
    ]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPlaying) return;

      const mousePos = getMousePos(e);
      const videoPos = canvasToVideo(mousePos.x, mousePos.y);

      if (isDragging && selectedShapeId && lastMousePos && dragState) {
        const shape = currentFrameShapes.find((s) => s.id === selectedShapeId);
        if (shape) {
          const deltaX = videoPos.x - lastMousePos.x;
          const deltaY = videoPos.y - lastMousePos.y;

          if (dragState.mode === "shape") {
            // Move entire shape
            if (shape.type === "rectangle" || shape.type === "circle") {
              onShapeUpdate(selectedShapeId, {
                x: shape.x + deltaX,
                y: shape.y + deltaY,
              });
            } else if (shape.type === "polygon") {
              const newPoints = shape.points.map((p) => ({
                x: p.x + deltaX,
                y: p.y + deltaY,
              }));
              onShapeUpdate(selectedShapeId, { points: newPoints });
            }
          } else if (
            dragState.mode === "point" &&
            shape.type === "polygon" &&
            dragState.pointIndex !== undefined
          ) {
            // Move individual polygon point
            const newPoints = [...shape.points];
            newPoints[dragState.pointIndex] = videoPos;
            onShapeUpdate(selectedShapeId, { points: newPoints });
          } else if (dragState.mode === "resize") {
            // Handle resize
            if (shape.type === "rectangle" && dragState.resizeHandle) {
              const handle = dragState.resizeHandle;
              let newX = shape.x,
                newY = shape.y,
                newWidth = shape.width,
                newHeight = shape.height;

              if (handle.includes("w")) {
                newWidth = shape.width + (shape.x - videoPos.x);
                newX = videoPos.x;
              }
              if (handle.includes("e")) {
                newWidth = videoPos.x - shape.x;
              }
              if (handle.includes("n")) {
                newHeight = shape.height + (shape.y - videoPos.y);
                newY = videoPos.y;
              }
              if (handle.includes("s")) {
                newHeight = videoPos.y - shape.y;
              }

              // Ensure minimum size
              if (newWidth > 10 && newHeight > 10) {
                onShapeUpdate(selectedShapeId, {
                  x: newX,
                  y: newY,
                  width: newWidth,
                  height: newHeight,
                });
              }
            } else if (shape.type === "circle" && dragState.resizeHandle) {
              // Calculate new radius based on distance from center
              const distance = Math.sqrt(
                Math.pow(videoPos.x - shape.x, 2) +
                  Math.pow(videoPos.y - shape.y, 2)
              );
              if (distance > 5) {
                onShapeUpdate(selectedShapeId, { radius: distance });
              }
            }
          }

          setLastMousePos(videoPos);
        }
      } else if (
        toolMode === "draw" &&
        tempShapeStart &&
        (drawingTool === "rectangle" || drawingTool === "circle")
      ) {
        onTempShapeUpdate(tempShapeStart, videoPos);
      }
    },
    [
      isPlaying,
      getMousePos,
      canvasToVideo,
      isDragging,
      selectedShapeId,
      currentFrameShapes,
      lastMousePos,
      dragState,
      onShapeUpdate,
      toolMode,
      tempShapeStart,
      drawingTool,
      onTempShapeUpdate,
    ]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPlaying) return;

      if (isDragging) {
        setIsDragging(false);
        setDragState(null);
        setLastMousePos(null);
        onCommitChanges();
      } else if (
        toolMode === "draw" &&
        tempShapeStart &&
        tempShapeCurrent &&
        (drawingTool === "rectangle" || drawingTool === "circle")
      ) {
        // Complete rectangle or circle
        let newShape: ShapeData | null = null;

        if (drawingTool === "rectangle") {
          const x = Math.min(tempShapeStart.x, tempShapeCurrent.x);
          const y = Math.min(tempShapeStart.y, tempShapeCurrent.y);
          const width = Math.abs(tempShapeStart.x - tempShapeCurrent.x);
          const height = Math.abs(tempShapeStart.y - tempShapeCurrent.y);

          if (width > 5 && height > 5) {
            newShape = {
              id: uuidv4(),
              type: "rectangle",
              x,
              y,
              width,
              height,
              label: defaultShapeLabel,
              color: defaultShapeColor,
            };
          }
        } else if (drawingTool === "circle") {
          const radius = Math.sqrt(
            Math.pow(tempShapeCurrent.x - tempShapeStart.x, 2) +
              Math.pow(tempShapeCurrent.y - tempShapeStart.y, 2)
          );

          if (radius > 5) {
            newShape = {
              id: uuidv4(),
              type: "circle",
              x: tempShapeStart.x,
              y: tempShapeStart.y,
              radius,
              label: defaultShapeLabel,
              color: defaultShapeColor,
            };
          }
        }

        if (newShape) {
          onShapeComplete(newShape);
        }
        onTempShapeUpdate(null, null);
      }
    },
    [
      isPlaying,
      isDragging,
      onCommitChanges,
      toolMode,
      tempShapeStart,
      tempShapeCurrent,
      drawingTool,
      defaultShapeLabel,
      defaultShapeColor,
      onShapeComplete,
      onTempShapeUpdate,
    ]
  );

  // Draw shapes on canvas
  const drawShapes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { width, height, offsetX, offsetY } = getVideoDisplayDimensions();
    if (width === 0 || height === 0) return;

    // Draw completed shapes
    currentFrameShapes.forEach((shape) => {
      const isSelected = selectedShapeId === shape.id;
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = isSelected ? 3 : 2;

      if (isSelected) {
        ctx.fillStyle = shape.color + "40"; // Add 40 for ~25% opacity
      } else {
        ctx.fillStyle = "transparent";
      }

      if (shape.type === "rectangle") {
        const canvasPos = videoToCanvas(shape.x, shape.y);
        const canvasSize = {
          width: (shape.width / videoSize.width) * width,
          height: (shape.height / videoSize.height) * height,
        };

        if (isSelected) {
          ctx.fillRect(
            canvasPos.x,
            canvasPos.y,
            canvasSize.width,
            canvasSize.height
          );
        }
        ctx.strokeRect(
          canvasPos.x,
          canvasPos.y,
          canvasSize.width,
          canvasSize.height
        );

        if (isSelected) {
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 1;

          const handleSize = 6;
          const handles = [
            { x: canvasPos.x, y: canvasPos.y }, // nw
            { x: canvasPos.x + canvasSize.width, y: canvasPos.y }, // ne
            { x: canvasPos.x, y: canvasPos.y + canvasSize.height }, // sw
            {
              x: canvasPos.x + canvasSize.width,
              y: canvasPos.y + canvasSize.height,
            }, // se
            { x: canvasPos.x + canvasSize.width / 2, y: canvasPos.y }, // n
            {
              x: canvasPos.x + canvasSize.width / 2,
              y: canvasPos.y + canvasSize.height,
            }, // s
            { x: canvasPos.x, y: canvasPos.y + canvasSize.height / 2 }, // w
            {
              x: canvasPos.x + canvasSize.width,
              y: canvasPos.y + canvasSize.height / 2,
            }, // e
          ];

          handles.forEach((handle) => {
            ctx.fillRect(
              handle.x - handleSize / 2,
              handle.y - handleSize / 2,
              handleSize,
              handleSize
            );
            ctx.strokeRect(
              handle.x - handleSize / 2,
              handle.y - handleSize / 2,
              handleSize,
              handleSize
            );
          });

          ctx.fillStyle = shape.color;
          ctx.font = "14px Arial";
          ctx.fillText(shape.label, canvasPos.x, canvasPos.y - 5);
        }
      } else if (shape.type === "circle") {
        const canvasPos = videoToCanvas(shape.x, shape.y);
        const canvasRadius = (shape.radius / videoSize.width) * width;
        ctx.beginPath();
        ctx.arc(canvasPos.x, canvasPos.y, canvasRadius, 0, 2 * Math.PI);

        if (isSelected) {
          ctx.fill();
        }
        ctx.stroke();

        if (isSelected) {
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 1;

          const handleSize = 6;
          const handles = [
            { x: canvasPos.x, y: canvasPos.y - canvasRadius }, // n
            { x: canvasPos.x, y: canvasPos.y + canvasRadius }, // s
            { x: canvasPos.x + canvasRadius, y: canvasPos.y }, // e
            { x: canvasPos.x - canvasRadius, y: canvasPos.y }, // w
          ];

          handles.forEach((handle) => {
            ctx.fillRect(
              handle.x - handleSize / 2,
              handle.y - handleSize / 2,
              handleSize,
              handleSize
            );
            ctx.strokeRect(
              handle.x - handleSize / 2,
              handle.y - handleSize / 2,
              handleSize,
              handleSize
            );
          });

          ctx.fillStyle = shape.color;
          ctx.font = "14px Arial";
          ctx.fillText(
            shape.label,
            canvasPos.x - canvasRadius,
            canvasPos.y - canvasRadius - 5
          );
        }
      } else if (shape.type === "polygon" && shape.points.length > 0) {
        ctx.beginPath();
        const firstPoint = videoToCanvas(shape.points[0].x, shape.points[0].y);
        ctx.moveTo(firstPoint.x, firstPoint.y);

        for (let i = 1; i < shape.points.length; i++) {
          const point = videoToCanvas(shape.points[i].x, shape.points[i].y);
          ctx.lineTo(point.x, point.y);
        }

        if (shape.isClosed) {
          ctx.closePath();
        }

        if (isSelected && shape.isClosed) {
          ctx.fill();
        }
        ctx.stroke();

        if (isSelected) {
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 1;

          shape.points.forEach((point) => {
            const canvasPoint = videoToCanvas(point.x, point.y);
            ctx.beginPath();
            ctx.arc(canvasPoint.x, canvasPoint.y, 4, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
          });

          ctx.fillStyle = shape.color;
          ctx.font = "14px Arial";
          ctx.fillText(shape.label, firstPoint.x, firstPoint.y - 5);
        }
      }
    });

    // Draw active polygon
    if (activePolygonPoints.length > 0) {
      ctx.strokeStyle = "#ff0000";
      ctx.lineWidth = 2;
      ctx.beginPath();

      const firstPoint = videoToCanvas(
        activePolygonPoints[0].x,
        activePolygonPoints[0].y
      );
      ctx.moveTo(firstPoint.x, firstPoint.y);

      for (let i = 1; i < activePolygonPoints.length; i++) {
        const point = videoToCanvas(
          activePolygonPoints[i].x,
          activePolygonPoints[i].y
        );
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();

      // Draw points
      ctx.fillStyle = "#0000ff";
      activePolygonPoints.forEach((point) => {
        const canvasPoint = videoToCanvas(point.x, point.y);
        ctx.beginPath();
        ctx.arc(canvasPoint.x, canvasPoint.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      });

      // Highlight first point if we can close
      if (activePolygonPoints.length >= 3) {
        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(firstPoint.x, firstPoint.y, 8, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }

    // Draw temporary shape
    if (tempShapeStart && tempShapeCurrent) {
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);

      if (drawingTool === "rectangle") {
        const startCanvas = videoToCanvas(tempShapeStart.x, tempShapeStart.y);
        const currentCanvas = videoToCanvas(
          tempShapeCurrent.x,
          tempShapeCurrent.y
        );
        const width = currentCanvas.x - startCanvas.x;
        const height = currentCanvas.y - startCanvas.y;
        ctx.strokeRect(startCanvas.x, startCanvas.y, width, height);
      } else if (drawingTool === "circle") {
        const startCanvas = videoToCanvas(tempShapeStart.x, tempShapeStart.y);
        const currentCanvas = videoToCanvas(
          tempShapeCurrent.x,
          tempShapeCurrent.y
        );
        const radius = Math.sqrt(
          Math.pow(currentCanvas.x - startCanvas.x, 2) +
            Math.pow(currentCanvas.y - startCanvas.y, 2)
        );
        ctx.beginPath();
        ctx.arc(startCanvas.x, startCanvas.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      }

      ctx.setLineDash([]);
    }
  }, [
    currentFrameShapes,
    selectedShapeId,
    activePolygonPoints,
    tempShapeStart,
    tempShapeCurrent,
    drawingTool,
    getVideoDisplayDimensions,
    videoToCanvas,
    videoSize,
  ]);

  // Redraw canvas when shapes change
  useEffect(() => {
    drawShapes();
  }, [drawShapes]);

  // Update canvas size and redraw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = containerSize.width;
    canvas.height = containerSize.height;
    drawShapes();
  }, [containerSize, drawShapes]);

  const {
    width: displayWidth,
    height: displayHeight,
    offsetX,
    offsetY,
  } = getVideoDisplayDimensions();

  return (
    // <div ref={containerRef} className="relative w-full h-full bg-black">
    //   <video
    //     ref={videoRef}
    //     src={videoSrc}
    //     className="w-full h-full object-contain"
    //     onLoadedData={onVideoLoadedData}
    //     onTimeUpdate={onVideoTimeUpdate}
    //     onEnded={onVideoEnded}
    //   />
    //   <canvas
    //     ref={canvasRef}
    //     className="absolute inset-0 cursor-crosshair"
    //     onMouseDown={handleMouseDown}
    //     onMouseMove={handleMouseMove}
    //     onMouseUp={handleMouseUp}
    //   />
    // </div>
    <div
      ref={containerRef}
      className="relative w-full bg-black rounded-lg overflow-hidden"
      style={{ aspectRatio: "16/9", maxHeight: "500px" }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={videoSrc}
        className="absolute"
        style={{
          left: offsetX,
          top: offsetY,
          width: displayWidth,
          height: displayHeight,
          objectFit: "contain",
        }}
        muted
        playsInline
      />

      {/* Drawing canvas overlay */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 ${
          toolMode === "draw" && "cursor-crosshair"
        } ${selectedShapeId && "cursor-move"}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          pointerEvents:
            toolMode === "draw" || selectedShapeId ? "auto" : "auto",
        }}
      />
    </div>
  );
}
