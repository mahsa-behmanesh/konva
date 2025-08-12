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
  onActivePolygonUpdate: (points: Point[]) => void; // This now takes the new points and commits to history in parent
  onTempShapeUpdate: (start: Point | null, current: Point | null) => void;
  onCommitChanges: () => void; // New prop for committing changes
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
  onActivePolygonUpdate, // This is now the function that updates parent's state and commits to history
  onTempShapeUpdate,
  onCommitChanges, // Destructure new prop
}: VideoCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerSize, setContainerSize] = useState({
    width: 800,
    height: 450,
  });
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState<Point | null>(null); // New state for tracking last mouse position during drag

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
        const shapeId = findShapeAtPoint(mousePos);
        if (shapeId !== selectedShapeId) {
          onShapeSelect(shapeId);
          onCommitChanges(); // Commit when selection changes (e.g., clicking empty space to deselect)
        } else if (shapeId === null && selectedShapeId !== null) {
          // Clicking empty space to deselect
          onShapeSelect(null);
          onCommitChanges();
        }

        if (shapeId) {
          setIsDragging(true);
          setLastMousePos(videoPos); // Store the video coordinates of the mouse when drag starts
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
              onActivePolygonUpdate([]); // Clear active polygon points and reset its history
              return;
            }
          }

          // Add point to polygon
          const newPoints = [...activePolygonPoints, videoPos];
          onActivePolygonUpdate(newPoints); // Update active polygon points and commit to its history
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
      findShapeAtPoint,
      onShapeSelect,
      selectedShapeId,
      onCommitChanges,
      activePolygonPoints,
      videoToCanvas,
      isPointNear,
      defaultShapeLabel,
      defaultShapeColor,
      onShapeComplete,
      onActivePolygonUpdate, // Now used for updating and committing active polygon points
      onTempShapeUpdate,
    ]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPlaying) return;

      const mousePos = getMousePos(e);
      const videoPos = canvasToVideo(mousePos.x, mousePos.y);

      if (isDragging && selectedShapeId && lastMousePos) {
        const shape = currentFrameShapes.find((s) => s.id === selectedShapeId);
        if (shape) {
          const deltaX = videoPos.x - lastMousePos.x;
          const deltaY = videoPos.y - lastMousePos.y;

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
          setLastMousePos(videoPos); // Update last mouse position for the next move event
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
      lastMousePos, // Use lastMousePos here
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
        setLastMousePos(null); // Clear last mouse position
        onCommitChanges(); // Commit after drag ends
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
      onCommitChanges, // Add onCommitChanges here
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
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = selectedShapeId === shape.id ? 3 : 2;
      ctx.fillStyle = "transparent";

      if (shape.type === "rectangle") {
        const canvasPos = videoToCanvas(shape.x, shape.y);
        const canvasSize = {
          width: (shape.width / videoSize.width) * width,
          height: (shape.height / videoSize.height) * height,
        };
        ctx.strokeRect(
          canvasPos.x,
          canvasPos.y,
          canvasSize.width,
          canvasSize.height
        );

        if (selectedShapeId === shape.id) {
          ctx.fillStyle = shape.color;
          ctx.font = "14px Arial";
          ctx.fillText(shape.label, canvasPos.x, canvasPos.y - 5);
        }
      } else if (shape.type === "circle") {
        const canvasPos = videoToCanvas(shape.x, shape.y);
        const canvasRadius = (shape.radius / videoSize.width) * width;
        ctx.beginPath();
        ctx.arc(canvasPos.x, canvasPos.y, canvasRadius, 0, 2 * Math.PI);
        ctx.stroke();

        if (selectedShapeId === shape.id) {
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
        ctx.stroke();

        if (selectedShapeId === shape.id) {
          ctx.fillStyle = shape.color;
          ctx.font = "20px Arial";
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

  // Update canvas size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = containerSize.width;
      canvas.height = containerSize.height;
      drawShapes();
    }
  }, [containerSize, drawShapes]);

  const {
    width: displayWidth,
    height: displayHeight,
    offsetX,
    offsetY,
  } = getVideoDisplayDimensions();

  return (
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
