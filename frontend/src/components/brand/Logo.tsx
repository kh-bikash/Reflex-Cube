import React from "react";

/**
 * The Reflex Cube mark.
 *
 * An isometric cube drawn from three rhombi: the two lit faces are the
 * current text colour at different opacities, the third is solid, so the form
 * reads on any background and inherits the surrounding colour. Constructed
 * geometrically rather than generated, so it stays crisp at 16px and scales to
 * any size without an asset.
 *
 * Geometry: a unit cube projected isometrically. The top vertex sits at
 * (12, 2), the side vertices at (21, 7) and (3, 7), and the bottom at (12, 22);
 * the centre point (12, 12) is where the three visible faces meet.
 */
export const LogoMark: React.FC<React.SVGProps<SVGSVGElement>> = ({
  className = "h-6 w-6",
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role="img"
    aria-hidden="true"
    {...props}
  >
    {/* Top face */}
    <path d="M12 2 21 7 12 12 3 7Z" fill="currentColor" fillOpacity="0.9" />
    {/* Right face */}
    <path d="M21 7v10l-9 5V12Z" fill="currentColor" fillOpacity="0.55" />
    {/* Left face */}
    <path d="M3 7v10l9 5V12Z" fill="currentColor" fillOpacity="0.3" />
    {/* Silhouette, to keep the edges crisp against a matching background */}
    <path
      d="M12 2 21 7v10l-9 5-9-5V7Z"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinejoin="round"
      fillOpacity="0"
    />
  </svg>
);

interface LogoProps {
  /** Hide the wordmark, leaving only the cube. */
  markOnly?: boolean;
  className?: string;
}

/** The mark plus the wordmark, for headers and footers. */
export const Logo: React.FC<LogoProps> = ({ markOnly = false, className = "" }) => (
  <span className={`inline-flex items-center gap-2 ${className}`}>
    <LogoMark className="h-6 w-6 text-primary" />
    {!markOnly && (
      <span className="text-[15px] font-semibold tracking-tight text-foreground">
        Reflex Cube
      </span>
    )}
    <span className="sr-only">Reflex Cube</span>
  </span>
);

export default Logo;
