"use client";
import { useEffect, useState } from "react";
import { buildMessage, type Lead, type LeadFields, type Settings } from "@/lib/leads";

/**
 * Keeps the catalogue files downloaded on the phone so "Send PDF" can open the
 * share sheet instantly (browsers only allow sharing straight from a tap).
 */
export function useFileShare(settings: Settings) {
  const [files, setFiles] = useState<File[]>([]);
  const key = settings.attachments.map((a) => a.url).join("|");

  useEffect(() => {
    let dead = false;
    if (!settings.attachments.length || typeof navigator === "undefined" || !navigator.canShare) {
      setFiles([]);
      return;
    }
    Promise.all(
      settings.attachments.map(async (a) => {
        // Keep a copy on the phone so the catalogue is downloaded once, not on every app open
        // (Vercel's free plan allows 10 GB of file downloads a month).
        let r: Response | undefined;
        const cache = typeof caches !== "undefined" ? await caches.open("attachments").catch(() => undefined) : undefined;
        if (cache) r = await cache.match(a.url).catch(() => undefined);
        if (!r) {
          r = await fetch(a.url);
          if (!r.ok) throw new Error("download failed");
          if (cache) await cache.put(a.url, r.clone()).catch(() => {});
        }
        const b = await r.blob();
        return new File([b], a.fileName, { type: a.type || b.type });
      }),
    )
      .then((f) => {
        if (!dead && navigator.canShare({ files: f })) setFiles(f);
      })
      .catch(() => !dead && setFiles([]));
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const canShare = files.length > 0;

  /** Opens the phone's share sheet with the catalogue file(s) and the greeting. Returns true if shared. */
  async function share(l: Pick<Lead | LeadFields, "name" | "company">): Promise<boolean> {
    if (!canShare) return false;
    try {
      await navigator.share({ files, text: buildMessage(l, { ...settings, attachments: [] }) });
      return true;
    } catch {
      return false; // cancelled
    }
  }

  return { canShare, share };
}
