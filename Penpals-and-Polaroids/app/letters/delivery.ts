import { createClient } from "../../utils/supabase/server";

export type DeliveryStatus =
  | "preparing"
  | "posted"
  | "processing_origin"
  | "departed_origin"
  | "international_transit"
  | "arrived_destination"
  | "out_for_delivery"
  | "delivered"
  | "delivery_exception";

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

export type DeliveryPlan = {
  destinationCountryCode: string;
  estimatedDeliveryAt: Date;
  events: {
    event_country_code: string | null;
    event_description: string;
    event_label: string;
    scheduled_at: string;
    status: DeliveryStatus;
  }[];
  originCountryCode: string;
  rangeLabel: string;
  trackingReference: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const continentByCountry: Record<string, string> = {
  AR: "SA",
  AU: "OC",
  BR: "SA",
  CA: "NA",
  CN: "AS",
  DE: "EU",
  EG: "AF",
  ES: "EU",
  FR: "EU",
  GB: "EU",
  IE: "EU",
  IN: "AS",
  IT: "EU",
  JP: "AS",
  KE: "AF",
  KR: "AS",
  MA: "AF",
  MX: "NA",
  NG: "AF",
  NL: "EU",
  NO: "EU",
  NZ: "OC",
  PH: "AS",
  PK: "AS",
  PL: "EU",
  RU: "EU",
  SA: "AS",
  SE: "EU",
  TH: "AS",
  TR: "AS",
  UA: "EU",
  US: "NA",
  VN: "AS",
  ZA: "AF",
};

const countryCodes: Record<string, string> = {
  argentina: "AR",
  australia: "AU",
  brazil: "BR",
  canada: "CA",
  china: "CN",
  egypt: "EG",
  england: "GB",
  france: "FR",
  germany: "DE",
  india: "IN",
  ireland: "IE",
  italy: "IT",
  japan: "JP",
  kenya: "KE",
  mexico: "MX",
  morocco: "MA",
  netherlands: "NL",
  nigeria: "NG",
  norway: "NO",
  pakistan: "PK",
  philippines: "PH",
  poland: "PL",
  russia: "RU",
  "saudi arabia": "SA",
  scotland: "GB",
  "south africa": "ZA",
  "south korea": "KR",
  spain: "ES",
  sweden: "SE",
  thailand: "TH",
  turkey: "TR",
  uk: "GB",
  ukraine: "UA",
  "united kingdom": "GB",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  vietnam: "VN",
  wales: "GB",
  "new zealand": "NZ",
};

const nearbyPairs = new Set([
  "GB-IE",
  "IE-GB",
  "FR-DE",
  "DE-FR",
  "FR-ES",
  "ES-FR",
  "US-CA",
  "CA-US",
  "US-MX",
  "MX-US",
  "CN-JP",
  "JP-CN",
  "JP-KR",
  "KR-JP",
  "TH-VN",
  "VN-TH",
  "AU-NZ",
  "NZ-AU",
]);

const remoteCountries = new Set(["NZ", "AU", "ZA", "AR"]);

const eventPlan: Array<{
  description: string;
  label: string;
  percent: number;
  status: DeliveryStatus;
  useCountry: "origin" | "destination" | null;
}> = [
  {
    description: "Your letter has been prepared for its virtual postal journey.",
    label: "Letter prepared",
    percent: 0,
    status: "preparing",
    useCountry: "origin",
  },
  {
    description: "Your letter has been posted. Good letters take time.",
    label: "Posted",
    percent: 5,
    status: "posted",
    useCountry: "origin",
  },
  {
    description: "It is being prepared for its international journey.",
    label: "Processed at origin",
    percent: 15,
    status: "processing_origin",
    useCountry: "origin",
  },
  {
    description: "It has departed the sender's country.",
    label: "Departed origin country",
    percent: 30,
    status: "departed_origin",
    useCountry: "origin",
  },
  {
    description: "It is travelling across the world.",
    label: "International transit",
    percent: 50,
    status: "international_transit",
    useCountry: null,
  },
  {
    description: "It has arrived in the destination country.",
    label: "Arrived in destination country",
    percent: 80,
    status: "arrived_destination",
    useCountry: "destination",
  },
  {
    description: "It is out for delivery.",
    label: "Out for delivery",
    percent: 95,
    status: "out_for_delivery",
    useCountry: "destination",
  },
  {
    description: "Your letter has arrived.",
    label: "Delivered",
    percent: 100,
    status: "delivered",
    useCountry: "destination",
  },
];

function normaliseCountry(country: string) {
  return country.trim().toLowerCase();
}

export function countryCodeFor(country: string) {
  const normalised = normaliseCountry(country);

  return countryCodes[normalised] ?? normalised.slice(0, 2).toUpperCase();
}

function routeRange(origin: string, destination: string) {
  const pair = `${origin}-${destination}`;
  const originContinent = continentByCountry[origin];
  const destinationContinent = continentByCountry[destination];

  if (origin === destination) {
    return { label: "approximately 1-3 days", max: 3, min: 1 };
  }

  if (nearbyPairs.has(pair)) {
    return { label: "approximately 2-5 days", max: 5, min: 2 };
  }

  if (originContinent && originContinent === destinationContinent) {
    return { label: "approximately 3-7 days", max: 7, min: 3 };
  }

  if (remoteCountries.has(origin) || remoteCountries.has(destination)) {
    return { label: "approximately 7-16 days", max: 16, min: 7 };
  }

  return { label: "approximately 5-12 days", max: 12, min: 5 };
}

function deliveryDurationMs(range: { max: number; min: number }) {
  const testMinutes = Number(process.env.PNP_DELIVERY_TEST_MINUTES ?? "");

  if (process.env.NODE_ENV !== "production" && Number.isFinite(testMinutes) && testMinutes > 0) {
    return Math.round(testMinutes * 60 * 1000);
  }

  const days = range.min + Math.random() * (range.max - range.min);

  return Math.round(days * DAY_MS);
}

function trackingSuffix() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
}

