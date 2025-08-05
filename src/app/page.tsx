"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import dynamic from "next/dynamic";
import type {
  ShapeData,
  Point,
  PolygonShape,
  RectangleShape,
  CircleShape,
} from "@/types/drawing";
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
  const [tempRectStartPoint, setTempRectStartPoint] = useState<Point | null>(
    null
  ); // First click for rectangle
  const [tempCircleCenterPoint, setTempCircleCenterPoint] =
    useState<Point | null>(null); // First click for circle

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
    setTempRectStartPoint(null); // Clear temp rect point
    setTempCircleCenterPoint(null); // Clear temp circle point
  }, [currentFrameNumber, frameShapes]); // Removed saveCurrentFrameShapes from dependencies

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
      setActivePolygonPoints((prevPoints) => [...prevPoints, newPoint]);
    } else if (drawingTool === "rectangle") {
      if (!tempRectStartPoint) {
        setTempRectStartPoint(newPoint);
      } else {
        // Second click for rectangle
        const x = Math.min(tempRectStartPoint.x, newPoint.x);
        const y = Math.min(tempRectStartPoint.y, newPoint.y);
        const width = Math.abs(tempRectStartPoint.x - newPoint.x);
        const height = Math.abs(tempRectStartPoint.y - newPoint.y);

        const newRect: RectangleShape = {
          id: uuidv4(),
          type: "rectangle",
          x,
          y,
          width,
          height,
        };
        setCurrentFrameShapes((prevShapes) => [...prevShapes, newRect]);
        setTempRectStartPoint(null); // Clear temp point after completing shape
        setTempCircleCenterPoint(null); // Clear second temp point used for rect end
      }
    } else if (drawingTool === "circle") {
      if (!tempCircleCenterPoint) {
        setTempCircleCenterPoint(newPoint);
      } else {
        // Second click for circle (defines a point on circumference)
        const radius = Math.sqrt(
          Math.pow(newPoint.x - tempCircleCenterPoint.x, 2) +
            Math.pow(newPoint.y - tempCircleCenterPoint.y, 2)
        );

        const newCircle: CircleShape = {
          id: uuidv4(),
          type: "circle",
          x: tempCircleCenterPoint.x,
          y: tempCircleCenterPoint.y,
          radius,
        };
        setCurrentFrameShapes((prevShapes) => [...prevShapes, newCircle]);
        setTempCircleCenterPoint(null); // Clear temp point after completing shape
        setTempRectStartPoint(null); // Clear second temp point used for circle circumference
      }
    }
  };

  const handleClearDrawing = () => {
    setCurrentFrameShapes([]);
    setActivePolygonPoints([]);
    setTempRectStartPoint(null);
    setTempCircleCenterPoint(null);
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
    }
  };

  // Reset temporary drawing states when tool changes
  useEffect(() => {
    setTempRectStartPoint(null);
    setTempCircleCenterPoint(null);
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
    }
  }, [drawingTool, activePolygonPoints, setCurrentFrameShapes]); // Added activePolygonPoints and setCurrentFrameShapes to dependencies

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
          <div className="flex flex-col items-center space-y-4 h-max">
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
              <div className="w-full h-max">
                <KonvaElements
                  width={videoDimensions.width}
                  height={videoDimensions.height}
                  currentFrameImage={currentFrameImage}
                  currentFrameShapes={currentFrameShapes}
                  activePolygonPoints={activePolygonPoints}
                  tempRectStartPoint={tempRectStartPoint}
                  tempCircleCenterPoint={tempCircleCenterPoint}
                  onStageClick={handleStageClick}
                />
              </div>
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
