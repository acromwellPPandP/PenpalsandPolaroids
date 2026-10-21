import Link from "next/link";

export type TrackingLetter = {
  delivered_at?: string | null;
  delivery_status?: string | null;
  estimated_delivery_at?: string | null;
  id: string;
  posted_at?: string | null;
  tracking_reference?: string | null;
};

const statusDetails: Record<
  string,
  {
    label: string;
    progress: number;
  }
> = {
  preparing: { label: "Preparing", progress: 0 },
  posted: { label: "Posted", progress: 8 },
  processing_origin: { label: "Processing in origin country", progress: 18 },
  departed_origin: { label: "Departed origin country", progress: 34 },
  international_transit: { label: "Travelling internationally", progress: 58 },
  arrived_destination: { label: "Arrived in destination country", progress: 80 },
  out_for_delivery: { label: "Out for delivery", progress: 94 },
  delivered: { label: "Delivered", progress: 100 },
  delivery_exception: { label: "Journey paused", progress: 50 },
  withdrawn: { label: "Withdrawn", progress: 0 },
};

export function deliveryStatusLabel(status?: string | null) {
  return statusDetails[status ?? ""]?.label ?? "Posted";
}

export function deliveryProgress(status?: string | null) {
  return statusDetails[status ?? ""]?.progress ?? 8;
}

export function formatTrackingReference(letter: TrackingLetter) {
  return (
    letter.tracking_reference ??
    `PP-${letter.id.replaceAll("-", "").slice(0, 8).toUpperCase()}`
  );
}

export function formatDeliveryDate(value?: string | null) {
  if (!value) {
    return "Not available yet";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatPostedDate(value?: string | null) {
  if (!value) {
    return "Date not available";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function trackingHref(letterId: string) {
  return `/letters/${letterId}/tracking`;
}

export function CompactTrackingProgress({
  destinationLabel,
  letter,
  originLabel,
}: {
  destinationLabel: string;
  letter: TrackingLetter;
  originLabel: string;
}) {
  const progress = deliveryProgress(letter.delivery_status);
  const status = deliveryStatusLabel(letter.delivery_status);

  return (
    <div
      className="compactTrackingProgress"
      aria-label={`${status}. Route from ${originLabel} to ${destinationLabel}, ${progress}% complete.`}
    >
      <div className="compactTrackingLabels">
        <span>{originLabel}</span>
        <strong>{status}</strong>
        <span>{destinationLabel}</span>
      </div>
      <div className="compactTrackingLine" aria-hidden="true">
        <i style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export function TrackLetterLink({
  className = "secondaryButton",
  letterId,
}: {
  className?: string;
  letterId: string;
}) {
  return (
    <Link className={className} href={trackingHref(letterId)}>
      Track Letter
    </Link>
  );
}
