"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Ellipse, Image as KonvaImage, Layer, Line, Rect, Stage, Text as KonvaText, Transformer } from "react-konva";

import type {
  PosterEllipseLayer,
  PosterImageLayer,
  PosterLayer,
  PosterLineLayer,
  PosterPage,
  PosterRectLayer,
  PosterTextLayer
} from "@/lib/poster-template";

interface CanvasStageProps {
  page: PosterPage;
  selectedLayerId: string | null;
  zoom: number;
  stageRef: React.MutableRefObject<Konva.Stage | null>;
  onSelectLayer: (layerId: string | null) => void;
  onUpdateLayer: (layerId: string, patch: Partial<PosterLayer>) => void;
}

function useLoadedImage(src: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const nextImage = new window.Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => setImage(nextImage);
    nextImage.src = src;
    return () => {
      nextImage.onload = null;
    };
  }, [src]);

  return image;
}

function CanvasImageShape({
  layer,
  isSelected,
  onSelectLayer,
  onUpdateLayer,
  registerNode
}: {
  layer: PosterImageLayer;
  isSelected: boolean;
  onSelectLayer: (layerId: string) => void;
  onUpdateLayer: (layerId: string, patch: Partial<PosterLayer>) => void;
  registerNode: (node: Konva.Node | null) => void;
}) {
  const image = useLoadedImage(layer.src);

  return (
    <KonvaImage
      ref={registerNode}
      image={image ?? undefined}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      rotation={layer.rotation}
      opacity={layer.opacity}
      visible={layer.visible}
      cornerRadius={layer.cornerRadius}
      stroke={isSelected ? "#3c6bff" : layer.stroke}
      strokeWidth={isSelected ? 2 : layer.strokeWidth}
      draggable={!layer.locked}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelectLayer(layer.id);
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onSelectLayer(layer.id);
      }}
      onDragEnd={(event) =>
        onUpdateLayer(layer.id, {
          x: event.target.x(),
          y: event.target.y()
        })
      }
      onTransformEnd={(event) => {
        const node = event.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onUpdateLayer(layer.id, {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          width: Math.max(120, layer.width * scaleX),
          height: Math.max(120, layer.height * scaleY)
        });
      }}
    />
  );
}

