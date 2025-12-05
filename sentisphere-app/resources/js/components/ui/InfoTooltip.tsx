import * as React from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip";

interface InfoTooltipProps {
  content: string;
  children?: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

/**
 * A styled info tooltip that appears on hover.
 * Wraps the children element and shows a beautiful tooltip on hover.
 * If no children provided, just wraps the parent element.
 */
export function InfoTooltip({ content, children, side = "top", className = "" }: InfoTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`cursor-help ${className}`}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent 
        side={side}
        className="bg-gradient-to-br from-slate-800 to-slate-900 text-white border border-slate-700 shadow-xl max-w-xs text-xs leading-relaxed px-3 py-2 rounded-lg"
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A card header with built-in hover tooltip.
 * The entire title becomes hoverable to show the info.
 */
export function CardHeaderWithInfo({ 
  title, 
  info, 
  className = "",
  titleClassName = ""
}: { 
  title: string; 
  info: string; 
  className?: string;
  titleClassName?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <h2 className={`cursor-help inline-flex items-center gap-1 ${titleClassName}`}>
          {title}
          <span className="text-blue-400/70 text-[10px] opacity-60 group-hover:opacity-100 transition-opacity">ⓘ</span>
        </h2>
      </TooltipTrigger>
      <TooltipContent 
        side="top"
        className="bg-gradient-to-br from-slate-800 to-slate-900 text-white border border-slate-700 shadow-xl max-w-xs text-xs leading-relaxed px-3 py-2 rounded-lg"
      >
        {info}
      </TooltipContent>
    </Tooltip>
  );
}

export default InfoTooltip;
