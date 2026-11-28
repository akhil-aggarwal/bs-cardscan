// Locations: city name variants, Indian city → state, country names, and the smart search used by the dashboard.
import { exName, type Lead, type Settings } from "./leads";

/** Different spellings of the same city. First name is the one shown. */
const CITY_GROUPS: string[][] = [
  ["Kochi", "Cochin", "Ernakulam"], ["Bengaluru", "Bangalore"], ["Mumbai", "Bombay", "Navi Mumbai"], ["Kolkata", "Calcutta"],
  ["Chennai", "Madras"], ["Gurugram", "Gurgaon"], ["Thiruvananthapuram", "Trivandrum"], ["Kozhikode", "Calicut"],
  ["Mysuru", "Mysore"], ["Mangaluru", "Mangalore"], ["Puducherry", "Pondicherry"], ["Vadodara", "Baroda"], ["Pune", "Poona"],
  ["Prayagraj", "Allahabad"], ["Varanasi", "Benares", "Banaras", "Kashi"], ["Visakhapatnam", "Vizag"], ["Thrissur", "Trichur"],
  ["Tiruchirappalli", "Trichy"], ["Kanpur", "Cawnpore"], ["Belagavi", "Belgaum"], ["Hubballi", "Hubli"], ["Kalaburagi", "Gulbarga"],
  ["Delhi", "New Delhi"], ["Noida", "Greater Noida"], ["Panaji", "Panjim"], ["Shimla", "Simla"], ["Odisha", "Orissa"],
  ["Ho Chi Minh City", "Saigon"], ["Yangon", "Rangoon"], ["Beijing", "Peking"], ["New York", "NYC"],
];

/** Major Indian cities → state, so older cards without a state still filter correctly. */
const CITY_STATE: Record<string, string> = {
  kochi: "Kerala", thiruvananthapuram: "Kerala", kozhikode: "Kerala", thrissur: "Kerala", kollam: "Kerala", kannur: "Kerala", alappuzha: "Kerala", kottayam: "Kerala", palakkad: "Kerala",
  bengaluru: "Karnataka", mysuru: "Karnataka", mangaluru: "Karnataka", hubballi: "Karnataka", belagavi: "Karnataka", kalaburagi: "Karnataka", davanagere: "Karnataka",
  chennai: "Tamil Nadu", coimbatore: "Tamil Nadu", madurai: "Tamil Nadu", tiruchirappalli: "Tamil Nadu", salem: "Tamil Nadu", tiruppur: "Tamil Nadu", erode: "Tamil Nadu", tirunelveli: "Tamil Nadu",
  hyderabad: "Telangana", secunderabad: "Telangana", warangal: "Telangana",
  visakhapatnam: "Andhra Pradesh", vijayawada: "Andhra Pradesh", guntur: "Andhra Pradesh", tirupati: "Andhra Pradesh", nellore: "Andhra Pradesh",
  mumbai: "Maharashtra", pune: "Maharashtra", nagpur: "Maharashtra", nashik: "Maharashtra", aurangabad: "Maharashtra", thane: "Maharashtra", kolhapur: "Maharashtra", solapur: "Maharashtra", amravati: "Maharashtra",
  ahmedabad: "Gujarat", surat: "Gujarat", vadodara: "Gujarat", rajkot: "Gujarat", bhavnagar: "Gujarat", jamnagar: "Gujarat", gandhinagar: "Gujarat", anand: "Gujarat",
  jaipur: "Rajasthan", jodhpur: "Rajasthan", udaipur: "Rajasthan", kota: "Rajasthan", bikaner: "Rajasthan", ajmer: "Rajasthan", alwar: "Rajasthan",
  delhi: "Delhi", gurugram: "Haryana", faridabad: "Haryana", panipat: "Haryana", sonipat: "Haryana", karnal: "Haryana", ambala: "Haryana", hisar: "Haryana", rohtak: "Haryana",
  noida: "Uttar Pradesh", ghaziabad: "Uttar Pradesh", lucknow: "Uttar Pradesh", kanpur: "Uttar Pradesh", agra: "Uttar Pradesh", varanasi: "Uttar Pradesh", meerut: "Uttar Pradesh", prayagraj: "Uttar Pradesh", bareilly: "Uttar Pradesh", aligarh: "Uttar Pradesh", moradabad: "Uttar Pradesh", gorakhpur: "Uttar Pradesh", mathura: "Uttar Pradesh",
  chandigarh: "Chandigarh", ludhiana: "Punjab", amritsar: "Punjab", jalandhar: "Punjab", patiala: "Punjab", bathinda: "Punjab", mohali: "Punjab",
  dehradun: "Uttarakhand", haridwar: "Uttarakhand", haldwani: "Uttarakhand", shimla: "Himachal Pradesh", srinagar: "Jammu and Kashmir", jammu: "Jammu and Kashmir",
  kolkata: "West Bengal", howrah: "West Bengal", siliguri: "West Bengal", durgapur: "West Bengal", asansol: "West Bengal",
  bhubaneswar: "Odisha", cuttack: "Odisha", rourkela: "Odisha", patna: "Bihar", gaya: "Bihar", muzaffarpur: "Bihar", ranchi: "Jharkhand", jamshedpur: "Jharkhand", dhanbad: "Jharkhand",
  bhopal: "Madhya Pradesh", indore: "Madhya Pradesh", gwalior: "Madhya Pradesh", jabalpur: "Madhya Pradesh", ujjain: "Madhya Pradesh", raipur: "Chhattisgarh", bilaspur: "Chhattisgarh",
  guwahati: "Assam", shillong: "Meghalaya", imphal: "Manipur", agartala: "Tripura", panaji: "Goa", margao: "Goa", puducherry: "Puducherry",
};

