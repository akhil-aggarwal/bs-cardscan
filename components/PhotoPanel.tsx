"use client";
import { useState } from "react";

/** Card photos shown beside the form, so names and numbers can be checked. Tap a photo to see it full screen. */
export default function PhotoPanel({ front, back, loading }: { front: string; back: string; loading?: boolean }) {
  const [big, setBig] = useState<string | null>(null);
  const [rot, setRot] = useState(0);
  const pics = [["Front", front], ["Back", back]].filter(([, src]) => src) as [string, string][];

  if (loading) return <div className="photos"><div className="photo-empty">Loading card photo…</div></div>;
  if (!pics.length) return <div className="photos"><div className="photo-empty">No photo saved for this card.</div></div>;

  return (
    <>
      <div className={"photos" + (pics.length === 1 ? " one" : "")}>
        {pics.map(([label, src]) => (
          <button key={label} type="button" className="photo" onClick={() => { setRot(0); setBig(src); }} aria-label={`Open ${label.toLowerCase()} photo full screen`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`${label} of the card`} />
            <span>{label} · tap to enlarge</span>
          </button>
        ))}
      </div>
      {big && (
        <div className="viewer" role="dialog" aria-modal="true" aria-label="Card photo">
          <div className="viewer-bar">
            <button type="button" className="btn" onClick={() => setRot((r) => (r + 90) % 360)}>Rotate</button>
            <button type="button" className="btn pri" onClick={() => setBig(null)}>Close</button>
          </div>
          <div className="viewer-img">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={big} alt="Card photo, full size" style={{ transform: `rotate(${rot}deg)` }} />
          </div>
          <p className="viewer-tip">Pinch to zoom in on small print.</p>
        </div>
      )}
    </>
  );
}
