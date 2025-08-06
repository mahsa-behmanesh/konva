/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  const [isLoadingVideo, setIsLoadingVideo] = useState(true); // Start as true
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoPlaybackRate, setVideoPlaybackRate] = useState(1.0);

  const [toolMode, setToolMode] = useState<"draw" | "select">("draw");
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [copiedShapeData, setCopiedShapeData] = useState<ShapeData | null>(
    null
  );

  const [defaultShapeLabel, setDefaultShapeLabel] =
    useState<string>("New Shape");
  const [defaultShapeColor, setDefaultShapeColor] = useState<string>("#FF0000");

  const [drawingTool, setDrawingTool] = useState<
    "polygon" | "rectangle" | "circle"
  >("polygon");
  const [currentFrameShapes, setCurrentFrameShapes] = useState<ShapeData[]>([]);

  interface FrameHistoryEntry {
    history: ShapeData[][];
    currentIndex: number;
  }
  const [frameDrawingHistory, setFrameDrawingHistory] = useState<
    Map<number, FrameHistoryEntry>
  >(new Map());

  const [activePolygonPoints, setActivePolygonPoints] = useState<Point[]>([]);
  const [activePolygonHistory, setActivePolygonHistory] = useState<Point[][]>([
    [],
  ]);
  const [activePolygonHistoryIndex, setActivePolygonHistoryIndex] = useState(0);

  const [tempShapeStartPoint, setTempShapeStartPoint] = useState<Point | null>(
    null
  );
  const [tempShapeCurrentPoint, setTempShapeCurrentPoint] =
    useState<Point | null>(null);

  const FPS = 30;
  const currentFrameNumber = Math.floor(currentFrameTime * FPS);

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

  const saveCurrentFrameShapes = useCallback(() => {
    const shapesToSave = [...currentFrameShapes];
    if (activePolygonPoints.length > 0) {
      shapesToSave.push({
        id: uuidv4(),
        type: "polygon",
        points: activePolygonPoints,
        isClosed: false,
        label: defaultShapeLabel,
        color: defaultShapeColor,
      });
    }
    addFrameShapeSnapshot(shapesToSave);
  }, [
    currentFrameShapes,
    activePolygonPoints,
    addFrameShapeSnapshot,
    defaultShapeLabel,
    defaultShapeColor,
  ]);

  useEffect(() => {
    const frameEntry = frameDrawingHistory.get(currentFrameNumber);
    if (frameEntry) {
      setCurrentFrameShapes(frameEntry.history[frameEntry.currentIndex]);
    } else {
      setCurrentFrameShapes([]);
      addFrameShapeSnapshot([]);
    }
    setActivePolygonPoints([]);
    setActivePolygonHistory([[]]);
    setActivePolygonHistoryIndex(0);
    setTempShapeStartPoint(null);
    setTempShapeCurrentPoint(null);
    setSelectedShapeId(null);
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
          // Only set isLoadingVideo to false if duration is also known
          if (video.duration > 0) {
            setIsLoadingVideo(false);
            console.log(
              "drawFrameToCanvas: Video fully ready, isLoadingVideo set to false."
            );
          }
        }
      } else {
        console.log(
          "drawFrameToCanvas: Video not ready for drawing yet. ReadyState:",
          video.readyState,
          "Dimensions:",
          video.videoWidth,
          video.videoHeight
        );
      }
    }
  }, []);

  const animationFrameId = useRef<number | null>(null);

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
    drawFrameToCanvas();

    const newFrameNumber = Math.floor(newCurrentTime * FPS);

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

    animationFrameId.current = requestAnimationFrame(animate);
  }, [isPlaying, drawFrameToCanvas, FPS]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = videoPlaybackRate;
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
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying, animate, videoPlaybackRate]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      setCurrentFrameTime(0);
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      const checkVideoReady = () => {
        if (
          video.readyState >= 2 &&
          video.videoWidth > 0 &&
          video.duration > 0
        ) {
          drawFrameToCanvas();
          setVideoDuration(video.duration);
          setVideoDimensions({
            width: video.videoWidth,
            height: video.videoHeight,
          });
          setCurrentFrameTime(0); // Ensure it starts at 0
          setIsLoadingVideo(false);
          console.log(
            "checkVideoReady: Video fully ready and loaded. Duration:",
            video.duration,
            "Dimensions:",
            video.videoWidth,
            video.videoHeight
          );
        } else {
          console.log(
            "checkVideoReady: Video not fully ready yet. Scheduling retry. ReadyState:",
            video.readyState,
            "Dimensions:",
            video.videoWidth,
            video.videoHeight,
            "Duration:",
            video.duration
          );
          // Retry after a short delay if not fully ready
          setTimeout(checkVideoReady, 100);
        }
      };

      const handleLoadedMetadata = () => {
        console.log(
          "Event: loadedmetadata. Video Width:",
          video.videoWidth,
          "Video Height:",
          video.videoHeight,
          "Duration:",
          video.duration
        );
        checkVideoReady(); // Attempt to set ready state and draw
      };

      const handleLoadedData = () => {
        console.log("Event: loadeddata. Attempting to draw initial frame.");
        checkVideoReady(); // Attempt to set ready state and draw
      };

      const handleSeeked = () => {
        console.log(
          "Event: seeked. Drawing new frame. Current time:",
          video.currentTime
        );
        drawFrameToCanvas();
        const newFrameNumber = Math.floor(video.currentTime * FPS);
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
        setIsLoadingVideo(false); // Ensure loading state is cleared on error
      };

      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      video.addEventListener("loadeddata", handleLoadedData);
      video.addEventListener("seeked", handleSeeked);
      video.addEventListener("error", handleError);
      video.addEventListener("ended", handleEnded);

      // Initial check in case video is already loaded by the time component mounts
      checkVideoReady();

      return () => {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("loadeddata", handleLoadedData);
        video.removeEventListener("seeked", handleSeeked);
        video.removeEventListener("error", handleError);
        video.removeEventListener("ended", handleEnded);
      };
    }
  }, [drawFrameToCanvas, handleEnded, FPS]);

  const handlePlayPauseToggle = () => {
    saveCurrentFrameShapes();
    setIsPlaying((prev) => !prev);
  };

  const handleSliderChange = (value: number[]) => {
    if (isPlaying) return;
    const newTime = value[0];
    if (videoRef.current) {
      saveCurrentFrameShapes();
      videoRef.current.currentTime = newTime;
      setCurrentFrameTime(newTime);
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
    if (isPlaying) return;
    if (videoRef.current) {
      saveCurrentFrameShapes();
      const newTime = Math.min(videoDuration, currentFrameTime + 1 / FPS);
      videoRef.current.currentTime = newTime;
      setCurrentFrameTime(newTime);
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

  const handlePrevFrame = () => {
    if (isPlaying) return;
    if (videoRef.current) {
      saveCurrentFrameShapes();
      const newTime = Math.max(0, currentFrameTime - 1 / FPS);
      videoRef.current.currentTime = newTime;
      setCurrentFrameTime(newTime);
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

  const handleStageClick = (e: any) => {
    if (isPlaying) return;

    if (toolMode === "draw") {
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
          setTempShapeCurrentPoint(newPoint);
        } else {
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
              label: defaultShapeLabel,
              color: defaultShapeColor,
            };
          } else if (drawingTool === "circle") {
            // Corrected radius calculation: distance between start point and newPoint
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
              label: defaultShapeLabel,
              color: defaultShapeColor,
            };
          }
          if (newShape) {
            setCurrentFrameShapes((prevShapes) => {
              const updatedShapes = [...prevShapes, newShape!];
              addFrameShapeSnapshot(updatedShapes);
              return updatedShapes;
            });
          }
          setTempShapeStartPoint(null);
          setTempShapeCurrentPoint(null);
        }
      }
    } else if (toolMode === "select") {
      if (e.target === e.target.getStage()) {
        setSelectedShapeId(null);
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
      return;

    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    if (pointerPosition) {
      setTempShapeCurrentPoint({ x: pointerPosition.x, y: pointerPosition.y });
    }
  };

  const handleShapeClick = useCallback(
    (shapeId: string) => {
      if (toolMode === "select" && !isPlaying) {
        setSelectedShapeId(shapeId);
      }
    },
    [toolMode, isPlaying]
  );

  const handleShapeDragEnd = useCallback(
    (shapeId: string, newX: number, newY: number, type: ShapeData["type"]) => {
      if (isPlaying) return;

      setCurrentFrameShapes((prevShapes) => {
        const updatedShapes = prevShapes.map((shape) => {
          if (shape.id === shapeId) {
            if (type === "polygon") {
              const originalShape = prevShapes.find(
                (s) => s.id === shapeId
              ) as PolygonShape;
              if (!originalShape || originalShape.points.length === 0)
                return shape;

              const deltaX = newX - originalShape.points[0].x;
              const deltaY = newY - originalShape.points[0].y;

              return {
                ...shape,
                points: (shape as PolygonShape).points.map((p) => ({
                  x: p.x + deltaX,
                  y: p.y + deltaY,
                })),
              } as PolygonShape;
            } else if (type === "rectangle") {
              return { ...shape, x: newX, y: newY } as RectangleShape;
            } else if (type === "circle") {
              return { ...shape, x: newX, y: newY } as CircleShape;
            }
          }
          return shape;
        });
        addFrameShapeSnapshot(updatedShapes);
        return updatedShapes;
      });
    },
    [isPlaying, addFrameShapeSnapshot]
  );

  // New: Handle shape transform end (for rectangles and circles)
  const handleShapeTransformEnd = useCallback(
    (
      shapeId: string,
      newAttrs: {
        x: number;
        y: number;
        width?: number;
        height?: number;
        radius?: number;
      },
      type: ShapeData["type"]
    ) => {
      if (isPlaying) return;

      setCurrentFrameShapes((prevShapes) => {
        const updatedShapes = prevShapes.map((shape) => {
          if (shape.id === shapeId) {
            if (type === "rectangle") {
              return {
                ...shape,
                x: newAttrs.x,
                y: newAttrs.y,
                width: newAttrs.width,
                height: newAttrs.height,
              } as RectangleShape;
            } else if (type === "circle") {
              return {
                ...shape,
                x: newAttrs.x,
                y: newAttrs.y,
                radius: newAttrs.radius,
              } as CircleShape;
            }
          }
          return shape;
        });
        addFrameShapeSnapshot(updatedShapes);
        return updatedShapes;
      });
    },
    [isPlaying, addFrameShapeSnapshot]
  );

  // New: Handle polygon point drag end
  const handlePolygonPointDragEnd = useCallback(
    (polygonId: string, pointIndex: number, newX: number, newY: number) => {
      if (isPlaying) return;

      setCurrentFrameShapes((prevShapes) => {
        const updatedShapes = prevShapes.map((shape) => {
          if (shape.id === polygonId && shape.type === "polygon") {
            const newPoints = [...(shape as PolygonShape).points];
            newPoints[pointIndex] = { x: newX, y: newY };
            return { ...shape, points: newPoints } as PolygonShape;
          }
          return shape;
        });
        addFrameShapeSnapshot(updatedShapes);
        return updatedShapes;
      });
    },
    [isPlaying, addFrameShapeSnapshot]
  );

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
        setSelectedShapeId(null);
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
        setSelectedShapeId(null);
      }
      return newMap;
    });
  };

  const handleClearDrawing = () => {
    setCurrentFrameShapes([]);
    setActivePolygonPoints([]);
    setActivePolygonHistory([[]]);
    setActivePolygonHistoryIndex(0);
    setTempShapeStartPoint(null);
    setTempShapeCurrentPoint(null);
    addFrameShapeSnapshot([]);
    setSelectedShapeId(null);
  };

  const handleClosePolygon = () => {
    if (activePolygonPoints.length >= 3) {
      const closedPolygon: PolygonShape = {
        id: uuidv4(),
        type: "polygon",
        points: [...activePolygonPoints],
        isClosed: true,
        label: defaultShapeLabel,
        color: defaultShapeColor,
      };
      setCurrentFrameShapes((prevShapes) => {
        const updatedShapes = [...prevShapes, closedPolygon];
        addFrameShapeSnapshot(updatedShapes);
        return updatedShapes;
      });
      setActivePolygonPoints([]);
      setActivePolygonHistory([[]]);
      setActivePolygonHistoryIndex(0);
    }
  };

  const handleCopyShape = useCallback(() => {
    if (selectedShapeId) {
      const shapeToCopy = currentFrameShapes.find(
        (s) => s.id === selectedShapeId
      );
      if (shapeToCopy) {
        setCopiedShapeData(JSON.parse(JSON.stringify(shapeToCopy)));
        setDefaultShapeLabel(shapeToCopy.label);
        setDefaultShapeColor(shapeToCopy.color);
        console.log("Shape copied:", shapeToCopy);
      }
    }
  }, [selectedShapeId, currentFrameShapes]);

  const handlePasteShape = useCallback(() => {
    if (copiedShapeData) {
      const newShapeId = uuidv4();
      let pastedShape: ShapeData;

      if (copiedShapeData.type === "polygon") {
        pastedShape = {
          ...copiedShapeData,
          id: newShapeId,
          points: copiedShapeData.points.map((p) => ({
            x: p.x + 10,
            y: p.y + 10,
          })),
        } as PolygonShape;
      } else if (copiedShapeData.type === "rectangle") {
        pastedShape = {
          ...copiedShapeData,
          id: newShapeId,
          x: copiedShapeData.x + 10,
          y: copiedShapeData.y + 10,
        } as RectangleShape;
      } else if (copiedShapeData.type === "circle") {
        pastedShape = {
          ...copiedShapeData,
          id: newShapeId,
          x: copiedShapeData.x + 10,
          y: copiedShapeData.y + 10,
        } as CircleShape;
      } else {
        return;
      }

      setCurrentFrameShapes((prevShapes) => {
        const updatedShapes = [...prevShapes, pastedShape];
        addFrameShapeSnapshot(updatedShapes);
        return updatedShapes;
      });
      setSelectedShapeId(newShapeId);
      console.log("Shape pasted:", pastedShape);
    }
  }, [copiedShapeData, addFrameShapeSnapshot]);

  const handleDeleteShape = useCallback(() => {
    if (selectedShapeId) {
      setCurrentFrameShapes((prevShapes) => {
        const updatedShapes = prevShapes.filter(
          (shape) => shape.id !== selectedShapeId
        );
        addFrameShapeSnapshot(updatedShapes);
        return updatedShapes;
      });
      setSelectedShapeId(null); // Deselect after deleting
      setCopiedShapeData(null); // Clear copied shape if it was the one deleted
    }
  }, [selectedShapeId, addFrameShapeSnapshot]);

  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newLabel = e.target.value;
      if (selectedShapeId) {
        setCurrentFrameShapes((prevShapes) => {
          const updatedShapes = prevShapes.map((shape) =>
            shape.id === selectedShapeId ? { ...shape, label: newLabel } : shape
          );
          addFrameShapeSnapshot(updatedShapes);
          return updatedShapes;
        });
      }
    },
    [selectedShapeId, addFrameShapeSnapshot]
  );

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newColor = e.target.value;
      if (selectedShapeId) {
        setCurrentFrameShapes((prevShapes) => {
          const updatedShapes = prevShapes.map((shape) =>
            shape.id === selectedShapeId ? { ...shape, color: newColor } : shape
          );
          addFrameShapeSnapshot(updatedShapes);
          return updatedShapes;
        });
      }
    },
    [selectedShapeId, addFrameShapeSnapshot]
  );

  const handleSetDrawingTool = useCallback(
    (tool: "polygon" | "rectangle" | "circle") => {
      if (drawingTool !== tool) {
        setDefaultShapeLabel("New Shape");
        setDefaultShapeColor("#FF0000");
      }
      setDrawingTool(tool);
    },
    [drawingTool]
  );

  useEffect(() => {
    setTempShapeStartPoint(null);
    setTempShapeCurrentPoint(null);
    if (activePolygonPoints.length > 0 && drawingTool !== "polygon") {
      const finalizedPolygon: PolygonShape = {
        id: uuidv4(),
        type: "polygon",
        points: [...activePolygonPoints],
        isClosed: false,
        label: defaultShapeLabel,
        color: defaultShapeColor,
      };
      setCurrentFrameShapes((prevShapes) => {
        const updatedShapes = [...prevShapes, finalizedPolygon];
        addFrameShapeSnapshot(updatedShapes);
        return updatedShapes;
      });
      setActivePolygonPoints([]);
      setActivePolygonHistory([[]]);
      setActivePolygonHistoryIndex(0);
    }
  }, [
    drawingTool,
    activePolygonPoints,
    setCurrentFrameShapes,
    addFrameShapeSnapshot,
    defaultShapeLabel,
    defaultShapeColor,
  ]);

  useEffect(() => {
    if (isDrawingMode) {
      setToolMode("draw");
    } else {
      setToolMode("select");
      setTempShapeStartPoint(null);
      setTempShapeCurrentPoint(null);
      setActivePolygonPoints([]);
      setActivePolygonHistory([[]]);
      setActivePolygonHistoryIndex(0);
    }
  }, [isDrawingMode]);

  const currentFrameDrawingEntry = frameDrawingHistory.get(currentFrameNumber);
  const canUndoShape =
    currentFrameDrawingEntry && currentFrameDrawingEntry.currentIndex > 0;
  const canRedoShape =
    currentFrameDrawingEntry &&
    currentFrameDrawingEntry.currentIndex <
      currentFrameDrawingEntry.history.length - 1;

  const isSelectMode = toolMode === "select";
  const isDrawMode = toolMode === "draw";

  const selectedShape = currentFrameShapes.find(
    (s) => s.id === selectedShapeId
  );

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
                toolMode={toolMode}
                selectedShapeId={selectedShapeId}
                onStageClick={handleStageClick}
                onStageMouseMove={handleStageMouseMove}
                onShapeClick={handleShapeClick}
                onShapeDragEnd={handleShapeDragEnd}
                onShapeTransformEnd={handleShapeTransformEnd} // Pass new handler
                onPolygonPointDragEnd={handlePolygonPointDragEnd} // Pass new handler
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
                  disabled={isPlaying}
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
                  disabled={isPlaying}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Button
              onClick={() => setIsDrawingMode(!isDrawingMode)}
              variant={isDrawingMode ? "destructive" : "default"}
              disabled={isPlaying}
            >
              {isDrawingMode ? "Disable Drawing" : "Enable Drawing"}
            </Button>
            <Button
              onClick={handleClearDrawing}
              disabled={
                (currentFrameShapes.length === 0 &&
                  activePolygonPoints.length === 0) ||
                isPlaying ||
                isSelectMode
              }
            >
              Clear Drawing
            </Button>
            <Button
              onClick={handleClosePolygon}
              disabled={
                drawingTool !== "polygon" ||
                activePolygonPoints.length < 3 ||
                isPlaying ||
                isSelectMode
              }
            >
              Close Polygon
            </Button>
          </div>

          {isDrawMode && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border rounded-lg bg-gray-50">
                <div className="space-y-2">
                  <Label htmlFor="default-label">Default New Shape Label</Label>
                  <Input
                    id="default-label"
                    value={defaultShapeLabel}
                    onChange={(e) => setDefaultShapeLabel(e.target.value)}
                    disabled={isPlaying}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default-color">Default New Shape Color</Label>
                  <Input
                    id="default-color"
                    type="color"
                    value={defaultShapeColor}
                    onChange={(e) => setDefaultShapeColor(e.target.value)}
                    disabled={isPlaying}
                    className="h-10 w-full"
                  />
                </div>
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

              <div className="flex flex-col sm:flex-row justify-center gap-2 mt-4">
                <Button
                  onClick={() => handleSetDrawingTool("polygon")}
                  variant={drawingTool === "polygon" ? "secondary" : "outline"}
                  disabled={isPlaying}
                >
                  Draw Polygon
                </Button>
                <Button
                  onClick={() => handleSetDrawingTool("rectangle")}
                  variant={
                    drawingTool === "rectangle" ? "secondary" : "outline"
                  }
                  disabled={isPlaying}
                >
                  Draw Rectangle
                </Button>
                <Button
                  onClick={() => handleSetDrawingTool("circle")}
                  variant={drawingTool === "circle" ? "secondary" : "outline"}
                  disabled={isPlaying}
                >
                  Draw Circle
                </Button>
              </div>
            </>
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

          {isSelectMode && (
            <div className="flex flex-col gap-4 mt-4">
              <div className="flex justify-center gap-2">
                <Button
                  onClick={handleCopyShape}
                  disabled={!selectedShapeId || isPlaying}
                >
                  Copy Shape
                </Button>
                <Button
                  onClick={handlePasteShape}
                  disabled={!copiedShapeData || isPlaying}
                >
                  Paste Shape
                </Button>
                <Button
                  onClick={handleDeleteShape}
                  disabled={!selectedShapeId || isPlaying}
                >
                  Delete Selected Shape
                </Button>
              </div>

              {selectedShape && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border rounded-lg bg-gray-50">
                  <div className="space-y-2">
                    <Label htmlFor="shape-label">Selected Shape Label</Label>
                    <Input
                      id="shape-label"
                      value={selectedShape.label}
                      onChange={handleLabelChange}
                      disabled={isPlaying}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shape-color">Selected Shape Color</Label>
                    <Input
                      id="shape-color"
                      type="color"
                      value={selectedShape.color}
                      onChange={handleColorChange}
                      disabled={isPlaying}
                      className="h-10 w-full"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