const INDIAN_STATES = new Set([
  "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa", "gujarat", "haryana", "himachal pradesh", "jharkhand", "karnataka",
  "kerala", "madhya pradesh", "maharashtra", "manipur", "meghalaya", "mizoram", "nagaland", "odisha", "orissa", "punjab", "rajasthan", "sikkim",
  "tamil nadu", "telangana", "tripura", "uttar pradesh", "uttarakhand", "west bengal", "delhi", "jammu and kashmir", "ladakh", "chandigarh", "puducherry",
]);

const COUNTRY_ALIASES: Record<string, string> = {
  india: "India", bharat: "India", in: "India", ind: "India",
  usa: "United States", us: "United States", "u s a": "United States", "u s": "United States", "united states of america": "United States", america: "United States", "united states": "United States",
  uae: "United Arab Emirates", "u a e": "United Arab Emirates", emirates: "United Arab Emirates", dubai: "United Arab Emirates",
  uk: "United Kingdom", "u k": "United Kingdom", britain: "United Kingdom", "great britain": "United Kingdom", england: "United Kingdom",
  ksa: "Saudi Arabia", "saudi": "Saudi Arabia", "kingdom of saudi arabia": "Saudi Arabia",
};

const clean = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const titleCase = (s: string) => s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

const CITY_CANON = new Map<string, string>();
for (const g of CITY_GROUPS) for (const n of g) CITY_CANON.set(clean(n), g[0]);

export const canonCity = (c: string) => {
  const k = clean(c);
  return k ? CITY_CANON.get(k) || titleCase(c.trim()) : "";
};
export const canonCountry = (c: string) => {
  const k = clean(c);
  return k ? COUNTRY_ALIASES[k] || titleCase(c.trim()) : "";
};
export const canonState = (s: string) => {
  const k = clean(s);
  if (!k) return "";
  if (k === "orissa") return "Odisha";
  if (k === "nct of delhi" || k === "new delhi") return "Delhi";
  return titleCase(s.trim()).replace(/\bAnd\b/g, "and");
};

export type Place = { city: string; state: string; country: string };

/** A card's location, tidied up and with blanks filled in where it's safe (e.g. Bangalore → Bengaluru, Karnataka, India). */
export function placeOf(l: Pick<Lead, "city" | "state" | "country" | "phones" | "whatsapp">): Place {
  const city = canonCity(l.city);
  let state = canonState(l.state);
  let country = canonCountry(l.country);
  if (!state && city) state = CITY_STATE[clean(city)] || "";
  if (!country && (INDIAN_STATES.has(clean(state)) || (city && CITY_STATE[clean(city)]) || /(^|[\s,])\+?91[\s-]?\d/.test(`${l.phones} ${l.whatsapp}`))) country = "India";
  return { city, state, country };
}

/** All the spellings a search word could stand for, e.g. "cochin" → ["cochin", "kochi", "ernakulam"]. */
function variants(token: string): string[] {
  const out = new Set([token]);
  for (const g of CITY_GROUPS) if (g.some((n) => clean(n) === token)) g.forEach((n) => out.add(clean(n)));
  const country = COUNTRY_ALIASES[token];
  if (country) out.add(clean(country));
  if (token.length > 3 && token.endsWith("s")) out.add(token.replace(/(es|s)$/, "")); // "fruits" also finds "fruit"
  return [...out];
}

/** Text a card can be found by: every field, its tidied location, exhibitions, type and stage. */
export function haystack(l: Lead, s: Settings): string {
  const p = placeOf(l);
  return clean([
    l.name, l.designation, l.company, l.phones, l.whatsapp, l.email, l.website, l.address, l.city, l.state, l.country, l.gst,
    l.products, l.notes, l.kind, l.stage, l.interest, p.city, p.state, p.country, ...l.visits.map((v) => exName(v.ex, s)),
  ].join(" "));
}

/** Every word must match somewhere ("Bangalore dry fruits" → Bengaluru cards that mention dry fruit). */
export function matchesSearch(hay: string, query: string): boolean {
  const tokens = clean(query).split(" ").filter(Boolean);
  // keep "united states", "saudi arabia" etc. together
  const words: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const two = tokens[i] + " " + (tokens[i + 1] || "");
    if (tokens[i + 1] && (COUNTRY_ALIASES[two] || CITY_CANON.has(two))) { words.push(two); i++; } else words.push(tokens[i]);
  }
  return words.every((t) => variants(t).some((v) => hay.includes(v)));
}
