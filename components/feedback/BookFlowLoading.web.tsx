import React, { type CSSProperties } from 'react';

/*
 * Browser renderer for BookFlowLoading.
 *
 * Reanimated cannot apply a React Native transform array directly to an SVG
 * Polygon on web. CSS animations keep the supplied component's geometry,
 * palette and timing, render in the static invoice HTML before hydration, and
 * continue smoothly while the JavaScript bundle and invoice request load.
 */

const BG = '#E9EDE6';
const TEXT = '#142A3A';
const ACCENT = '#84948B';
const GREEN_DARK = '#02503F';
const GREEN_MID = '#058769';
const GOLD = '#E0B45F';

const VIEWBOX = { x: 240, y: 210, w: 810, h: 800 };

type Facet = {
  points: string;
  fill: string;
  hinge?: { a: [number, number]; b: [number, number]; deg: number };
};

const FACETS: Facet[] = [
  { points: '320,992 470,762 662,448 798,747 565,848', fill: GREEN_DARK },
  {
    points: '317,994 484,698 572,589 263,234 662,447 470,762',
    fill: GREEN_MID,
    hinge: { a: [662, 447], b: [317, 994], deg: 118 },
  },
  {
    points: '485,697.5 263,234.5 572.5,589',
    fill: GREEN_DARK,
    hinge: { a: [485, 697.5], b: [572.5, 589], deg: 104 },
  },
  {
    points: '320,991 564,848 630,901',
    fill: GREEN_MID,
    hinge: { a: [320, 991], b: [564, 848], deg: -116 },
  },
  {
    points: '798,746.5 682,488.5 850.5,676',
    fill: GOLD,
    hinge: { a: [682, 488.5], b: [798, 746.5], deg: -112 },
  },
  {
    points: '850,675.5 729.5,540 843,379.5 903.5,396',
    fill: GREEN_MID,
    hinge: { a: [729.5, 540], b: [850, 675.5], deg: -108 },
  },
  {
    points: '731,539.5 698.5,505 841,381.5',
    fill: GREEN_DARK,
    hinge: { a: [841, 381.5], b: [731, 539.5], deg: 96 },
  },
  {
    points: '885,501.5 904,395.5 1028.5,428 942,465.5',
    fill: GREEN_DARK,
    hinge: { a: [904, 395.5], b: [885, 501.5], deg: -102 },
  },
];

const N = FACETS.length;
const FOLD_DUR = 640;
const FOLD_STAGGER = 104;
const HOLD = 650;
const UNFOLD_DUR = 420;
const UNFOLD_STAGGER = 64;
const FOLD_END = (N - 1) * FOLD_STAGGER + FOLD_DUR;
const UNFOLD_START = FOLD_END + HOLD;
const CYCLE = UNFOLD_START + (N - 1) * UNFOLD_STAGGER + UNFOLD_DUR;
const WORD_DELAY = 1360;
const WORD_SIZE = 29;
const DOT = WORD_SIZE * 0.52 * 0.22;

const EASE_OUT_CUBIC = 'cubic-bezier(0.333333, 1, 0.666667, 1)';
const EASE_IN_CUBIC = 'cubic-bezier(0.333333, 0, 0.666667, 0)';

const percent = (milliseconds: number) => `${((milliseconds / CYCLE) * 100).toFixed(5)}%`;
const number = (value: number) => Number(value.toFixed(5));

function transforms(facet: Facet, size: number) {
  if (!facet.hinge) {
    return { start: 'scale(0.68) rotate(-5deg)', end: 'scale(1) rotate(0deg)' };
  }

  const scale = size / VIEWBOX.w;
  const { a, b, deg } = facet.hinge;
  const mx = number(((a[0] + b[0]) / 2 - (VIEWBOX.x + VIEWBOX.w / 2)) * scale);
  const my = number(((a[1] + b[1]) / 2 - (VIEWBOX.y + VIEWBOX.h / 2)) * scale);
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const length = Math.sqrt(vx * vx + vy * vy);
  const rotateY = number(deg * (vx / length));
  const rotateX = number(-deg * (vy / length));
  const prefix = `perspective(900px) translate(${mx}px, ${my}px)`;
  const suffix = `translate(${-mx}px, ${-my}px)`;

  return {
    start: `${prefix} rotateY(${rotateY}deg) rotateX(${rotateX}deg) ${suffix}`,
    end: `${prefix} rotateY(0deg) rotateX(0deg) ${suffix}`,
  };
}

