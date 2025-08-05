"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import dynamic from "next/dynamic";
import type { ShapeData, Point, PolygonShape } from "@/types/drawing";
import { v4 as uuidv4 } from "uuid"; // For unique IDs

const KonvaElements = dynamic(() => import("@/components/konva-elements"), {
  ssr: false,
});

export default function VideoFrameEditor() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentFrameImage, setCurrentFrameImage] = useState<string | null>(
    null
  );
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentFrameTime, setCurrentFrameTime] = useState(0);
  const [videoDimensions, setVideoDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isLoadingVideo, setIsLoadingVideo] = useState(true);

  // New state for drawing tool selection
  const [drawingTool, setDrawingTool] = useState<
    "polygon" | "rectangle" | "circle"
  >("polygon");

  // State to store all completed shapes for each frame
  const [frameShapes, setFrameShapes] = useState<Map<number, ShapeData[]>>(
    new Map()
  );
  // State for completed shapes of the currently displayed frame
  const [currentFrameShapes, setCurrentFrameShapes] = useState<ShapeData[]>([]);

  // Temporary states for drawing in progress
  const [activePolygonPoints, setActivePolygonPoints] = useState<Point[]>([]); // For polygon being drawn
  const [activePolygonHistory, setActivePolygonHistory] = useState<Point[][]>([
    [],
  ]); // History for undo/redo
  const [activePolygonHistoryIndex, setActivePolygonHistoryIndex] = useState(0); // Current index in history

  const [tempShapeStartPoint, setTempShapeStartPoint] = useState<Point | null>(
    null
  ); // First click for rectangle/circle
  const [tempShapeCurrentPoint, setTempShapeCurrentPoint] =
    useState<Point | null>(null); // Current mouse position for dynamic preview

  const FPS = 30; // Assuming 30 frames per second for navigation
  const currentFrameNumber = Math.floor(currentFrameTime * FPS);

  // Helper to save current frame's shapes to the map
  const saveCurrentFrameShapes = useCallback(() => {
    setFrameShapes((prevMap) => {
      const newMap = new Map(prevMap);
      // Combine active polygon with completed shapes before saving
      const shapesToSave = [...currentFrameShapes];
      if (activePolygonPoints.length > 0) {
        shapesToSave.push({
          id: uuidv4(),
          type: "polygon",
          points: activePolygonPoints,
          isClosed: false, // Polygons are saved as open until explicitly closed
        });
      }
      newMap.set(currentFrameNumber, shapesToSave);
      return newMap;
    });
  }, [currentFrameNumber, currentFrameShapes, activePolygonPoints]);

  // Effect to load shapes when the current frame number changes
  useEffect(() => {
    const savedShapes = frameShapes.get(currentFrameNumber);
    setCurrentFrameShapes(savedShapes ? [...savedShapes] : []);
    setActivePolygonPoints([]); // Clear active polygon when changing frames
    setActivePolygonHistory([[]]); // Reset history
    setActivePolygonHistoryIndex(0); // Reset history index
    setTempShapeStartPoint(null); // Clear temp shape points
    setTempShapeCurrentPoint(null); // Clear temp shape points
  }, [currentFrameNumber, frameShapes]);

  const drawFrameToCanvas = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      if (
        video.readyState >= 2 /* HTMLMediaElement.HAVE_CURRENT_DATA */ &&
        video.videoWidth > 0
      ) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
          setCurrentFrameImage(canvas.toDataURL("image/png"));
          setVideoDimensions({
            width: video.videoWidth,
            height: video.videoHeight,
          });
          setIsLoadingVideo(false);
          console.log(
            "Frame drawn to canvas. Dimensions:",
            video.videoWidth,
            video.videoHeight
          );
        }
      } else {
        console.log(
          "Video not ready for drawing yet. ReadyState:",
          video.readyState,
          "Dimensions:",
          video.videoWidth,
          video.videoHeight
        );
      }
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      const handleLoadedMetadata = () => {
        setVideoDuration(video.duration);
        setCurrentFrameTime(0); // Start at the beginning
        console.log("Video metadata loaded. Duration:", video.duration);
      };

      const handleLoadedData = () => {
        console.log("Video loaded data. Attempting to draw initial frame.");
        drawFrameToCanvas();
      };

      const handleSeeked = () => {
        console.log("Video seeked. Drawing new frame.");
        drawFrameToCanvas();
      };

      const handleError = (e: Event) => {
        console.error("Video error:", video.error);
        setIsLoadingVideo(false);
      };

      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      video.addEventListener("loadeddata", handleLoadedData);
      video.addEventListener("seeked", handleSeeked);
      video.addEventListener("error", handleError);

      return () => {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("loadeddata", handleLoadedData);
        video.removeEventListener("seeked", handleSeeked);
        video.removeEventListener("error", handleError);
      };
    }
  }, [drawFrameToCanvas]);

  const handleSliderChange = (value: number[]) => {
    const newTime = value[0];
    if (videoRef.current) {
      saveCurrentFrameShapes(); // Save current frame's shapes before changing frame
      videoRef.current.currentTime = newTime;
      setCurrentFrameTime(newTime);
    }
  };

  const handleNextFrame = () => {
    if (videoRef.current) {
      saveCurrentFrameShapes(); // Save current frame's shapes before changing frame
      const newTime = Math.min(videoDuration, currentFrameTime + 1 / FPS);
      videoRef.current.currentTime = newTime;
      setCurrentFrameTime(newTime);
    }
  };

  const handlePrevFrame = () => {
    if (videoRef.current) {
      saveCurrentFrameShapes(); // Save current frame's shapes before changing frame
      const newTime = Math.max(0, currentFrameTime - 1 / FPS);
      videoRef.current.currentTime = newTime;
      setCurrentFrameTime(newTime);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleStageClick = (e: any) => {
    if (!isDrawingMode) return;

    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    if (!pointerPosition) return;

    const newPoint: Point = { x: pointerPosition.x, y: pointerPosition.y };

    if (drawingTool === "polygon") {
      const newPoints = [...activePolygonPoints, newPoint];
      const newHistory = activePolygonHistory.slice(
        0,
        activePolygonHistoryIndex + 1
      );
      newHistory.push(newPoints);
      setActivePolygonHistory(newHistory);
      setActivePolygonHistoryIndex(newHistory.length - 1);
      setActivePolygonPoints(newPoints);
    } else if (drawingTool === "rectangle" || drawingTool === "circle") {
      if (!tempShapeStartPoint) {
        setTempShapeStartPoint(newPoint);
        setTempShapeCurrentPoint(newPoint); // Initialize current point for preview
      } else {
        // Second click for rectangle/circle
        let newShape: ShapeData | null = null;
        if (drawingTool === "rectangle") {
          const x = Math.min(tempShapeStartPoint.x, newPoint.x);
          const y = Math.min(tempShapeStartPoint.y, newPoint.y);
          const width = Math.abs(tempShapeStartPoint.x - newPoint.x);
          const height = Math.abs(tempShapeStartPoint.y - newPoint.y);
          newShape = {
            id: uuidv4(),
            type: "rectangle",
            x,
            y,
            width,
            height,
          };
        } else if (drawingTool === "circle") {
          const radius = Math.sqrt(
            Math.pow(newPoint.x - tempShapeStartPoint.x, 2) +
              Math.pow(newPoint.y - tempShapeStartPoint.y, 2)
          );
          newShape = {
            id: uuidv4(),
            type: "circle",
            x: tempShapeStartPoint.x,
            y: tempShapeStartPoint.y,
            radius,
          };
        }
        if (newShape) {
          setCurrentFrameShapes((prevShapes) => [...prevShapes, newShape!]);
        }
        setTempShapeStartPoint(null); // Clear temp points after completing shape
        setTempShapeCurrentPoint(null);
      }
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleStageMouseMove = (e: any) => {
    if (
      !isDrawingMode ||
      !tempShapeStartPoint ||
      (drawingTool !== "rectangle" && drawingTool !== "circle")
    )
      return;

    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    if (pointerPosition) {
      setTempShapeCurrentPoint({ x: pointerPosition.x, y: pointerPosition.y });
    }
  };

  const handleUndoPolygon = () => {
    if (activePolygonHistoryIndex > 0) {
      const newIndex = activePolygonHistoryIndex - 1;
      setActivePolygonHistoryIndex(newIndex);
      setActivePolygonPoints(activePolygonHistory[newIndex]);
    }
  };

  const handleRedoPolygon = () => {
    if (activePolygonHistoryIndex < activePolygonHistory.length - 1) {
      const newIndex = activePolygonHistoryIndex + 1;
      setActivePolygonHistoryIndex(newIndex);
      setActivePolygonPoints(activePolygonHistory[newIndex]);
    }
  };

  const handleClearDrawing = () => {
    setCurrentFrameShapes([]);
    setActivePolygonPoints([]);
    setActivePolygonHistory([[]]); // Reset history
    setActivePolygonHistoryIndex(0); // Reset history index
    setTempShapeStartPoint(null);
    setTempShapeCurrentPoint(null);
  };

  const handleClosePolygon = () => {
    if (activePolygonPoints.length >= 3) {
      // Need at least 3 points to close a polygon
      const closedPolygon: PolygonShape = {
        id: uuidv4(),
        type: "polygon",
        points: [...activePolygonPoints],
        isClosed: true,
      };
      setCurrentFrameShapes((prevShapes) => [...prevShapes, closedPolygon]);
      setActivePolygonPoints([]); // Clear active polygon after closing
      setActivePolygonHistory([[]]); // Reset history
      setActivePolygonHistoryIndex(0); // Reset history index
    }
  };

  // Reset temporary drawing states when tool changes
  useEffect(() => {
    setTempShapeStartPoint(null);
    setTempShapeCurrentPoint(null);
    // If switching from polygon, finalize it
    if (activePolygonPoints.length > 0 && drawingTool !== "polygon") {
      const finalizedPolygon: PolygonShape = {
        id: uuidv4(),
        type: "polygon",
        points: [...activePolygonPoints],
        isClosed: false, // Saved as open if not explicitly closed
      };
      setCurrentFrameShapes((prevShapes) => [...prevShapes, finalizedPolygon]);
      setActivePolygonPoints([]);
      setActivePolygonHistory([[]]); // Reset history
      setActivePolygonHistoryIndex(0); // Reset history index
    }
  }, [drawingTool, activePolygonPoints, setCurrentFrameShapes]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <Card className="w-full max-w-4xl shadow-lg">
        <CardHeader>
          <CardTitle>Video Frame Editor</CardTitle>
          <p className="text-sm text-gray-500">
            Load a video, navigate frame by frame, and draw polygons,
            rectangles, or circles on the current frame.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center space-y-4">
            {/* Hidden video element used for frame extraction */}
            <video
              ref={videoRef}
              src="/placeholder.mp4"
              preload="auto"
              muted
              crossOrigin="anonymous"
              className="hidden"
            >
              Your browser does not support the video tag.
            </video>

            {/* Canvas for drawing video frames */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Konva Stage for displaying image and drawing */}
            {isLoadingVideo ? (
              <div className="w-full h-96 bg-gray-200 flex items-center justify-center rounded-lg text-gray-500">
                Loading video...
              </div>
            ) : currentFrameImage &&
              videoDimensions.width > 0 &&
              videoDimensions.height > 0 ? (
              <KonvaElements
                width={videoDimensions.width}
                height={videoDimensions.height}
                currentFrameImage={currentFrameImage}
                currentFrameShapes={currentFrameShapes}
                activePolygonPoints={activePolygonPoints}
                tempShapeStartPoint={tempShapeStartPoint}
                tempShapeCurrentPoint={tempShapeCurrentPoint}
                drawingTool={drawingTool}
                onStageClick={handleStageClick}
                onStageMouseMove={handleStageMouseMove}
              />
            ) : (
              <div className="w-full h-96 bg-gray-200 flex items-center justify-center rounded-lg text-gray-500">
                Error loading video or video has no dimensions.
              </div>
            )}
          </div>

          {videoDuration > 0 && (
            <div className="w-full space-y-4">
              <div className="flex items-center gap-4">
                <Label htmlFor="frame-slider" className="min-w-[80px]">
                  Frame: {currentFrameNumber} /{" "}
                  {Math.floor(videoDuration * FPS)}
                </Label>
                <Slider
                  id="frame-slider"
                  min={0}
                  max={videoDuration}
                  step={1 / FPS}
                  value={[currentFrameTime]}
                  onValueChange={handleSliderChange}
                  className="flex-grow"
                />
              </div>
              <div className="flex justify-center gap-2">
                <Button
                  onClick={handlePrevFrame}
                  disabled={currentFrameTime <= 0}
                >
                  Previous Frame
                </Button>
                <Button
                  onClick={handleNextFrame}
                  disabled={currentFrameTime >= videoDuration}
                >
                  Next Frame
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Button
              onClick={() => setIsDrawingMode(!isDrawingMode)}
              variant={isDrawingMode ? "destructive" : "default"}
            >
              {isDrawingMode ? "Disable Drawing" : "Enable Drawing"}
            </Button>
            <Button
              onClick={handleClearDrawing}
              disabled={
                currentFrameShapes.length === 0 &&
                activePolygonPoints.length === 0
              }
            >
              Clear Drawing
            </Button>
            <Button
              onClick={handleClosePolygon}
              disabled={
                drawingTool !== "polygon" || activePolygonPoints.length < 3
              }
            >
              Close Polygon
            </Button>
          </div>

          {drawingTool === "polygon" && (
            <div className="flex justify-center gap-2 mt-2">
              <Button
                onClick={handleUndoPolygon}
                disabled={activePolygonHistoryIndex === 0}
              >
                Undo Point
              </Button>
              <Button
                onClick={handleRedoPolygon}
                disabled={
                  activePolygonHistoryIndex === activePolygonHistory.length - 1
                }
              >
                Redo Point
              </Button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-center gap-2 mt-4">
            <Button
              onClick={() => setDrawingTool("polygon")}
              variant={drawingTool === "polygon" ? "secondary" : "outline"}
            >
              Draw Polygon
            </Button>
            <Button
              onClick={() => setDrawingTool("rectangle")}
              variant={drawingTool === "rectangle" ? "secondary" : "outline"}
            >
              Draw Rectangle
            </Button>
            <Button
              onClick={() => setDrawingTool("circle")}
              variant={drawingTool === "circle" ? "secondary" : "outline"}
            >
              Draw Circle
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