export function createDeliveryPlan({
  destinationCountry,
  originCountry,
  postedAt = new Date(),
}: {
  destinationCountry: string;
  originCountry: string;
  postedAt?: Date;
}): DeliveryPlan {
  const originCountryCode = countryCodeFor(originCountry);
  const destinationCountryCode = countryCodeFor(destinationCountry);
  const range = routeRange(originCountryCode, destinationCountryCode);
  const duration = deliveryDurationMs(range);
  const estimatedDeliveryAt = new Date(postedAt.getTime() + duration);
  const trackingReference = `PP-${originCountryCode}-${destinationCountryCode}-${trackingSuffix()}`;

  return {
    destinationCountryCode,
    estimatedDeliveryAt,
    events: eventPlan.map((event) => {
      const scheduledAt = new Date(postedAt.getTime() + duration * (event.percent / 100));

      return {
        event_country_code:
          event.useCountry === "origin"
            ? originCountryCode
            : event.useCountry === "destination"
              ? destinationCountryCode
              : null,
        event_description: event.description,
        event_label: event.label,
        scheduled_at: scheduledAt.toISOString(),
        status: event.status,
      };
    }),
    originCountryCode,
    rangeLabel: range.label,
    trackingReference,
  };
}

type DueEvent = {
  id: string;
  letter_id: string;
  scheduled_at: string;
  status: DeliveryStatus;
};

type DueLetter = {
  delivered_at?: string | null;
  estimated_delivery_at: string;
  id: string;
  recipient_id: string;
  sender_id: string;
};

export async function reconcileDeliveries(supabase: SupabaseLike) {
  await supabase.rpc("process_due_deliveries");
}

export function isDelivered(letter: { delivered_at?: string | null; estimated_delivery_at?: string | null }) {
  return Boolean(letter.delivered_at) || Boolean(letter.estimated_delivery_at && new Date(letter.estimated_delivery_at) <= new Date());
}