function buildFacetCss(size: number) {
  return FACETS.map((facet, index) => {
    const foldStart = index * FOLD_STAGGER;
    const foldEnd = foldStart + FOLD_DUR;
    const unfoldStart = UNFOLD_START + (N - 1 - index) * UNFOLD_STAGGER;
    const unfoldEnd = unfoldStart + UNFOLD_DUR;
    const opaqueAt = foldStart + FOLD_DUR * (1 - Math.cbrt(0.78));
    const fadeAt = unfoldStart + UNFOLD_DUR * Math.cbrt(0.78);
    const transform = transforms(facet, size);

    return `
      .bf-loading__layer-${index} { animation: bf-fold-${index} ${CYCLE}ms linear infinite both; }
      .bf-loading__facet-${index} { animation: bf-opacity-${index} ${CYCLE}ms linear infinite both; }
      .bf-loading--settled .bf-loading__layer-${index} { animation: none; transform: ${transform.end}; }
      .bf-loading--settled .bf-loading__facet-${index} { animation: none; opacity: 1; }
      @keyframes bf-fold-${index} {
        0%, ${percent(foldStart)} { transform: ${transform.start}; animation-timing-function: ${EASE_OUT_CUBIC}; }
        ${percent(foldEnd)} { transform: ${transform.end}; }
        ${percent(unfoldStart)} { transform: ${transform.end}; animation-timing-function: ${EASE_IN_CUBIC}; }
        ${percent(unfoldEnd)}, 100% { transform: ${transform.start}; }
      }
      @keyframes bf-opacity-${index} {
        0%, ${percent(foldStart)} { opacity: 0; }
        ${percent(opaqueAt)}, ${percent(fadeAt)} { opacity: 1; }
        ${percent(unfoldEnd)}, 100% { opacity: 0; }
      }
    `;
  }).join('');
}

function buildCss(size: number) {
  const settledTransforms = FACETS.map((facet, index) =>
    `.bf-loading__layer-${index} { transform: ${transforms(facet, size).end}; }`,
  ).join('');

  return `
    .bf-loading {
      align-items: center;
      background: ${BG};
      box-sizing: border-box;
      display: flex;
      flex: 1 1 0%;
      flex-direction: column;
      gap: 20px;
      justify-content: center;
      min-height: 0;
      min-width: 0;
    }
    .bf-loading__mark { height: ${size}px; position: relative; width: ${size}px; }
    .bf-loading__layer {
      inset: 0;
      position: absolute;
      transform-origin: center center;
      transition: transform 420ms ease-in-out;
    }
    .bf-loading__facet {
      display: block;
      height: 100%;
      transition: opacity 420ms ease-in-out;
      width: 100%;
    }
    .bf-loading__word-row {
      align-items: flex-end;
      animation: bf-word-in 520ms ease-in-out ${WORD_DELAY}ms both;
      display: flex;
    }
    .bf-loading__word {
      color: ${TEXT};
      font-family: DMSans-Bold, sans-serif;
      font-size: ${WORD_SIZE}px;
      font-weight: 700;
      letter-spacing: -0.7px;
      line-height: normal;
    }
    .bf-loading__dot {
      background: ${ACCENT};
      height: ${DOT}px;
      margin-left: ${DOT * 0.28}px;
      width: ${DOT}px;
    }
    @keyframes bf-word-in {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    ${buildFacetCss(size)}
    @media (prefers-reduced-motion: reduce) {
      .bf-loading__layer, .bf-loading__facet { animation: none !important; transition: none; }
      .bf-loading__facet { opacity: 1; }
      ${settledTransforms}
      .bf-loading__word-row { animation: bf-word-in 200ms ${EASE_OUT_CUBIC} both; }
    }
  `;
}

export default function BookFlowLoading({
  size = 220,
  loading = true,
}: {
  size?: number;
  loading?: boolean;
}) {
  const rootStyle = { '--bf-loading-size': `${size}px` } as CSSProperties;

  return (
    <div
      aria-busy={loading}
      aria-label="Loading"
      className={`bf-loading${loading ? '' : ' bf-loading--settled'}`}
      role="progressbar"
      style={rootStyle}
    >
      <style dangerouslySetInnerHTML={{ __html: buildCss(size) }} />
      <div className="bf-loading__mark" aria-hidden="true">
        {FACETS.map((facet, index) => (
          <div className={`bf-loading__layer bf-loading__layer-${index}`} key={facet.points}>
            <svg
              className={`bf-loading__facet bf-loading__facet-${index}`}
              height={size}
              viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}
              width={size}
            >
              <polygon fill={facet.fill} points={facet.points} />
            </svg>
          </div>
        ))}
      </div>
      <div className="bf-loading__word-row" aria-hidden="true">
        <span className="bf-loading__word">BookFlow</span>
        <span className="bf-loading__dot" />
      </div>
    </div>
  );
}
