import React from 'react';
import theme from '../../../ui/theme';

// Success confirmation illustration. Per B3 (success is a DISTINCT mint, not
// the brand green), the badge/confetti use theme.colors.success rather than
// the original hardcoded cyan; the checkmark uses void for contrast against
// the light mint circle, and the muted confetti set uses textMuted so it
// still reads against the dark page background.
export function SuccessLayer() {
  return (
    <>
      <svg
        width="240"
        height="130"
        viewBox="0 0 324 171"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="160.5" cy="88.5" r="50.5" fill={theme.colors.success} />
        <g clipPath="url(#clip0)">
          <path
            d="M154.966 104.9C153.883 104.946 152.784 104.555 151.958 103.729L142.229 93.9995C140.661 92.4326 140.661 89.891 142.229 88.3241C143.795 86.7572 146.336 86.7572 147.904 88.3241L154.974 95.3941L177.096 73.2725C178.663 71.7047 181.204 71.7047 182.772 73.2725C184.339 74.8394 184.339 77.3801 182.772 78.9479L157.99 103.729C157.207 104.512 156.18 104.904 155.153 104.904C155.09 104.904 155.028 104.903 154.966 104.9Z"
            fill={theme.colors.void}
          />
        </g>
        <circle cx="80" cy="23" r="6" fill={theme.colors.textMuted} />
        <circle cx="6" cy="110" r="6" fill={theme.colors.success} />
        <circle cx="52" cy="91" r="6" fill={theme.colors.textMuted} />
        <circle cx="14" cy="25" r="6" fill={theme.colors.textMuted} />
        <circle cx="259" cy="36" r="6" fill={theme.colors.textMuted} />
        <circle cx="74" cy="124" r="6" fill={theme.colors.success} />
        <circle cx="247" cy="112" r="6" fill={theme.colors.textMuted} />
        <circle cx="284" cy="79" r="6" fill={theme.colors.success} />
        <circle cx="302" cy="19" r="6" fill={theme.colors.success} />
        <circle cx="290" cy="145" r="6" fill={theme.colors.success} />
        <rect
          x="8.13086"
          y="163.928"
          width="33.6573"
          height="10"
          rx="5"
          transform="rotate(-45 8.13086 163.928)"
          fill={theme.colors.textMuted}
        />
        <rect
          x="23.5654"
          y="61.8008"
          width="33.6573"
          height="10"
          rx="5"
          transform="rotate(-45 23.5654 61.8008)"
          fill={theme.colors.success}
        />
        <rect
          x="82.666"
          y="162.801"
          width="33.6573"
          height="10"
          rx="5"
          transform="rotate(-45 82.666 162.801)"
          fill={theme.colors.success}
        />
        <rect
          x="210.129"
          y="23.9297"
          width="33.6573"
          height="10"
          rx="5"
          transform="rotate(-45 210.129 23.9297)"
          fill={theme.colors.textMuted}
        />
        <rect
          x="293"
          y="112.301"
          width="33.6573"
          height="10"
          rx="5"
          transform="rotate(-45 293 112.301)"
          fill={theme.colors.textMuted}
        />
        <rect
          x="216.129"
          y="156.93"
          width="33.6573"
          height="10"
          rx="5"
          transform="rotate(-45 216.129 156.93)"
          fill={theme.colors.success}
        />
        <circle cx="89" cy="59" r="6" fill={theme.colors.success} />
        <defs>
          <clipPath id="clip0">
            <rect
              width="42.8942"
              height="32.8077"
              fill={theme.colors.textPrimary}
              transform="translate(141.053 72.0967)"
            />
          </clipPath>
        </defs>
      </svg>
    </>
  );
}
