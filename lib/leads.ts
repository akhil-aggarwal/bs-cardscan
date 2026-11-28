export type Interest = "" | "Hot" | "Warm" | "Cold";
export type Kind = "Buyer" | "Vendor";

/** Sales stages for buyers (they buy from you). */
export const BUYER_STAGES = ["New", "Contacted", "Sample sent", "Quotation sent", "Negotiating", "Order won", "Not interested"];
/** Purchase stages for vendors (they sell to you). */
export const VENDOR_STAGES = ["New", "Contacted", "Sample received", "Quotation received", "Approved vendor", "Not suitable"];
export const stagesFor = (k: Kind) => (k === "Vendor" ? VENDOR_STAGES : BUYER_STAGES);
export const CLOSED = ["Order won", "Not interested", "Approved vendor", "Not suitable"];
export const WON = ["Order won", "Approved vendor"];

/** One meeting with this person: which exhibition ("" = none) and when. */
export type Visit = { ex: string; at: number };

export type Lead = {
  id: string;
  kind: Kind;
  name: string;
  designation: string;
  company: string;
  phones: string;
  whatsapp: string;
  email: string;
  website: string;
  address: string;
  city: string;
  state: string;
  country: string;
  gst: string;
  products: string; // buyers: their business; vendors: what they supply
  notes: string;
  interest: Interest;
  stage: string;
  followUp: string; // yyyy-mm-dd
  visits: Visit[]; // first = where you first met
  thumb: string; // small jpeg data URL of the card
  createdAt: number;
  updatedAt: number;
  waSent: number; // timestamp, 0 = not sent
};

export type LeadFields = Omit<Lead, "id" | "thumb" | "createdAt" | "updatedAt" | "waSent">;

export const TEXT_FIELDS: { key: keyof LeadFields; label: string; vendorLabel?: string; full?: boolean; type?: string }[] = [
  { key: "name", label: "Name" },
  { key: "designation", label: "Designation" },
  { key: "company", label: "Company", full: true },
  { key: "phones", label: "Phone(s)", type: "tel" },
  { key: "whatsapp", label: "WhatsApp number", type: "tel" },
  { key: "email", label: "Email", type: "email" },
  { key: "website", label: "Website" },
  { key: "address", label: "Address", full: true },
  { key: "city", label: "City" },
  { key: "state", label: "State / region" },
  { key: "country", label: "Country" },
  { key: "gst", label: "GST / Reg. no." },
  { key: "products", label: "Their products / business", vendorLabel: "What they supply" },
];

export const emptyLead = (ex = ""): LeadFields => ({
  kind: "Buyer", name: "", designation: "", company: "", phones: "", whatsapp: "", email: "", website: "", address: "",
  city: "", state: "", country: "", gst: "", products: "", notes: "", interest: "", stage: "New", followUp: "",
  visits: [{ ex, at: Date.now() }],
});

/* ---------------- settings ---------------- */

export type Attachment = {
  url: string; // public Vercel Blob URL
  name: string; // shown to buyers, e.g. "Product catalogue"
  fileName: string;
  size: number;
  type: string;
  inMessage: boolean; // add its link to every WhatsApp message
};

export type Exhibition = { id: string; name: string; city: string; start: string; end: string };

export type Settings = {
  tpl: string; // WhatsApp message for buyers
  vendorTpl: string; // WhatsApp message for vendors
  cc: string;
  attachments: Attachment[];
  exhibitions: Exhibition[];
  currentEx: string; // "" = no exhibition
  autoSwitch: boolean; // pick the exhibition whose dates include today
  legacyEx: string; // exhibition given to leads saved before exhibitions existed
  keepPhotos: boolean; // false = card photos are only used for checking, then deleted (a small thumbnail stays)
};

export const DEFAULT_TEMPLATE = `Hello {name},

It was a pleasure meeting you at {exhibition}. I'm Akhil Aggarwal from Bansal Snax — makers of JUST ROASTED, our range of roasted namkeen and healthy snacks.

Sharing my contact details so we can take the conversation forward with {company}. Happy to send our catalogue, price list and samples.

Regards,
Akhil Aggarwal
Bansal Snax`;

