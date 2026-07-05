import React from 'react';
import tymlyAnimation from '../../../tymly.webm';

interface LoaderProps {
  text?: string;
  className?: string;
  videoClassName?: string;
  inline?: boolean;
}

export function Loader({ 
  text = "Loading...", 
  className = "",
  videoClassName = "w-20 h-20",
  inline = false
}: LoaderProps) {
  return (
    <div className={`flex ${inline ? 'flex-row gap-2 py-0' : 'flex-col gap-4 py-8'} items-center justify-center ${className}`}>
      <video 
        src={tymlyAnimation} 
        autoPlay 
        loop 
        muted 
        playsInline 
        className={`${videoClassName} object-contain pointer-events-none mix-blend-multiply dark:mix-blend-screen dark:invert`}
      />
      {text && <p className={`text-muted-foreground animate-pulse font-medium ${inline ? 'text-inherit' : 'text-sm'}`}>{text}</p>}
    </div>
  );
}
