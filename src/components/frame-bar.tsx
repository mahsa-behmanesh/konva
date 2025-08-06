"use client";

import React, { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface FrameBarProps {
  totalFrames: number;
  currentFrameNumber: number;
  frameThumbnails: string[]; // New prop for image data URLs
  onFrameSelect: (frameNumber: number) => void;
}

export default function FrameBar({
  totalFrames,
  currentFrameNumber,
  frameThumbnails,
  onFrameSelect,
}: FrameBarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      // Scroll to the current frame, centering it if possible
      const frameElement = scrollContainerRef.current.children[
        currentFrameNumber
      ] as HTMLElement;
      if (frameElement) {
        const containerWidth = scrollContainerRef.current.offsetWidth;
        const frameWidth = frameElement.offsetWidth;
        const scrollLeft =
          frameElement.offsetLeft - containerWidth / 2 + frameWidth / 2;
        scrollContainerRef.current.scrollTo({
          left: scrollLeft,
          behavior: "smooth",
        });
      }
    }
  }, [currentFrameNumber]);

  return (
    <div
      ref={scrollContainerRef}
      className="w-full overflow-x-auto whitespace-nowrap py-2 border-t border-gray-200 bg-gray-50 scrollbar-hide"
    >
      <div className="inline-flex gap-1 px-2">
        {Array.from({ length: totalFrames }, (_, i) => i).map((frameNumber) => (
          <button
            key={frameNumber}
            className={cn(
              "flex-shrink-0 flex flex-col items-center justify-center text-xs rounded-sm cursor-pointer transition-all duration-100 p-1",
              "hover:bg-gray-200",
              currentFrameNumber === frameNumber
                ? "bg-blue-500 text-white font-bold border-2 border-blue-700 scale-105 shadow-md"
                : "bg-gray-100 text-gray-700 border border-gray-300"
            )}
            onClick={() => onFrameSelect(frameNumber)}
            title={`Frame ${frameNumber}`}
          >
            {frameThumbnails[frameNumber] ? (
              <Image
                src={frameThumbnails[frameNumber] || "/placeholder.svg"}
                alt={`Frame ${frameNumber}`}
                width={100}
                height={100}
                className="w-16 h-10 object-cover rounded-sm mb-1 border border-gray-300"
              />
            ) : (
              <div className="w-16 h-10 bg-gray-200 flex items-center justify-center text-gray-500 text-[8px] rounded-sm mb-1">
                Loading...
              </div>
            )}
            <span>{frameNumber}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