export const DEFAULT_VENDOR_TEMPLATE = `Hello {name},

It was nice meeting you at {exhibition}. I'm Akhil Aggarwal from Bansal Snax (JUST ROASTED roasted snacks).

Please share your product list, rates and minimum order quantity for {company}. We'd also like to see samples.

Regards,
Akhil Aggarwal
Bansal Snax`;

export const DEFAULT_SETTINGS: Settings = {
  tpl: DEFAULT_TEMPLATE, vendorTpl: DEFAULT_VENDOR_TEMPLATE, cc: "91", attachments: [],
  exhibitions: [], currentEx: "", autoSwitch: true, legacyEx: "", keepPhotos: true,
};

export function asAttachments(v: unknown): Attachment[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((a) => a && typeof a.url === "string" && a.url.startsWith("https://"))
    .map((a) => ({
      url: a.url,
      name: typeof a.name === "string" && a.name ? a.name : "Catalogue",
      fileName: typeof a.fileName === "string" ? a.fileName : "catalogue.pdf",
      size: typeof a.size === "number" ? a.size : 0,
      type: typeof a.type === "string" ? a.type : "application/pdf",
      inMessage: a.inMessage !== false,
    }));
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function asExhibitions(v: unknown): Exhibition[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((e) => e && typeof e.id === "string" && e.id && typeof e.name === "string")
    .map((e) => ({ id: e.id, name: e.name, city: str(e.city), start: str(e.start), end: str(e.end) }));
}

export function asSettings(d: Record<string, unknown> | undefined): Settings {
  if (!d) return DEFAULT_SETTINGS;
  return {
    tpl: str(d.tpl) || DEFAULT_TEMPLATE,
    vendorTpl: str(d.vendorTpl) || DEFAULT_VENDOR_TEMPLATE,
    cc: str(d.cc) || "91",
    attachments: asAttachments(d.attachments),
    exhibitions: asExhibitions(d.exhibitions),
    currentEx: str(d.currentEx),
    autoSwitch: d.autoSwitch !== false,
    keepPhotos: d.keepPhotos !== false,
    legacyEx: str(d.legacyEx),
  };
}

export const newExId = (name: string) =>
  (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "ex") + "-" + Date.now().toString(36).slice(-4);

/** The exhibition new cards are saved to: today's dated exhibition (if auto-switch), else the one marked current. */
export function effectiveEx(s: Settings): string {
  if (s.autoSwitch) {
    const t = today();
    const hit = s.exhibitions.find((e) => e.start && e.end && e.start <= t && t <= e.end);
    if (hit) return hit.id;
  }
  return s.exhibitions.some((e) => e.id === s.currentEx) ? s.currentEx : "";
}

export const exName = (id: string, s: Settings) => (id ? s.exhibitions.find((e) => e.id === id)?.name || "Unknown exhibition" : "No exhibition");

/* ---------------- dates ---------------- */

export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const fmtDay = (ts: number) => (ts ? new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
export const fmtDayShort = (ts: number) => (ts ? new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");
export const fmtDate = (d: string) => (d ? new Date(d + "T00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

export const isDue = (l: Pick<Lead, "followUp" | "stage">) => !!l.followUp && l.followUp <= today() && !CLOSED.includes(l.stage);

/** e.g. "Indusfood 2026 · 25 Nov 2026" for the latest meeting, plus how many other meetings. */
export function lastVisit(l: Pick<Lead, "visits" | "createdAt">, s: Settings): { label: string; more: number } {
  const v = l.visits.length ? l.visits[l.visits.length - 1] : { ex: "", at: l.createdAt };
  return { label: `${exName(v.ex, s)} · ${fmtDay(v.at)}`, more: Math.max(0, l.visits.length - 1) };
}
export const visitsText = (l: Pick<Lead, "visits">, s: Settings) => l.visits.map((v) => `${exName(v.ex, s)} (${fmtDay(v.at)})`).join("; ");

/* ---------------- companies & duplicates ---------------- */

const LEGAL = /\b(pvt|private|ltd|limited|llp|inc|incorporated|co|company|corp|corporation|the|india|opc|plc|gmbh)\b/g;
/** "Nestlé India Pvt. Ltd." and "NESTLE" both become "nestle". */
export function companyKey(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ")
    .replace(LEGAL, " ").replace(/\s+/g, " ").trim();
}

const phoneTails = (p: string) =>
  p.split(/[,/;]| or /).map((x) => x.replace(/\D/g, "")).filter((x) => x.length >= 8).map((x) => x.slice(-10));
const emails = (e: string) => e.toLowerCase().split(/[,;\s]+/).map((x) => x.trim()).filter((x) => x.includes("@"));
const personKey = (n: string) => n.toLowerCase().replace(/\b(mr|mrs|ms|dr|shri|smt)\b\.?/g, "").replace(/[^a-z]+/g, "");

export type Duplicate = { lead: Lead; reason: string };

/** Finds a saved lead that is the same person (phone, email, or name + company). */
export function findDuplicate(f: Pick<LeadFields, "phones" | "whatsapp" | "email" | "name" | "company">, leads: Lead[], excludeId?: string): Duplicate | null {
  const ph = new Set(phoneTails(`${f.phones},${f.whatsapp}`));
  const em = new Set(emails(f.email));
  const pk = personKey(f.name), ck = companyKey(f.company);
  for (const l of leads) {
    if (l.id === excludeId) continue;
    if (ph.size && phoneTails(`${l.phones},${l.whatsapp}`).some((p) => ph.has(p))) return { lead: l, reason: "same phone number" };
    if (em.size && emails(l.email).some((e) => em.has(e))) return { lead: l, reason: "same email" };
    if (pk.length > 2 && ck && personKey(l.name) === pk && companyKey(l.company) === ck) return { lead: l, reason: "same name and company" };
  }
  return null;
}

/** Other people already saved from the same company. */
export function sameCompany(company: string, leads: Lead[], excludeId?: string): Lead[] {
  const ck = companyKey(company);
  return ck ? leads.filter((l) => l.id !== excludeId && companyKey(l.company) === ck) : [];
}

export type Company = { key: string; name: string; people: Lead[]; kinds: Kind[]; lastAt: number };

export function groupCompanies(leads: Lead[]): Company[] {
  const m = new Map<string, Company>();
  for (const l of leads) {
    const key = companyKey(l.company) || "__none__";
    let c = m.get(key);
    if (!c) m.set(key, (c = { key, name: key === "__none__" ? "No company" : l.company.trim(), people: [], kinds: [], lastAt: 0 }));
    c.people.push(l);
    if (!c.kinds.includes(l.kind)) c.kinds.push(l.kind);
    const at = Math.max(l.createdAt, ...l.visits.map((v) => v.at));
    if (at > c.lastAt) c.lastAt = at;
    if (key !== "__none__" && l.company.trim().length > c.name.length) c.name = l.company.trim(); // keep the fullest spelling
  }
  return [...m.values()].sort((a, b) => (a.key === "__none__" ? 1 : b.key === "__none__" ? -1 : b.lastAt - a.lastAt));
}

/** Combines a fresh scan into an existing lead: fills blanks, adds new phones/emails, notes and this meeting. */
export function mergeInto(old: Lead, f: LeadFields, ex: string): Partial<Lead> {
  const out: Partial<Lead> = {};
  for (const { key } of TEXT_FIELDS) {
    if (key === "phones" || key === "email") continue;
    const nv = String(f[key] || "").trim();
    if (nv && !String(old[key] || "").trim()) (out as Record<string, string>)[key] = nv;
  }
  const addList = (a: string, b: string, norm: (x: string) => string) => {
    const items = a.split(",").map((x) => x.trim()).filter(Boolean);
    const seen = new Set(items.map(norm));
    for (const x of b.split(",").map((y) => y.trim()).filter(Boolean)) if (!seen.has(norm(x))) { items.push(x); seen.add(norm(x)); }
    return items.join(", ");
  };
  const phones = addList(old.phones, f.phones, (x) => x.replace(/\D/g, "").slice(-10));
  if (phones !== old.phones) out.phones = phones;
  const email = addList(old.email, f.email, (x) => x.toLowerCase());
  if (email !== old.email) out.email = email;
  if (f.notes.trim()) out.notes = old.notes.trim() ? `${old.notes.trim()}\n${fmtDayShort(Date.now())}: ${f.notes.trim()}` : f.notes.trim();
  if (f.interest) out.interest = f.interest;
  if (f.followUp) out.followUp = f.followUp;
  const last = old.visits[old.visits.length - 1];
  const sameDay = last && last.ex === ex && fmtDay(last.at) === fmtDay(Date.now());
  if (!sameDay) out.visits = [...old.visits, { ex, at: Date.now() }];
  return out;
}

/* ---------------- WhatsApp ---------------- */

/** The WhatsApp text: the buyer or vendor template, filled in. Buyers also get catalogue links. */
export function buildMessage(l: Pick<LeadFields, "name" | "company"> & Partial<Pick<LeadFields, "kind" | "visits">>, s: Settings): string {
  const vendor = l.kind === "Vendor";
  const v = l.visits?.length ? l.visits[l.visits.length - 1] : null;
  const exhibition = v?.ex ? exName(v.ex, s) : "the exhibition";
  let msg = ((vendor ? s.vendorTpl || DEFAULT_VENDOR_TEMPLATE : s.tpl) || DEFAULT_TEMPLATE)
    .replaceAll("{name}", l.name.trim() || "there")
    .replaceAll("{company}", l.company.trim() || "your company")
    .replaceAll("{exhibition}", exhibition);
  const links = vendor ? "" : s.attachments.filter((a) => a.inMessage).map((a) => `${a.name}: ${a.url}`).join("\n");
  if (msg.includes("{catalogue}")) msg = msg.replaceAll("{catalogue}", links);
  else if (links) msg += "\n\n" + links;
  return msg.trim();
}

export const fmtSize = (b: number) => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");

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

export function waLink(l: Pick<LeadFields, "whatsapp" | "phones" | "name" | "company"> & Partial<Pick<LeadFields, "kind" | "visits">>, s: Settings): string {
  const n = waNumber(l.whatsapp || l.phones, s.cc);
  if (n.length < 8) return "";
  return `https://wa.me/${n}?text=${encodeURIComponent(buildMessage(l, s))}`;
}

/* ---------------- export ---------------- */

const CSV_COLS: (keyof Lead)[] = ["kind", "name", "designation", "company", "phones", "whatsapp", "email", "website", "address", "city", "state", "country", "gst", "products", "interest", "stage", "followUp", "notes"];
const CSV_HEAD = ["Type", "Name", "Designation", "Company", "Phones", "WhatsApp", "Email", "Website", "Address", "City", "State", "Country", "GST", "Products / supplies", "Interest", "Stage", "Follow-up", "Notes", "Exhibition", "First met", "All meetings", "WhatsApp sent"];

export function toRows(leads: Lead[], s: Settings): string[][] {
  return [CSV_HEAD, ...leads.map((l) => [
    ...CSV_COLS.map((k) => String(l[k] ?? "")),
    exName(l.visits[0]?.ex || "", s), fmtDay(l.visits[0]?.at || l.createdAt), visitsText(l, s), l.waSent ? "Yes" : "",
  ])];
}

export function downloadCsv(leads: Lead[], s: Settings, label: string) {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = "﻿" + toRows(leads, s).map((r) => r.map(q).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "leads"}-${today()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const toTsv = (leads: Lead[], s: Settings) => toRows(leads, s).map((r) => r.map((v) => v.replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");

/* ---------------- storage ---------------- */

/** Normalises a stored document into a full Lead (older or partial docs get defaults). */
export function asLead(id: string, d: Record<string, unknown>, legacyEx = ""): Lead {
  const base = emptyLead();
  const out = { ...base } as Record<string, unknown>;
  for (const k of Object.keys(base)) if (typeof d[k] === "string") out[k] = d[k];
  const createdAt = typeof d.createdAt === "number" ? d.createdAt : 0;
  const waSent = typeof d.waSent === "number" ? d.waSent : 0;
  const kind: Kind = d.kind === "Vendor" ? "Vendor" : "Buyer";
  out.kind = kind;
  if (!stagesFor(kind).includes(out.stage as string)) out.stage = waSent ? "Contacted" : "New";
  if (!["", "Hot", "Warm", "Cold"].includes(out.interest as string)) out.interest = "";
  const visits = Array.isArray(d.visits)
    ? (d.visits as unknown[]).filter((v): v is Visit => !!v && typeof (v as Visit).at === "number").map((v) => ({ ex: str(v.ex), at: v.at }))
    : [];
  out.visits = visits.length ? visits : [{ ex: legacyEx, at: createdAt }];
  return {
    ...(out as LeadFields),
    id,
    thumb: typeof d.thumb === "string" && d.thumb.startsWith("data:image/jpeg;base64,") ? d.thumb : "",
    createdAt,
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
