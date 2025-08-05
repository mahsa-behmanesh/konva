/* eslint-disable @typescript-eslint/no-explicit-any */
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
  const [isPlaying, setIsPlaying] = useState(false); // New state for video playback
  const [videoPlaybackRate, setVideoPlaybackRate] = useState(1.0); // New state for playback rate

  // New state for drawing tool selection
  const [drawingTool, setDrawingTool] = useState<
    "polygon" | "rectangle" | "circle"
  >("polygon");

  // State for completed shapes of the currently displayed frame
  const [currentFrameShapes, setCurrentFrameShapes] = useState<ShapeData[]>([]);

  // Global history for all shapes on each frame
  interface FrameHistoryEntry {
    history: ShapeData[][];
    currentIndex: number;
  }
  const [frameDrawingHistory, setFrameDrawingHistory] = useState<
    Map<number, FrameHistoryEntry>
  >(new Map());

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

  // Function to add a snapshot of currentFrameShapes to history
  const addFrameShapeSnapshot = useCallback(
    (shapes: ShapeData[]) => {
      setFrameDrawingHistory((prevMap) => {
        const newMap = new Map(prevMap);
        const currentEntry = newMap.get(currentFrameNumber) || {
          history: [[]],
          currentIndex: 0,
        };

        const newHistory = currentEntry.history.slice(
          0,
          currentEntry.currentIndex + 1
        );
        newHistory.push(shapes);

        newMap.set(currentFrameNumber, {
          history: newHistory,
          currentIndex: newHistory.length - 1,
        });
        return newMap;
      });
    },
    [currentFrameNumber]
  );

  // Helper to save current frame's shapes to the history
  const saveCurrentFrameShapes = useCallback(() => {
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
    addFrameShapeSnapshot(shapesToSave); // Use the new snapshot function
  }, [currentFrameShapes, activePolygonPoints, addFrameShapeSnapshot]);

  // Effect to load shapes when the current frame number changes (manual navigation)
  useEffect(() => {
    const frameEntry = frameDrawingHistory.get(currentFrameNumber);
    if (frameEntry) {
      setCurrentFrameShapes(frameEntry.history[frameEntry.currentIndex]);
    } else {
      // If no history exists for this frame, initialize it with an empty state
      // This ensures that when you manually navigate to a new frame, it has a history to record to.
      setCurrentFrameShapes([]);
      addFrameShapeSnapshot([]);
    }
    setActivePolygonPoints([]); // Clear active polygon when changing frames
    setActivePolygonHistory([[]]); // Reset history
    setActivePolygonHistoryIndex(0); // Reset history index
    setTempShapeStartPoint(null); // Clear temp shape points
    setTempShapeCurrentPoint(null); // Clear temp shape points
  }, [currentFrameNumber, frameDrawingHistory, addFrameShapeSnapshot]);

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
          // console.log("Frame drawn to canvas. Dimensions:", video.videoWidth, video.videoHeight)
        }
      } else {
        // console.log(
        //   "Video not ready for drawing yet. ReadyState:",
        //   video.readyState,
        //   "Dimensions:",
        //   video.videoWidth,
        //   video.videoHeight,
        // )
      }
    }
  }, []);

  // Ref for the animation frame ID
  const animationFrameId = useRef<number | null>(null);

  // Animation loop for smooth playback
  const animate = useCallback(() => {
    if (!videoRef.current || !isPlaying) {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
      return;
    }

    const newCurrentTime = videoRef.current.currentTime;
    setCurrentFrameTime(newCurrentTime);
    drawFrameToCanvas(); // Draw the current video frame

    // Update currentFrameShapes based on the new frame number during playback
    const newFrameNumber = Math.floor(newCurrentTime * FPS);

    setFrameDrawingHistory((prevMap) => {
      const newMap = new Map(prevMap);
      let frameEntry = newMap.get(newFrameNumber);

      if (!frameEntry) {
        // If no history exists for this frame, initialize it with an empty state
        frameEntry = { history: [[]], currentIndex: 0 };
        newMap.set(newFrameNumber, frameEntry);
      }

      // Now, use the potentially new or updated frameEntry to set currentFrameShapes
      setCurrentFrameShapes(frameEntry.history[frameEntry.currentIndex]);
      return newMap;
    });

    animationFrameId.current = requestAnimationFrame(animate);
  }, [isPlaying, drawFrameToCanvas, FPS]);

  // Effect to start/stop the animation loop and apply playback rate
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = videoPlaybackRate; // Apply playback rate
      if (isPlaying) {
        video.play();
        animationFrameId.current = requestAnimationFrame(animate);
      } else {
        video.pause();
        if (animationFrameId.current) {
          cancelAnimationFrame(animationFrameId.current);
          animationFrameId.current = null;
        }
      }
    }
    // Cleanup on unmount
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying, animate, videoPlaybackRate]); // Added videoPlaybackRate to dependencies

  // New: Handle video ending
  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0; // Optionally reset to beginning
      setCurrentFrameTime(0);
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
        // When manually seeking, also update currentFrameShapes
        const newFrameNumber = Math.floor(videoRef.current!.currentTime * FPS);
        setFrameDrawingHistory((prevMap) => {
          const newMap = new Map(prevMap);
          let frameEntry = newMap.get(newFrameNumber);
          if (!frameEntry) {
            frameEntry = { history: [[]], currentIndex: 0 };
            newMap.set(newFrameNumber, frameEntry);
          }
          setCurrentFrameShapes(frameEntry.history[frameEntry.currentIndex]);
          return newMap;
        });
      };

      const handleError = (e: Event) => {
        console.error("Video error:", video.error);
        setIsLoadingVideo(false);
      };

      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      video.addEventListener("loadeddata", handleLoadedData);
      video.addEventListener("seeked", handleSeeked);
      video.addEventListener("error", handleError);
      video.addEventListener("ended", handleEnded); // New listener

      return () => {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("loadeddata", handleLoadedData);
        video.removeEventListener("seeked", handleSeeked);
        video.removeEventListener("error", handleError);
        video.removeEventListener("ended", handleEnded); // Cleanup
      };
    }
  }, [drawFrameToCanvas, handleEnded, FPS]); // Added FPS to dependencies for handleSeeked

  // New: Unified play/pause toggle handler
  const handlePlayPauseToggle = () => {
    saveCurrentFrameShapes(); // Save current frame's shapes before changing playback state
    setIsPlaying((prev) => !prev);
  };

  const handleSliderChange = (value: number[]) => {
    if (isPlaying) return; // Prevent manual seek during playback
    const newTime = value[0];
    if (videoRef.current) {
      saveCurrentFrameShapes(); // Save current frame's shapes before changing frame
      videoRef.current.currentTime = newTime;
      setCurrentFrameTime(newTime);
      // Manually trigger frame and shape update for slider changes
      const newFrameNumber = Math.floor(newTime * FPS);
      setFrameDrawingHistory((prevMap) => {
        const newMap = new Map(prevMap);
        let frameEntry = newMap.get(newFrameNumber);
        if (!frameEntry) {
          frameEntry = { history: [[]], currentIndex: 0 };
          newMap.set(newFrameNumber, frameEntry);
        }
        setCurrentFrameShapes(frameEntry.history[frameEntry.currentIndex]);
        return newMap;
      });
      drawFrameToCanvas();
    }
  };

  const handleNextFrame = () => {
    if (isPlaying) return; // Prevent manual seek during playback
    if (videoRef.current) {
      saveCurrentFrameShapes(); // Save current frame's shapes before changing frame
      const newTime = Math.min(videoDuration, currentFrameTime + 1 / FPS);
      videoRef.current.currentTime = newTime;
      setCurrentFrameTime(newTime);
    }
  };

  const handlePrevFrame = () => {
    if (isPlaying) return; // Prevent manual seek during playback
    if (videoRef.current) {
      saveCurrentFrameShapes(); // Save current frame's shapes before changing frame
      const newTime = Math.max(0, currentFrameTime - 1 / FPS);
      videoRef.current.currentTime = newTime;
      setCurrentFrameTime(newTime);
    }
  };

  const handleStageClick = (e: any) => {
    if (!isDrawingMode || isPlaying) return; // Disable drawing during playback

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
              Math.pow(newPoint.y - tempShapeCurrentPoint!.y, 2) // Use tempShapeCurrentPoint for radius calculation
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
          setCurrentFrameShapes((prevShapes) => {
            const updatedShapes = [...prevShapes, newShape!];
            addFrameShapeSnapshot(updatedShapes); // Add snapshot after completing shape
            return updatedShapes;
          });
        }
        setTempShapeStartPoint(null); // Clear temp points after completing shape
        setTempShapeCurrentPoint(null);
      }
    }
  };

  const handleStageMouseMove = (e: any) => {
    if (
      !isDrawingMode ||
      !tempShapeStartPoint ||
      (drawingTool !== "rectangle" && drawingTool !== "circle") ||
      isPlaying
    )
      return; // Disable during playback

    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    if (pointerPosition) {
      setTempShapeCurrentPoint({ x: pointerPosition.x, y: pointerPosition.y });
    }
  };

  // Undo/Redo for active polygon points (while drawing)
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

  // Undo/Redo for completed shapes on the current frame
  const handleUndoShapeAction = () => {
    setFrameDrawingHistory((prevMap) => {
      const newMap = new Map(prevMap);
      const currentEntry = newMap.get(currentFrameNumber);
      if (currentEntry && currentEntry.currentIndex > 0) {
        const newIndex = currentEntry.currentIndex - 1;
        newMap.set(currentFrameNumber, {
          ...currentEntry,
          currentIndex: newIndex,
        });
        setCurrentFrameShapes(currentEntry.history[newIndex]);
      }
      return newMap;
    });
  };

  const handleRedoShapeAction = () => {
    setFrameDrawingHistory((prevMap) => {
      const newMap = new Map(prevMap);
      const currentEntry = newMap.get(currentFrameNumber);
      if (
        currentEntry &&
        currentEntry.currentIndex < currentEntry.history.length - 1
      ) {
        const newIndex = currentEntry.currentIndex + 1;
        newMap.set(currentFrameNumber, {
          ...currentEntry,
          currentIndex: newIndex,
        });
        setCurrentFrameShapes(currentEntry.history[newIndex]);
      }
      return newMap;
    });
  };

  const handleClearDrawing = () => {
    setCurrentFrameShapes([]);
    setActivePolygonPoints([]);
    setActivePolygonHistory([[]]); // Reset history
    setActivePolygonHistoryIndex(0); // Reset history index
    setTempShapeStartPoint(null);
    setTempShapeCurrentPoint(null);
    addFrameShapeSnapshot([]); // Add snapshot of empty shapes
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
      setCurrentFrameShapes((prevShapes) => {
        const updatedShapes = [...prevShapes, closedPolygon];
        addFrameShapeSnapshot(updatedShapes); // Add snapshot after closing polygon
        return updatedShapes;
      });
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
      setCurrentFrameShapes((prevShapes) => {
        const updatedShapes = [...prevShapes, finalizedPolygon];
        addFrameShapeSnapshot(updatedShapes); // Add snapshot when switching tool with active polygon
        return updatedShapes;
      });
      setActivePolygonPoints([]);
      setActivePolygonHistory([[]]); // Reset history
      setActivePolygonHistoryIndex(0); // Reset history index
    }
  }, [
    drawingTool,
    activePolygonPoints,
    setCurrentFrameShapes,
    addFrameShapeSnapshot,
  ]);

  const currentFrameDrawingEntry = frameDrawingHistory.get(currentFrameNumber);
  const canUndoShape =
    currentFrameDrawingEntry && currentFrameDrawingEntry.currentIndex > 0;
  const canRedoShape =
    currentFrameDrawingEntry &&
    currentFrameDrawingEntry.currentIndex <
      currentFrameDrawingEntry.history.length - 1;

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
                  disabled={isPlaying} // Disable slider during playback
                />
              </div>
              <div className="flex justify-center gap-2">
                <Button
                  onClick={handlePrevFrame}
                  disabled={currentFrameTime <= 0 || isPlaying}
                >
                  Previous Frame
                </Button>
                <Button onClick={handlePlayPauseToggle}>
                  {isPlaying ? "Pause Video" : "Play Video"}
                </Button>
                <Button
                  onClick={handleNextFrame}
                  disabled={currentFrameTime >= videoDuration || isPlaying}
                >
                  Next Frame
                </Button>
              </div>
              <div className="flex items-center gap-4">
                <Label htmlFor="playback-rate-slider" className="min-w-[120px]">
                  Playback Speed: {videoPlaybackRate.toFixed(1)}x
                </Label>
                <Slider
                  id="playback-rate-slider"
                  min={0.1}
                  max={1.0}
                  step={0.1}
                  value={[videoPlaybackRate]}
                  onValueChange={(value) => setVideoPlaybackRate(value[0])}
                  className="flex-grow"
                  disabled={isPlaying} // Optionally disable during playback if you want to prevent changes mid-play
                />
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Button
              onClick={() => setIsDrawingMode(!isDrawingMode)}
              variant={isDrawingMode ? "destructive" : "default"}
              disabled={isPlaying} // Disable drawing mode toggle during playback
            >
              {isDrawingMode ? "Disable Drawing" : "Enable Drawing"}
            </Button>
            <Button
              onClick={handleClearDrawing}
              disabled={
                (currentFrameShapes.length === 0 &&
                  activePolygonPoints.length === 0) ||
                isPlaying
              }
            >
              Clear Drawing
            </Button>
            <Button
              onClick={handleClosePolygon}
              disabled={
                drawingTool !== "polygon" ||
                activePolygonPoints.length < 3 ||
                isPlaying
              }
            >
              Close Polygon
            </Button>
          </div>

          {drawingTool === "polygon" && (
            <div className="flex justify-center gap-2 mt-2">
              <Button
                onClick={handleUndoPolygon}
                disabled={activePolygonHistoryIndex === 0 || isPlaying}
              >
                Undo Point
              </Button>
              <Button
                onClick={handleRedoPolygon}
                disabled={
                  activePolygonHistoryIndex ===
                    activePolygonHistory.length - 1 || isPlaying
                }
              >
                Redo Point
              </Button>
            </div>
          )}

          <div className="flex justify-center gap-2 mt-2">
            <Button
              onClick={handleUndoShapeAction}
              disabled={!canUndoShape || isPlaying}
            >
              Undo Shape Action
            </Button>
            <Button
              onClick={handleRedoShapeAction}
              disabled={!canRedoShape || isPlaying}
            >
              Redo Shape Action
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-2 mt-4">
            <Button
              onClick={() => setDrawingTool("polygon")}
              variant={drawingTool === "polygon" ? "secondary" : "outline"}
              disabled={isPlaying} // Disable tool selection during playback
            >
              Draw Polygon
            </Button>
            <Button
              onClick={() => setDrawingTool("rectangle")}
              variant={drawingTool === "rectangle" ? "secondary" : "outline"}
              disabled={isPlaying} // Disable tool selection during playback
            >
              Draw Rectangle
            </Button>
            <Button
              onClick={() => setDrawingTool("circle")}
              variant={drawingTool === "circle" ? "secondary" : "outline"}
              disabled={isPlaying} // Disable tool selection during playback
            >
              Draw Circle
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
