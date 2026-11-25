export type Interest = "" | "Hot" | "Warm" | "Cold";

export const STAGES = ["New", "Contacted", "Sample sent", "Quotation sent", "Negotiating", "Order won", "Not interested"] as const;
export type Stage = (typeof STAGES)[number];
export const CLOSED: string[] = ["Order won", "Not interested"];

export type Lead = {
  id: string;
  name: string;
  designation: string;
  company: string;
  phones: string;
  whatsapp: string;
  email: string;
  website: string;
  address: string;
  city: string;
  country: string;
  gst: string;
  products: string;
  notes: string;
  interest: Interest;
  stage: Stage;
  followUp: string; // yyyy-mm-dd
  thumb: string; // small jpeg data URL of the card
  createdAt: number;
  updatedAt: number;
  waSent: number; // timestamp, 0 = not sent
};

export type LeadFields = Omit<Lead, "id" | "thumb" | "createdAt" | "updatedAt" | "waSent">;

export const TEXT_FIELDS: { key: keyof LeadFields; label: string; full?: boolean; type?: string }[] = [
  { key: "name", label: "Name" },
  { key: "designation", label: "Designation" },
  { key: "company", label: "Company", full: true },
  { key: "phones", label: "Phone(s)", type: "tel" },
  { key: "whatsapp", label: "WhatsApp number", type: "tel" },
  { key: "email", label: "Email", type: "email" },
  { key: "website", label: "Website" },
  { key: "address", label: "Address", full: true },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "gst", label: "GST / Reg. no." },
  { key: "products", label: "Their products / business" },
];

export const emptyLead = (): LeadFields => ({
  name: "", designation: "", company: "", phones: "", whatsapp: "", email: "", website: "", address: "",
  city: "", country: "", gst: "", products: "", notes: "", interest: "", stage: "New", followUp: "",
});

export type Settings = { tpl: string; cc: string };

export const DEFAULT_TEMPLATE = `Hello {name},

It was a pleasure meeting you at Indusfood. I'm Akhil Aggarwal from Bansal Snax — makers of JUST ROASTED, our range of roasted namkeen and healthy snacks.

Sharing my contact details so we can take the conversation forward with {company}. Happy to send our catalogue, price list and samples.

Regards,
Akhil Aggarwal
Bansal Snax`;

export const DEFAULT_SETTINGS: Settings = { tpl: DEFAULT_TEMPLATE, cc: "91" };

export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const isDue = (l: Pick<Lead, "followUp" | "stage">) => !!l.followUp && l.followUp <= today() && !CLOSED.includes(l.stage);

/** Turns whatever is printed on a card into digits wa.me accepts (country code + number). */
export function waNumber(raw: string, cc: string): string {
  const s = String(raw || "").split(/[,/;]| or /)[0].trim();
  if (!s) return "";
  let d = s.replace(/\D/g, "");
  if (s.startsWith("+")) return d;
  if (d.startsWith("00")) return d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length <= 10) return (cc.replace(/\D/g, "") || "91") + d;
  return d;
}

export function waLink(l: Pick<LeadFields, "whatsapp" | "phones" | "name" | "company">, s: Settings): string {
  const n = waNumber(l.whatsapp || l.phones, s.cc);
  if (n.length < 8) return "";
  const msg = (s.tpl || DEFAULT_TEMPLATE)
    .replaceAll("{name}", l.name.trim() || "there")
    .replaceAll("{company}", l.company.trim() || "your company");
  return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
}

const CSV_COLS: (keyof Lead)[] = ["name", "designation", "company", "phones", "whatsapp", "email", "website", "address", "city", "country", "gst", "products", "interest", "stage", "followUp", "notes"];
const CSV_HEAD = ["Name", "Designation", "Company", "Phones", "WhatsApp", "Email", "Website", "Address", "City", "Country", "GST", "Products", "Interest", "Stage", "Follow-up", "Notes", "Scanned on", "WhatsApp sent"];

export function toRows(leads: Lead[]): string[][] {
  return [CSV_HEAD, ...leads.map((l) => [...CSV_COLS.map((k) => String(l[k] ?? "")), new Date(l.createdAt).toLocaleString("en-IN"), l.waSent ? "Yes" : ""])];
}

export function downloadCsv(leads: Lead[]) {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = "﻿" + toRows(leads).map((r) => r.map(q).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `indusfood-leads-${today()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const toTsv = (leads: Lead[]) => toRows(leads).map((r) => r.map((v) => v.replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");

/** Normalises a stored document into a full Lead (older or partial docs get defaults). */
export function asLead(id: string, d: Record<string, unknown>): Lead {
  const base = emptyLead();
  const out = { ...base } as Record<string, unknown>;
  for (const k of Object.keys(base)) if (typeof d[k] === "string") out[k] = d[k];
  const waSent = typeof d.waSent === "number" ? d.waSent : 0;
  if (!STAGES.includes(out.stage as Stage)) out.stage = waSent ? "Contacted" : "New";
  if (!["", "Hot", "Warm", "Cold"].includes(out.interest as string)) out.interest = "";
  return {
    ...(out as LeadFields),
    id,
    thumb: typeof d.thumb === "string" && d.thumb.startsWith("data:image/jpeg;base64,") ? d.thumb : "",
    createdAt: typeof d.createdAt === "number" ? d.createdAt : 0,
    updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : 0,
    waSent,
  };
}

/** Shrinks a phone photo to a JPEG data URL (keeps uploads and storage small). */
export function shrinkImage(file: Blob, max: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not open that photo"));
    };
    img.src = url;
  });
}
