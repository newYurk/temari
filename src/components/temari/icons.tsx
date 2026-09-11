import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Glyph({ children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      {children}
    </svg>
  );
}

const sw = 1.35;

export function IconSimple(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth={sw} />
      <path
        d="M12 3.6v16.8M3.6 12h16.8M6.1 6.1l11.8 11.8M17.9 6.1 6.1 17.9"
        stroke="currentColor"
        strokeWidth={1.15}
      />
    </Glyph>
  );
}

export function IconC8(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth={sw} />
      <path
        d="M12 5.4 18.6 12 12 18.6 5.4 12Z"
        stroke="currentColor"
        strokeWidth={1.15}
      />
    </Glyph>
  );
}

export function IconC10(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth={sw} />
      <path
        d="M12 4.8 16.9 8.3 15.1 14.8 8.9 14.8 7.1 8.3Z"
        stroke="currentColor"
        strokeWidth={1.15}
        strokeLinejoin="round"
      />
    </Glyph>
  );
}

export function IconNone(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth={sw} />
    </Glyph>
  );
}

export function IconKiku(props: IconProps) {
  return (
    <Glyph {...props}>
      {Array.from({ length: 8 }, (_, i) => (
        <ellipse
          key={i}
          cx="12"
          cy="6.6"
          rx="2.1"
          ry="4.4"
          transform={`rotate(${i * 45} 12 12)`}
          stroke="currentColor"
          strokeWidth={1.2}
        />
      ))}
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </Glyph>
  );
}

export function IconHoshi(props: IconProps) {
  return (
    <Glyph {...props}>
      <path
        d="M12 4.2 14.6 9.8 20.6 10.4 16.1 14.5 17.5 20.4 12 17.3 6.5 20.4 7.9 14.5 3.4 10.4 9.4 9.8Z"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
    </Glyph>
  );
}

export function IconHishi(props: IconProps) {
  return (
    <Glyph {...props}>
      <path
        d="M12 3.8 20.2 12 12 20.2 3.8 12Z"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
    </Glyph>
  );
}

export function IconObi(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth={1.1} />
      <path
        d="M4 10.4c2.4 1.4 5.2 2.1 8 2.1s5.6-.7 8-2.1M4 13.6c2.4 1.4 5.2 2.1 8 2.1s5.6-.7 8-2.1"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    </Glyph>
  );
}

export function IconRow(props: IconProps) {
  return (
    <Glyph {...props}>
      <path
        d="M5 16.5 9 8.5 13 16.5 17 8.5 21 16.5"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Glyph>
  );
}

export function IconDensity({
  level,
  ...props
}: IconProps & { level: "open" | "even" | "tight" }) {
  const n = level === "open" ? 3 : level === "even" ? 5 : 7;
  const start = 6;
  const span = 12;
  return (
    <Glyph {...props}>
      {Array.from({ length: n }, (_, i) => {
        const x = start + (span * i) / (n - 1);
        return (
          <path
            key={i}
            d={`M${x.toFixed(1)} 5.5v13`}
            stroke="currentColor"
            strokeWidth={1.2}
            strokeLinecap="round"
          />
        );
      })}
    </Glyph>
  );
}

export function IconDirOut(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path
        d="M12 8.2V4.6M12 15.8v3.6M8.2 12H4.6M15.8 12h3.6"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </Glyph>
  );
}

export function IconDirIn(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="2.2" stroke="currentColor" strokeWidth={sw} />
      <path
        d="M12 5.2 12 9M12 18.8 12 15M5.2 12H9M18.8 12h-3.8"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </Glyph>
  );
}

export function IconNeedle(props: IconProps) {
  return (
    <Glyph {...props}>
      <path
        d="M8.5 19.5 16.2 5.4"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M16.8 4.6c.9.7.8 2.1-.2 2.8"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </Glyph>
  );
}
