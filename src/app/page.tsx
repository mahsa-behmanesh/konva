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
import { v4 as uuidv4 } from "uuid";

const KonvaElements = dynamic(() => import("@/components/konva-elements"), {
  ssr: false,
});
const FrameBar = dynamic(() => import("@/components/frame-bar"), {
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoPlaybackRate, setVideoPlaybackRate] = useState(1.0);
  const [videoFileURL, setVideoFileURL] = useState<string | null>(null);

  const [toolMode, setToolMode] = useState<"draw" | "select">("draw");
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [copiedShapeData, setCopiedShapeData] = useState<ShapeData | null>(
    null
  );

  const [defaultShapeLabel, setDefaultShapeLabel] =
    useState<string>("New Shape");
  const [defaultShapeColor, setDefaultShapeColor] = useState<string>("#FF0000");

  const [editingShapeLabel, setEditingShapeLabel] = useState<string>("");
  const [editingShapeColor, setEditingShapeColor] = useState<string>("");

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

  const [FPS, setFPS] = useState(30);
  const currentFrameNumber = Math.floor(currentFrameTime * FPS);
  const totalFrames = Math.floor(videoDuration * FPS);
  const [frameThumbnails, setFrameThumbnails] = useState<string[]>([]);

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

  const selectedShape = currentFrameShapes.find(
    (s) => s.id === selectedShapeId
  );
  useEffect(() => {
    if (selectedShape) {
      setEditingShapeLabel(selectedShape.label);
      setEditingShapeColor(selectedShape.color);
    } else {
      setEditingShapeLabel("");
      setEditingShapeColor("");
    }
  }, [selectedShape]);

  const drawFrameToCanvas = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      if (video.readyState >= 2 && video.videoWidth > 0) {
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

  const generateThumbnails = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
    if (!tempCtx) {
      console.error("Could not get canvas context.");
      return;
    }

    const THUMBNAIL_COUNT = totalFrames; // Maximum number of thumbnails
    const thumbnails: string[] = [];
    const originalTime = video.currentTime;
    video.pause();

    const THUMBNAIL_WIDTH = 100;
    const THUMBNAIL_HEIGHT = 100;
    tempCanvas.width = THUMBNAIL_WIDTH;
    tempCanvas.height = THUMBNAIL_HEIGHT;

    console.log(
      `Starting thumbnail generation for ${THUMBNAIL_COUNT} thumbnails...`
    );

    const thumbnailPromises = [];
    const timeStep = videoDuration / (THUMBNAIL_COUNT - 1 || 1); // Evenly distribute thumbnails

    for (let i = 0; i < THUMBNAIL_COUNT; i++) {
      const frameTime = i * timeStep;
      thumbnailPromises.push(
        new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);

            if (video.readyState >= 2) {
              tempCtx.drawImage(video, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
              thumbnails[i] = tempCanvas.toDataURL("image/jpeg", 0.7);
            } else {
              thumbnails[i] = "/placeholder.svg?height=100&width=100";
            }
            resolve();
          };
          video.addEventListener("seeked", onSeeked);
          video.currentTime = frameTime;
        })
      );
    }

    await Promise.all(thumbnailPromises);

    setFrameThumbnails(thumbnails);
    video.currentTime = originalTime;
    video.pause();
    console.log("Thumbnails generation complete. Total:", thumbnails.length);
  }, [videoDuration]);

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const newURL = URL.createObjectURL(file);
      setVideoFileURL(newURL);
      setIsLoadingVideo(true);
      setCurrentFrameImage(null);
      setVideoDuration(0);
      setCurrentFrameTime(0);
      setFrameThumbnails([]);
      setFrameDrawingHistory(new Map());
      setCurrentFrameShapes([]);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.autoplay = false;
    video.setAttribute("preload", "metadata");

    const handleLoadedData = () => {
      console.log("Event: loadeddata. Video is ready for drawing.");
      video.pause();
      drawFrameToCanvas();
      setVideoDuration(video.duration);
      setVideoDimensions({
        width: video.videoWidth,
        height: video.videoHeight,
      });
      setCurrentFrameTime(0);
      setIsLoadingVideo(false);

      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      debounceTimeoutRef.current = setTimeout(() => {
        generateThumbnails();
      }, 500);
    };

    const handleSeeked = () => {
      console.log(
        "Event: seeked. Drawing new frame. Current time:",
        video.currentTime
      );
      drawFrameToCanvas();
    };

    const handleError = (e: Event) => {
      console.error("Video error:", video.error);
      setIsLoadingVideo(false);
    };

    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("error", handleError);
    video.addEventListener("ended", handleEnded);

    if (videoFileURL) {
      video.src = videoFileURL;
      video.load();
    }

    return () => {
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
      video.removeEventListener("ended", handleEnded);
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [drawFrameToCanvas, handleEnded, generateThumbnails, videoFileURL]);

  useEffect(() => {
    return () => {
      if (videoFileURL) {
        URL.revokeObjectURL(videoFileURL);
      }
    };
  }, [videoFileURL]);

  useEffect(() => {
    if (!isLoadingVideo && videoDuration > 0) {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      debounceTimeoutRef.current = setTimeout(() => {
        generateThumbnails();
      }, 500);
    }
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [isLoadingVideo, videoDuration, generateThumbnails]);

  const handlePlayPauseToggle = () => {
    console.log(
      "handlePlayPauseToggle: Toggling isPlaying from",
      isPlaying,
      "to",
      !isPlaying
    );
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

  const pasteShapeToRemainingFrames = (forward = true) => {
    if (!copiedShapeData) return;

    setFrameDrawingHistory((prevMap) => {
      const newMap = new Map(prevMap);
      const shapeCopy = {
        ...copiedShapeData,
        id: uuidv4(),
      };

      if (forward) {
        for (let f = currentFrameNumber + 1; f < totalFrames; f++) {
          const frameEntry = newMap.get(f) || {
            history: [[]],
            currentIndex: 0,
          };
          const newShapes = [
            ...frameEntry.history[frameEntry.currentIndex],
            shapeCopy,
          ];
          const newHistory = [
            ...frameEntry.history.slice(0, frameEntry.currentIndex + 1),
            newShapes,
          ];
          newMap.set(f, {
            history: newHistory,
            currentIndex: newHistory.length - 1,
          });
        }
      } else {
        for (let f = 0; f < currentFrameNumber; f++) {
          const frameEntry = newMap.get(f) || {
            history: [[]],
            currentIndex: 0,
          };
          const newShapes = [
            ...frameEntry.history[frameEntry.currentIndex],
            shapeCopy,
          ];
          const newHistory = [
            ...frameEntry.history.slice(0, frameEntry.currentIndex + 1),
            newShapes,
          ];
          newMap.set(f, {
            history: newHistory,
            currentIndex: newHistory.length - 1,
          });
        }
      }
      return newMap;
    });
  };

  const handleDeleteShape = useCallback(() => {
    if (selectedShapeId) {
      setCurrentFrameShapes((prevShapes) => {
        const updatedShapes = prevShapes.filter(
          (shape) => shape.id !== selectedShapeId
        );
        addFrameShapeSnapshot(updatedShapes);
        return updatedShapes;
      });
      setSelectedShapeId(null);
      setCopiedShapeData(null);
    }
  }, [selectedShapeId, addFrameShapeSnapshot]);

  const handleLabelInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEditingShapeLabel(e.target.value);
    },
    []
  );

  const handleLabelBlur = useCallback(() => {
    if (
      selectedShapeId &&
      selectedShape &&
      editingShapeLabel !== selectedShape.label
    ) {
      setCurrentFrameShapes((prevShapes) => {
        const updatedShapes = prevShapes.map((shape) =>
          shape.id === selectedShapeId
            ? { ...shape, label: editingShapeLabel }
            : shape
        );
        addFrameShapeSnapshot(updatedShapes);
        return updatedShapes;
      });
    }
  }, [
    selectedShapeId,
    selectedShape,
    editingShapeLabel,
    addFrameShapeSnapshot,
  ]);

  const handleColorInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEditingShapeColor(e.target.value);
    },
    []
  );

  const handleColorBlur = useCallback(() => {
    if (
      selectedShapeId &&
      selectedShape &&
      editingShapeColor !== selectedShape.color
    ) {
      setCurrentFrameShapes((prevShapes) => {
        const updatedShapes = prevShapes.map((shape) =>
          shape.id === selectedShapeId
            ? { ...shape, color: editingShapeColor }
            : shape
        );
        addFrameShapeSnapshot(updatedShapes);
        return updatedShapes;
      });
    }
  }, [
    selectedShapeId,
    selectedShape,
    editingShapeColor,
    addFrameShapeSnapshot,
  ]);

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

  const handleFrameSelect = useCallback(
    (frameNumber: number) => {
      if (isPlaying) return;

      saveCurrentFrameShapes();

      const newTime = frameNumber / FPS;
      if (videoRef.current) {
        videoRef.current.currentTime = newTime;
        setCurrentFrameTime(newTime);
      }
    },
    [isPlaying, FPS, saveCurrentFrameShapes]
  );

  const handleFPSChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value > 0) {
      setFPS(value);
    } else if (e.target.value === "") {
      setFPS(0);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <Card className="w-full max-w-4xl shadow-lg">
        <CardHeader>
          <CardTitle>Video Frame Editor</CardTitle>
          <p className="text-sm text-gray-500">
            Upload a video, navigate frame by frame, and draw polygons,
            rectangles, or circles on the current frame.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="video-upload">Upload Video</Label>
            <Input
              id="video-upload"
              type="file"
              accept="video/*"
              onChange={handleVideoUpload}
              className="w-full"
            />
          </div>

          <div className="flex flex-col items-center space-y-4">
            <video
              ref={videoRef}
              muted
              crossOrigin="anonymous"
              className="hidden"
              preload="metadata"
              autoPlay={false}
            >
              Your browser does not support the video tag.
            </video>

            <canvas ref={canvasRef} className="hidden" />

            {isLoadingVideo ? (
              <div className="w-full h-96 bg-gray-200 flex items-center justify-center rounded-lg text-gray-500">
                {videoFileURL ? "Loading video..." : "Please upload a video."}
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
                onShapeTransformEnd={handleShapeTransformEnd}
                onPolygonPointDragEnd={handlePolygonPointDragEnd}
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
              <div className="flex items-center gap-4">
                <Label htmlFor="fps-input" className="min-w-[120px]">
                  Custom FPS:
                </Label>
                <Input
                  id="fps-input"
                  type="number"
                  value={FPS === 0 ? "" : FPS}
                  onChange={handleFPSChange}
                  min={1}
                  step={1}
                  className="w-24"
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

                <Button onClick={() => pasteShapeToRemainingFrames(false)}>
                  Paste to Previous Frames
                </Button>

                <Button onClick={() => pasteShapeToRemainingFrames(true)}>
                  Paste to Next Frames
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
                      value={editingShapeLabel}
                      onChange={handleLabelInputChange}
                      onBlur={handleLabelBlur}
                      disabled={isPlaying}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shape-color">Selected Shape Color</Label>
                    <Input
                      id="shape-color"
                      type="color"
                      value={editingShapeColor}
                      onChange={handleColorInputChange}
                      onBlur={handleColorBlur}
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

      {!isLoadingVideo && videoDuration > 0 && (
        <div className="w-full max-w-4xl mt-4">
          <FrameBar
            totalFrames={totalFrames}
            currentFrameNumber={currentFrameNumber}
            frameThumbnails={frameThumbnails}
            onFrameSelect={handleFrameSelect}
          />
        </div>
      )}
    </div>
  );
}
