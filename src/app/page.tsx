"use client";

import type React from "react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { VideoCanvas } from "@/components/video-canvas";
import type { ShapeData, Point, Shape } from "@/types/drawing"; // Declare Shape here
import { v4 as uuidv4 } from "uuid";

export default function VideoFrameEditor() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Video state
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [videoFileName, setVideoFileName] = useState("");
  const [customFPS, setCustomFPS] = useState(30); // New state for custom FPS

  // Drawing state
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawingTool, setDrawingTool] = useState<
    "polygon" | "rectangle" | "circle"
  >("polygon");
  const [toolMode, setToolMode] = useState<"draw" | "select">("draw");
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [copiedShape, setCopiedShape] = useState<ShapeData | null>(null);

  // Shape properties
  const [defaultShapeLabel, setDefaultShapeLabel] = useState("New Shape");
  const [defaultShapeColor, setDefaultShapeColor] = useState("#FF0000");
  const [editingShapeLabel, setEditingShapeLabel] = useState("");
  const [editingShapeColor, setEditingShapeColor] = useState("");

  // Frame-based shape storage
  const [frameShapes, setFrameShapes] = useState<Map<number, ShapeData[]>>(
    new Map()
  );
  const [history, setHistory] = useState<Map<number, ShapeData[]>[]>([
    new Map(),
  ]); // Initial empty history
  const [historyIndex, setHistoryIndex] = useState(0);

  // Active polygon points and their history
  const [activePolygonPoints, setActivePolygonPoints] = useState<Point[]>([]);
  const [activePolygonHistory, setActivePolygonHistory] = useState<Point[][]>([
    [],
  ]);
  const [activePolygonHistoryIndex, setActivePolygonHistoryIndex] = useState(0);

  const [tempShapeStart, setTempShapeStart] = useState<Point | null>(null);
  const [tempShapeCurrent, setTempShapeCurrent] = useState<Point | null>(null);

  const FPS = customFPS; // Use customFPS for calculations
  const currentFrameNumber = useMemo(
    () => Math.floor(currentTime * FPS),
    [currentTime, FPS]
  );
  const totalFrames = useMemo(
    () => Math.floor(videoDuration * FPS),
    [videoDuration, FPS]
  );
  const currentFrameShapes = frameShapes.get(currentFrameNumber) || [];

  // This is the ONLY function that should directly call setFrameShapes and manage history
  const setFrameShapesAndCommit = useCallback(
    (newShapesMap: Map<number, ShapeData[]>) => {
      setFrameShapes(newShapesMap); // Update the main state

      // Deep copy the newShapesMap before adding to history
      const newMapCopy = new Map<number, Shape[]>();
      newShapesMap.forEach((value, key) => {
        newMapCopy.set(key, [...value]); // Deep copy arrays of shapes
      });

      setHistory((prevHistory) => {
        const newHistory = prevHistory.slice(0, historyIndex + 1);
        return [...newHistory, newMapCopy];
      });
      setHistoryIndex((prevIndex) => prevIndex + 1);
    },
    [historyIndex]
  );

  // Function to update shapes on the current frame without committing immediately
  const updateCurrentFrameShapes = useCallback(
    (shapes: ShapeData[]) => {
      setFrameShapes((prev) => {
        const newMap = new Map(prev);
        newMap.set(currentFrameNumber, shapes);
        return newMap;
      });
    },
    [currentFrameNumber]
  );

  // New function to update active polygon points and commit to its history
  const updateActivePolygonPointsAndCommit = useCallback(
    (newPoints: Point[]) => {
      setActivePolygonPoints(newPoints);
      setActivePolygonHistory((prevHistory) => {
        const newHistory = prevHistory.slice(0, activePolygonHistoryIndex + 1);
        return [...newHistory, newPoints];
      });
      setActivePolygonHistoryIndex((prevIndex) => prevIndex + 1);
    },
    [activePolygonHistoryIndex]
  );

  // Video upload handler
  const handleVideoUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        if (videoSrc) {
          URL.revokeObjectURL(videoSrc);
        }
        const newURL = URL.createObjectURL(file);
        setVideoSrc(newURL);
        setVideoFileName(file.name);
        setCurrentTime(0);
        setVideoDuration(0);
        setIsPlaying(false);
        // Reset frameShapes and history on new video upload
        const initialMap = new Map();
        setFrameShapes(initialMap);
        setHistory([initialMap]);
        setHistoryIndex(0);

        setActivePolygonPoints([]);
        setActivePolygonHistory([[]]); // Reset active polygon history
        setActivePolygonHistoryIndex(0); // Reset active polygon history index

        setSelectedShapeId(null);
      }
    },
    [videoSrc]
  );

  // Video event handlers
  const handleVideoLoadedData = useCallback(() => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
      setCurrentTime(0);
    }
  }, []);

  const handleVideoTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Video controls
  const handlePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const handleSeek = useCallback((value: number[]) => {
    const newTime = value[0];
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, []);

  const handleNextFrame = useCallback(() => {
    if (videoRef.current && !isPlaying) {
      const newTime = Math.min(videoDuration, currentTime + 1 / FPS);
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, [currentTime, videoDuration, FPS, isPlaying]);

  const handlePrevFrame = useCallback(() => {
    if (videoRef.current && !isPlaying) {
      const newTime = Math.max(0, currentTime - 1 / FPS);
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, [currentTime, FPS, isPlaying]);

  // Shape management
  const handleShapeComplete = useCallback(
    (shape: ShapeData) => {
      const newShapes = [...currentFrameShapes, shape];
      const newMap = new Map(frameShapes);
      newMap.set(currentFrameNumber, newShapes);
      setFrameShapesAndCommit(newMap); // Commit
      setActivePolygonPoints([]);
      setTempShapeStart(null);
      setTempShapeCurrent(null);
    },
    [
      currentFrameShapes,
      frameShapes,
      currentFrameNumber,
      setFrameShapesAndCommit,
    ]
  );

  const handleShapeUpdate = useCallback(
    (shapeId: string, updates: Partial<ShapeData>) => {
      const shapesOnCurrentFrame = frameShapes.get(currentFrameNumber) || [];
      const updatedShapes = shapesOnCurrentFrame.map((shape) => {
        if (shape.id === shapeId) {
          return { ...shape, ...updates } as ShapeData;
        }
        return shape;
      });
      updateCurrentFrameShapes(updatedShapes); // Just update, no commit here
    },
    [frameShapes, currentFrameNumber, updateCurrentFrameShapes]
  );

  const handleShapeDelete = useCallback(() => {
    if (selectedShapeId) {
      const newShapes = currentFrameShapes.filter(
        (shape) => shape.id !== selectedShapeId
      );
      const newMap = new Map(frameShapes);
      newMap.set(currentFrameNumber, newShapes);
      setFrameShapesAndCommit(newMap); // Commit
      setSelectedShapeId(null);
    }
  }, [
    selectedShapeId,
    currentFrameShapes,
    frameShapes,
    currentFrameNumber,
    setFrameShapesAndCommit,
  ]);

  const handleShapeCopy = useCallback(() => {
    if (selectedShapeId) {
      const shapeToCopy = currentFrameShapes.find(
        (shape) => shape.id === selectedShapeId
      );
      if (shapeToCopy) {
        setCopiedShape(shapeToCopy);
      }
    }
  }, [selectedShapeId, currentFrameShapes]);

  const handleShapePaste = useCallback(() => {
    if (copiedShape) {
      const newShape: ShapeData = {
        ...copiedShape,
        id: uuidv4(),
        label: `${copiedShape.label} (Copy)`,
      };

      // Offset the pasted shape slightly
      if (newShape.type === "rectangle") {
        newShape.x += 20;
        newShape.y += 20;
      } else if (newShape.type === "circle") {
        newShape.x += 20;
        newShape.y += 20;
      } else if (newShape.type === "polygon") {
        newShape.points = newShape.points.map((p) => ({
          x: p.x + 20,
          y: p.y + 20,
        }));
      }

      const newShapes = [...currentFrameShapes, newShape];
      const newMap = new Map(frameShapes);
      newMap.set(currentFrameNumber, newShapes);
      setFrameShapesAndCommit(newMap); // Commit
      setSelectedShapeId(newShape.id);
    }
  }, [
    copiedShape,
    currentFrameShapes,
    frameShapes,
    currentFrameNumber,
    setFrameShapesAndCommit,
  ]);

  const handleClearDrawing = useCallback(() => {
    const newMap = new Map(frameShapes);
    newMap.set(currentFrameNumber, []);
    setFrameShapesAndCommit(newMap); // Commit
    setActivePolygonPoints([]);
    setTempShapeStart(null);
    setTempShapeCurrent(null);
  }, [frameShapes, currentFrameNumber, setFrameShapesAndCommit]);

  const handlePasteToPreviousFrames = useCallback(() => {
    if (!copiedShape || currentFrameNumber === 0) return;

    const newMap = new Map(frameShapes);
    for (let i = 0; i < currentFrameNumber; i++) {
      const shapesOnFrame = newMap.get(i) || [];
      const newShape: ShapeData = {
        ...copiedShape,
        id: uuidv4(),
        label: `${copiedShape.label} (Pasted Prev)`,
      };
      // Apply offset
      if (newShape.type === "rectangle") {
        newShape.x += 20;
        newShape.y += 20;
      } else if (newShape.type === "circle") {
        newShape.x += 20;
        newShape.y += 20;
      } else if (newShape.type === "polygon") {
        newShape.points = newShape.points.map((p) => ({
          x: p.x + 20,
          y: p.y + 20,
        }));
      }
      newMap.set(i, [...shapesOnFrame, newShape]);
    }
    setFrameShapesAndCommit(newMap); // Commit once after all changes
  }, [copiedShape, currentFrameNumber, frameShapes, setFrameShapesAndCommit]);

  const handleCopyToNextFrames = useCallback(() => {
    if (!copiedShape || currentFrameNumber >= totalFrames - 1) return;

    const newMap = new Map(frameShapes);
    for (let i = currentFrameNumber + 1; i < totalFrames; i++) {
      const shapesOnFrame = newMap.get(i) || [];
      const newShape: ShapeData = {
        ...copiedShape,
        id: uuidv4(),
        label: `${copiedShape.label} (Copied Next)`,
      };
      // Apply offset
      if (newShape.type === "rectangle") {
        newShape.x += 20;
        newShape.y += 20;
      } else if (newShape.type === "circle") {
        newShape.x += 20;
        newShape.y += 20;
      } else if (newShape.type === "polygon") {
        newShape.points = newShape.points.map((p) => ({
          x: p.x + 20,
          y: p.y + 20,
        }));
      }
      newMap.set(i, [...shapesOnFrame, newShape]);
    }
    setFrameShapesAndCommit(newMap); // Commit once after all changes
  }, [
    copiedShape,
    currentFrameNumber,
    totalFrames,
    frameShapes,
    setFrameShapesAndCommit,
  ]);

  // Undo/Redo functions for main frame history
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setFrameShapes(history[newIndex]); // Directly set frameShapes from history
      setHistoryIndex(newIndex);
      setSelectedShapeId(null); // Deselect shape on undo
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setFrameShapes(history[newIndex]); // Directly set frameShapes from history
      setHistoryIndex(newIndex);
      setSelectedShapeId(null); // Deselect shape on redo
    }
  }, [history, historyIndex]);

  // Undo/Redo functions for active polygon points
  const handlePolygonPointUndo = useCallback(() => {
    if (activePolygonHistoryIndex > 0) {
      const newIndex = activePolygonHistoryIndex - 1;
      setActivePolygonPoints(activePolygonHistory[newIndex]);
      setActivePolygonHistoryIndex(newIndex);
    }
  }, [activePolygonHistory, activePolygonHistoryIndex]);

  const handlePolygonPointRedo = useCallback(() => {
    if (activePolygonHistoryIndex < activePolygonHistory.length - 1) {
      const newIndex = activePolygonHistoryIndex + 1;
      setActivePolygonPoints(activePolygonHistory[newIndex]);
      setActivePolygonHistoryIndex(newIndex);
    }
  }, [activePolygonHistory, activePolygonHistoryIndex]);

  // Reset active polygon history when polygon is completed or drawing mode changes
  useEffect(() => {
    if (!isDrawingMode || drawingTool !== "polygon") {
      setActivePolygonHistory([[]]);
      setActivePolygonHistoryIndex(0);
    }
  }, [isDrawingMode, drawingTool]);

  // Set editing values when shape is selected
  useEffect(() => {
    const selectedShape = currentFrameShapes.find(
      (s) => s.id === selectedShapeId
    );
    if (selectedShape) {
      setEditingShapeLabel(selectedShape.label);
      setEditingShapeColor(selectedShape.color);
    } else {
      setEditingShapeLabel("");
      setEditingShapeColor("");
    }
  }, [selectedShapeId, currentFrameShapes]);

  // Drawing mode effect
  useEffect(() => {
    if (isDrawingMode) {
      setToolMode("draw");
    } else {
      setToolMode("select");
      setActivePolygonPoints([]);
      setTempShapeStart(null);
      setTempShapeCurrent(null);
    }
  }, [isDrawingMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          handlePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handlePrevFrame();
          break;
        case "ArrowRight":
          e.preventDefault();
          handleNextFrame();
          break;
        case "Delete":
        case "Backspace":
          if (selectedShapeId) {
            e.preventDefault();
            handleShapeDelete();
          }
          break;
        case "c":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleShapeCopy();
          }
          break;
        case "v":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleShapePaste();
          }
          break;
        case "z":
          if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
            e.preventDefault();
            if (
              isDrawingMode &&
              drawingTool === "polygon" &&
              activePolygonHistoryIndex > 0
            ) {
              handlePolygonPointUndo();
            } else {
              handleUndo();
            }
          }
          break;
        case "y":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (
              isDrawingMode &&
              drawingTool === "polygon" &&
              activePolygonHistoryIndex < activePolygonHistory.length - 1
            ) {
              handlePolygonPointRedo();
            } else {
              handleRedo();
            }
          }
          break;
        case "Z": // Shift + Ctrl/Cmd + Z for redo
          if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
            e.preventDefault();
            if (
              isDrawingMode &&
              drawingTool === "polygon" &&
              activePolygonHistoryIndex < activePolygonHistory.length - 1
            ) {
              handlePolygonPointRedo();
            } else {
              handleRedo();
            }
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handlePlayPause,
    handlePrevFrame,
    handleNextFrame,
    handleShapeDelete,
    handleShapeCopy,
    handleShapePaste,
    handleUndo,
    handleRedo,
    handlePolygonPointUndo,
    handlePolygonPointRedo,
    selectedShapeId,
    isDrawingMode,
    drawingTool,
    activePolygonHistoryIndex,
    activePolygonHistory.length,
  ]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (videoSrc) {
        URL.revokeObjectURL(videoSrc);
      }
    };
  }, [videoSrc]);

  const handleCommitChanges = useCallback(() => {
    setFrameShapesAndCommit(frameShapes);
  }, [frameShapes, setFrameShapesAndCommit]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <Card className="w-full max-w-6xl shadow-lg">
        <CardHeader>
          <CardTitle>Video Frame Editor</CardTitle>
          <p className="text-sm text-gray-500">
            Upload a video to play, pause, and draw shapes on each frame.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Video Upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleVideoUpload}
            className="hidden"
          />

          <div className="space-y-2">
            <Label>Upload Video</Label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
            >
              <div className="text-center">
                <p className="text-gray-600 text-lg mb-2">
                  Click to upload a video
                </p>
                <p className="text-gray-500 text-sm">
                  {videoSrc
                    ? `Video uploaded: ${videoFileName}`
                    : "Please upload a video"}
                </p>
              </div>
            </div>
          </div>

          {/* Video Player */}
          {videoSrc && (
            <div className="space-y-4">
              <VideoCanvas
                videoSrc={videoSrc}
                //@ts-expect-error ok :)
                videoRef={videoRef}
                isPlaying={isPlaying}
                currentFrameShapes={currentFrameShapes}
                activePolygonPoints={activePolygonPoints}
                tempShapeStart={tempShapeStart}
                tempShapeCurrent={tempShapeCurrent}
                drawingTool={drawingTool}
                toolMode={toolMode}
                selectedShapeId={selectedShapeId}
                defaultShapeLabel={defaultShapeLabel}
                defaultShapeColor={defaultShapeColor}
                onVideoLoadedData={handleVideoLoadedData}
                onVideoTimeUpdate={handleVideoTimeUpdate}
                onVideoEnded={handleVideoEnded}
                onShapeComplete={handleShapeComplete}
                onShapeSelect={setSelectedShapeId}
                onShapeUpdate={handleShapeUpdate}
                onActivePolygonUpdate={updateActivePolygonPointsAndCommit} // Use the new commit function
                onTempShapeUpdate={(start, current) => {
                  setTempShapeStart(start);
                  setTempShapeCurrent(current);
                }}
                onCommitChanges={handleCommitChanges}
              />

              {/* Video Controls */}
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Label className="min-w-[100px]">
                    Frame: {currentFrameNumber} / {totalFrames}
                  </Label>
                  <Slider
                    min={0}
                    max={videoDuration}
                    step={1 / FPS}
                    value={[currentTime]}
                    onValueChange={handleSeek}
                    className="flex-grow"
                    disabled={isPlaying}
                  />
                </div>

                <div className="flex justify-center gap-2">
                  <Button
                    onClick={handlePrevFrame}
                    disabled={currentTime <= 0 || isPlaying}
                  >
                    Previous Frame
                  </Button>
                  <Button onClick={handlePlayPause}>
                    {isPlaying ? "Pause" : "Play"}
                  </Button>
                  <Button
                    onClick={handleNextFrame}
                    disabled={currentTime >= videoDuration || isPlaying}
                  >
                    Next Frame
                  </Button>
                </div>

                <div className="flex items-center gap-4">
                  <Label className="min-w-[120px]">
                    Speed: {playbackRate.toFixed(1)}x
                  </Label>
                  <Slider
                    min={0.1}
                    max={2.0}
                    step={0.1}
                    value={[playbackRate]}
                    onValueChange={(value) => {
                      setPlaybackRate(value[0]);
                      if (videoRef.current) {
                        videoRef.current.playbackRate = value[0];
                      }
                    }}
                    className="flex-grow"
                  />
                </div>
                {/* Custom FPS Input */}
                <div className="flex items-center gap-4">
                  <Label htmlFor="custom-fps" className="min-w-[120px]">
                    Custom FPS
                  </Label>
                  <Input
                    id="custom-fps"
                    type="number"
                    min="1"
                    max="60"
                    value={customFPS}
                    onChange={(e) =>
                      setCustomFPS(Number.parseInt(e.target.value) || 1)
                    }
                    className="w-24"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Drawing Controls */}
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setIsDrawingMode(!isDrawingMode)}
                variant={isDrawingMode ? "destructive" : "default"}
              >
                {isDrawingMode ? "Disable Drawing" : "Enable Drawing"}
              </Button>
              <Button
                onClick={handleClearDrawing}
                disabled={currentFrameShapes.length === 0}
              >
                Clear Frame
              </Button>
              <Button onClick={handleShapeCopy} disabled={!selectedShapeId}>
                Copy Shape
              </Button>
              <Button onClick={handleShapePaste} disabled={!copiedShape}>
                Paste Shape
              </Button>
              <Button onClick={handleShapeDelete} disabled={!selectedShapeId}>
                Delete Shape
              </Button>
              <Button
                onClick={handlePasteToPreviousFrames}
                disabled={!copiedShape || currentFrameNumber === 0}
              >
                Paste to Previous Frames
              </Button>
              <Button
                onClick={handleCopyToNextFrames}
                disabled={!copiedShape || currentFrameNumber >= totalFrames - 1}
              >
                Copy to Next Frames
              </Button>
              <Button onClick={handleUndo} disabled={historyIndex === 0}>
                Undo
              </Button>
              <Button
                onClick={handleRedo}
                disabled={historyIndex === history.length - 1}
              >
                Redo
              </Button>
            </div>

            {isDrawingMode && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    onClick={() => setDrawingTool("polygon")}
                    variant={
                      drawingTool === "polygon" ? "secondary" : "outline"
                    }
                  >
                    Polygon
                  </Button>
                  <Button
                    onClick={() => setDrawingTool("rectangle")}
                    variant={
                      drawingTool === "rectangle" ? "secondary" : "outline"
                    }
                  >
                    Rectangle
                  </Button>
                  <Button
                    onClick={() => setDrawingTool("circle")}
                    variant={drawingTool === "circle" ? "secondary" : "outline"}
                  >
                    Circle
                  </Button>
                </div>

                {drawingTool === "polygon" && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={handlePolygonPointUndo}
                      disabled={
                        activePolygonHistoryIndex === 0 ||
                        activePolygonPoints.length === 0
                      }
                    >
                      Undo Point
                    </Button>
                    <Button
                      onClick={handlePolygonPointRedo}
                      disabled={
                        activePolygonHistoryIndex ===
                        activePolygonHistory.length - 1
                      }
                    >
                      Redo Point
                    </Button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border rounded-lg bg-gray-50">
                  <div className="space-y-2">
                    <Label>Default Shape Label</Label>
                    <Input
                      value={defaultShapeLabel}
                      onChange={(e) => setDefaultShapeLabel(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Default Shape Color</Label>
                    <Input
                      type="color"
                      value={defaultShapeColor}
                      onChange={(e) => setDefaultShapeColor(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {selectedShapeId && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border rounded-lg bg-blue-50">
                <div className="space-y-2">
                  <Label>Selected Shape Label</Label>
                  <Input
                    value={editingShapeLabel}
                    onChange={(e) => {
                      setEditingShapeLabel(e.target.value);
                      if (selectedShapeId) {
                        handleShapeUpdate(selectedShapeId, {
                          label: e.target.value,
                        });
                        // Commit immediately for label/color changes
                        const newMap = new Map(frameShapes);
                        const shapesOnCurrentFrame =
                          newMap.get(currentFrameNumber) || [];
                        const updatedShapes = shapesOnCurrentFrame.map(
                          (shape) => {
                            if (shape.id === selectedShapeId) {
                              return {
                                ...shape,
                                label: e.target.value,
                              } as ShapeData;
                            }
                            return shape;
                          }
                        );
                        newMap.set(currentFrameNumber, updatedShapes);
                        setFrameShapesAndCommit(newMap);
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Selected Shape Color</Label>
                  <Input
                    type="color"
                    value={editingShapeColor}
                    onChange={(e) => {
                      setEditingShapeColor(e.target.value);
                      if (selectedShapeId) {
                        handleShapeUpdate(selectedShapeId, {
                          color: e.target.value,
                        });
                        // Commit immediately for label/color changes
                        const newMap = new Map(frameShapes);
                        const shapesOnCurrentFrame =
                          newMap.get(currentFrameNumber) || [];
                        const updatedShapes = shapesOnCurrentFrame.map(
                          (shape) => {
                            if (shape.id === selectedShapeId) {
                              return {
                                ...shape,
                                color: e.target.value,
                              } as ShapeData;
                            }
                            return shape;
                          }
                        );
                        newMap.set(currentFrameNumber, updatedShapes);
                        setFrameShapesAndCommit(newMap);
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Keyboard Shortcuts Help */}
          {/* <div className="text-xs text-gray-500 p-3 bg-gray-50 rounded">
            <strong>Keyboard Shortcuts:</strong> Space = Play/Pause, ← → =
            Previous/Next Frame, Delete = Delete Shape, Ctrl+C = Copy Shape,
            Ctrl+V = Paste Shape, Ctrl+Z = Undo, Ctrl+Y / Ctrl+Shift+Z = Redo
          </div> */}
        </CardContent>
      </Card>
    </div>
  );
}