export function CanvasStage({
  page,
  selectedLayerId,
  zoom,
  stageRef,
  onSelectLayer,
  onUpdateLayer
}: CanvasStageProps) {
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeMapRef = useRef<Record<string, Konva.Node | null>>({});

  const selectedLayer = useMemo(
    () => page.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [page.layers, selectedLayerId]
  );

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) {
      return;
    }

    const selectedNode = selectedLayerId ? nodeMapRef.current[selectedLayerId] : null;
    transformer.nodes(selectedNode ? [selectedNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [page.layers, selectedLayerId]);

  const enabledAnchors = useMemo(() => {
    if (!selectedLayer) {
      return ["top-left", "top-right", "bottom-left", "bottom-right"];
    }

    if (selectedLayer.kind === "text") {
      return ["middle-left", "middle-right"];
    }

    if (selectedLayer.kind === "line") {
      return [];
    }

    return ["top-left", "top-right", "bottom-left", "bottom-right"];
  }, [selectedLayer]);

  const bindNode = (layerId: string) => (node: Konva.Node | null) => {
    nodeMapRef.current[layerId] = node;
  };

  const handleStagePointerDown = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (event.target === event.target.getStage()) {
      onSelectLayer(null);
      return;
    }

    if (event.target.name() === "workspace-bg") {
      onSelectLayer(null);
    }
  };

  return (
    <div
      className="relative rounded-[32px] bg-white shadow-canvas"
      style={{
        width: page.width * zoom,
        height: page.height * zoom
      }}
    >
      <Stage
        ref={(node) => {
          stageRef.current = node;
        }}
        width={page.width}
        height={page.height}
        scaleX={zoom}
        scaleY={zoom}
        onMouseDown={handleStagePointerDown}
        onTouchStart={handleStagePointerDown}
      >
        <Layer>
          <Rect name="workspace-bg" width={page.width} height={page.height} fill={page.backgroundColor} />

          {page.layers.map((layer) => {
            if (!layer.visible) {
              return null;
            }

            const isSelected = selectedLayerId === layer.id;

            if (layer.kind === "text") {
              const textLayer = layer as PosterTextLayer;
              return (
                <KonvaText
                  key={layer.id}
                  ref={bindNode(layer.id)}
                  x={textLayer.x}
                  y={textLayer.y}
                  width={textLayer.width}
                  rotation={textLayer.rotation}
                  opacity={textLayer.opacity}
                  visible={textLayer.visible}
                  text={textLayer.text}
                  fontSize={textLayer.fontSize}
                  fontFamily={textLayer.fontFamily}
                  fontStyle={textLayer.fontStyle}
                  textDecoration={textLayer.textDecoration}
                  fill={textLayer.fill}
                  align={textLayer.align}
                  lineHeight={textLayer.lineHeight}
                  letterSpacing={textLayer.letterSpacing}
                  draggable={!textLayer.locked}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    onSelectLayer(layer.id);
                  }}
                  onTap={(event) => {
                    event.cancelBubble = true;
                    onSelectLayer(layer.id);
                  }}
                  onDragEnd={(event) =>
                    onUpdateLayer(layer.id, {
                      x: event.target.x(),
                      y: event.target.y()
                    })
                  }
                  onTransformEnd={(event) => {
                    const node = event.target;
                    const scaleX = node.scaleX();
                    node.scaleX(1);
                    node.scaleY(1);
                    onUpdateLayer(layer.id, {
                      x: node.x(),
                      y: node.y(),
                      rotation: node.rotation(),
                      width: Math.max(140, textLayer.width * scaleX)
                    });
                  }}
                />
              );
            }

            if (layer.kind === "rect") {
              const rectLayer = layer as PosterRectLayer;
              return (
                <Rect
                  key={layer.id}
                  ref={bindNode(layer.id)}
                  x={rectLayer.x}
                  y={rectLayer.y}
                  width={rectLayer.width}
                  height={rectLayer.height}
                  rotation={rectLayer.rotation}
                  opacity={rectLayer.opacity}
                  visible={rectLayer.visible}
                  fill={rectLayer.fill}
                  fillEnabled={rectLayer.fillEnabled !== false}
                  cornerRadius={rectLayer.cornerRadius}
                  stroke={isSelected ? "#3c6bff" : rectLayer.stroke}
                  strokeWidth={isSelected ? 2 : rectLayer.strokeWidth}
                  draggable={!rectLayer.locked}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    onSelectLayer(layer.id);
                  }}
                  onTap={(event) => {
                    event.cancelBubble = true;
                    onSelectLayer(layer.id);
                  }}
                  onDragEnd={(event) =>
                    onUpdateLayer(layer.id, {
                      x: event.target.x(),
                      y: event.target.y()
                    })
                  }
                  onTransformEnd={(event) => {
                    const node = event.target;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    node.scaleX(1);
                    node.scaleY(1);
                    onUpdateLayer(layer.id, {
                      x: node.x(),
                      y: node.y(),
                      rotation: node.rotation(),
                      width: Math.max(20, rectLayer.width * scaleX),
                      height: Math.max(20, rectLayer.height * scaleY)
                    });
                  }}
                />
              );
            }

            if (layer.kind === "ellipse") {
              const ellipseLayer = layer as PosterEllipseLayer;
              return (
                <Ellipse
                  key={layer.id}
                  ref={bindNode(layer.id)}
                  x={ellipseLayer.x}
                  y={ellipseLayer.y}
                  radiusX={ellipseLayer.radiusX}
                  radiusY={ellipseLayer.radiusY}
                  rotation={ellipseLayer.rotation}
                  opacity={ellipseLayer.opacity}
                  visible={ellipseLayer.visible}
                  fill={ellipseLayer.fill}
                  stroke={isSelected ? "#3c6bff" : ellipseLayer.stroke}
                  strokeWidth={isSelected ? 2 : ellipseLayer.strokeWidth}
                  draggable={!ellipseLayer.locked}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    onSelectLayer(layer.id);
                  }}
                  onTap={(event) => {
                    event.cancelBubble = true;
                    onSelectLayer(layer.id);
                  }}
                  onDragEnd={(event) =>
                    onUpdateLayer(layer.id, {
                      x: event.target.x(),
                      y: event.target.y()
                    })
                  }
                  onTransformEnd={(event) => {
                    const node = event.target as Konva.Ellipse;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    node.scaleX(1);
                    node.scaleY(1);
                    onUpdateLayer(layer.id, {
                      x: node.x(),
                      y: node.y(),
                      rotation: node.rotation(),
                      radiusX: Math.max(10, ellipseLayer.radiusX * scaleX),
                      radiusY: Math.max(10, ellipseLayer.radiusY * scaleY)
                    });
                  }}
                />
              );
            }

            if (layer.kind === "line") {
              const lineLayer = layer as PosterLineLayer;
              return (
                <Line
                  key={layer.id}
                  ref={bindNode(layer.id)}
                  x={lineLayer.x}
                  y={lineLayer.y}
                  points={lineLayer.points}
                  rotation={lineLayer.rotation}
                  opacity={lineLayer.opacity}
                  visible={lineLayer.visible}
                  stroke={lineLayer.stroke}
                  strokeWidth={lineLayer.strokeWidth}
                  tension={lineLayer.tension}
                  dash={lineLayer.dash}
                  lineCap="round"
                  lineJoin="round"
                  draggable={!lineLayer.locked}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    onSelectLayer(layer.id);
                  }}
                  onTap={(event) => {
                    event.cancelBubble = true;
                    onSelectLayer(layer.id);
                  }}
                  onDragEnd={(event) =>
                    onUpdateLayer(layer.id, {
                      x: event.target.x(),
                      y: event.target.y()
                    })
                  }
                />
              );
            }

            return (
              <CanvasImageShape
                key={layer.id}
                layer={layer as PosterImageLayer}
                isSelected={isSelected}
                onSelectLayer={onSelectLayer}
                onUpdateLayer={onUpdateLayer}
                registerNode={bindNode(layer.id)}
              />
            );
          })}

          <Transformer
            ref={transformerRef}
            enabledAnchors={enabledAnchors}
            rotateEnabled={selectedLayer?.kind !== "line"}
            resizeEnabled={selectedLayer?.kind !== "line"}
            keepRatio={selectedLayer?.kind === "image"}
            borderStroke="#3c6bff"
            anchorStroke="#3c6bff"
            anchorFill="#ffffff"
            anchorSize={10}
            padding={8}
            boundBoxFunc={(oldBox, newBox) => {
              if (Math.abs(newBox.width) < 24 || Math.abs(newBox.height) < 24) {
                return oldBox;
              }
              return newBox;
            }}
          />
        </Layer>
      </Stage>
    </div>
  );
}
