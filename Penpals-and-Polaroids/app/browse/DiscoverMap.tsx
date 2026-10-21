"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SafetyActions } from "../safety/SafetyActions";

export type DiscoverProfile = {
  acceptingNewPenPals: boolean;
  bio: string;
  country: string;
  id: string;
  interests: string[];
  languages: string[];
  name: string;
  photoUrl?: string;
  scrapbookHref?: string;
};

type CountryPoint = {
  aliases?: string[];
  label: string;
  x: number;
  y: number;
};

const countryPoints: CountryPoint[] = [
  { label: "United States", aliases: ["usa", "us", "united states of america"], x: 22, y: 40 },
  { label: "Canada", x: 20, y: 27 },
  { label: "Mexico", x: 19, y: 52 },
  { label: "Brazil", x: 34, y: 70 },
  { label: "Argentina", x: 32, y: 83 },
  { label: "United Kingdom", aliases: ["uk", "england", "scotland", "wales"], x: 46, y: 34 },
  { label: "Ireland", x: 44, y: 35 },
  { label: "France", x: 48, y: 41 },
  { label: "Spain", x: 46, y: 45 },
  { label: "Germany", x: 51, y: 38 },
  { label: "Italy", x: 52, y: 45 },
  { label: "Netherlands", x: 49, y: 37 },
  { label: "Norway", x: 51, y: 27 },
  { label: "Sweden", x: 54, y: 28 },
  { label: "Poland", x: 54, y: 38 },
  { label: "Ukraine", x: 58, y: 40 },
  { label: "Russia", x: 69, y: 31 },
  { label: "Morocco", x: 46, y: 51 },
  { label: "Egypt", x: 55, y: 54 },
  { label: "Nigeria", x: 50, y: 62 },
  { label: "Kenya", x: 58, y: 67 },
  { label: "South Africa", x: 55, y: 83 },
  { label: "Turkey", x: 57, y: 46 },
  { label: "Saudi Arabia", x: 60, y: 56 },
  { label: "India", x: 69, y: 58 },
  { label: "Pakistan", x: 66, y: 54 },
  { label: "China", x: 76, y: 47 },
  { label: "Japan", x: 86, y: 45 },
  { label: "South Korea", x: 83, y: 46 },
  { label: "Thailand", x: 75, y: 63 },
  { label: "Vietnam", x: 78, y: 62 },
  { label: "Philippines", x: 82, y: 64 },
  { label: "Indonesia", x: 79, y: 72 },
  { label: "Australia", x: 84, y: 82 },
  { label: "New Zealand", x: 91, y: 88 },
];

const countryLookup = new Map(
  countryPoints.flatMap((point) => [
    [normalise(point.label), point],
    ...(point.aliases ?? []).map((alias) => [normalise(alias), point] as const),
  ]),
);

function normalise(value: string) {
  return value.trim().toLowerCase();
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function profileMatches(profile: DiscoverProfile, filters: {
  acceptingOnly: boolean;
  country: string;
  interest: string;
  language: string;
}) {
  return (
    (!filters.acceptingOnly || profile.acceptingNewPenPals) &&
    (!filters.country || profile.country === filters.country) &&
    (!filters.language || profile.languages.includes(filters.language)) &&
    (!filters.interest || profile.interests.includes(filters.interest))
  );
}

export function DiscoverMap({
  initialSelectedCountry = "",
  profiles,
}: {
  initialSelectedCountry?: string;
  profiles: DiscoverProfile[];
}) {
  const [country, setCountry] = useState("");
  const [language, setLanguage] = useState("");
  const [interest, setInterest] = useState("");
  const [acceptingOnly, setAcceptingOnly] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState(initialSelectedCountry);
  const [selectedProfileIndex, setSelectedProfileIndex] = useState(0);
  const previewRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setSelectedCountry(initialSelectedCountry);
    setSelectedProfileIndex(0);
  }, [initialSelectedCountry]);

  const options = useMemo(
    () => ({
      countries: Array.from(new Set(profiles.map((profile) => profile.country))).sort(),
      interests: Array.from(new Set(profiles.flatMap((profile) => profile.interests))).sort(),
      languages: Array.from(new Set(profiles.flatMap((profile) => profile.languages))).sort(),
    }),
    [profiles],
  );

  const groupedProfiles = useMemo(() => {
    const groups = new Map<string, { point: CountryPoint; profiles: DiscoverProfile[] }>();
    const filters = { acceptingOnly, country, interest, language };

    profiles
      .filter((profile) => profileMatches(profile, filters))
      .forEach((profile) => {
        const point = countryLookup.get(normalise(profile.country));

        if (!point) {
          return;
        }

        const existing = groups.get(point.label);

        if (existing) {
          existing.profiles.push(profile);
        } else {
          groups.set(point.label, { point, profiles: [profile] });
        }
      });

    return Array.from(groups.values()).sort((a, b) =>
      a.point.label.localeCompare(b.point.label),
    );
  }, [acceptingOnly, country, interest, language, profiles]);

  const selectedGroup = groupedProfiles.find(
    (group) => group.point.label === selectedCountry,
  );
  const selectedProfile = selectedGroup?.profiles[
    Math.min(selectedProfileIndex, Math.max(selectedGroup.profiles.length - 1, 0))
  ];

  useEffect(() => {
    if (!selectedProfile) {
      return;
    }

    previewRef.current?.focus({ preventScroll: true });

    if (window.matchMedia("(max-width: 860px)").matches) {
      previewRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedProfile]);

  function selectPin(countryLabel: string) {
    setSelectedCountry(countryLabel);
    setSelectedProfileIndex(0);
  }

  return (
    <section className="discoverExperience" aria-label="Country-level pen pal map">
      <details className="discoverFilters" open>
        <summary>Filter passports</summary>
        <div className="discoverFilterGrid">
          <label htmlFor="country-filter">
            Country
            <select
              id="country-filter"
              name="country"
              value={country}
              onChange={(event) => {
                setCountry(event.target.value);
                setSelectedCountry("");
              }}
            >
              <option value="">Any country</option>
              {options.countries.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label htmlFor="language-filter">
            Language
            <select
              id="language-filter"
              name="language"
              value={language}
              onChange={(event) => {
                setLanguage(event.target.value);
                setSelectedCountry("");
              }}
            >
              <option value="">Any language</option>
              {options.languages.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label htmlFor="interest-filter">
            Interests
            <select
              id="interest-filter"
              name="interest"
              value={interest}
              onChange={(event) => {
                setInterest(event.target.value);
                setSelectedCountry("");
              }}
            >
              <option value="">Any interest</option>
              {options.interests.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="acceptingFilter" htmlFor="accepting-filter">
            <input
              checked={acceptingOnly}
              id="accepting-filter"
              name="accepting"
              type="checkbox"
              onChange={(event) => {
                setAcceptingOnly(event.target.checked);
                setSelectedCountry("");
              }}
            />
            Accepting new pen pals
          </label>
        </div>
      </details>

      {groupedProfiles.length > 0 ? (
        <div className="discoverMapGrid">
          <div className="travelMap" aria-label="World map with country-level passport pins">
            <svg
              aria-hidden="true"
              className="travelMapArt"
              focusable="false"
              viewBox="0 0 100 60"
            >
              <path d="M7 22c7-11 20-14 31-9 7 3 9 9 4 15-7 8-20 6-28 11-9 6-16-4-7-17Z" />
              <path d="M45 13c8-7 23-7 34 0 8 5 11 14 3 20-9 6-25 2-36 8-11 6-18-15-1-28Z" />
              <path d="M45 37c7-3 20-1 25 7 5 9-2 18-14 13-12-5-23-14-11-20Z" />
              <path d="M73 41c8-3 18 2 19 9 1 6-7 8-15 5-9-3-13-11-4-14Z" />
            </svg>
            {groupedProfiles.map((group) => (
              <Link
                aria-label={`${group.profiles.length} passport${group.profiles.length === 1 ? "" : "s"} from ${group.point.label}`}
                className="mapPinButton"
                data-active={group.point.label === selectedGroup?.point.label}
                href={`/browse?countryPin=${encodeURIComponent(group.point.label)}#passport-preview`}
                key={group.point.label}
                style={{
                  left: `${group.point.x}%`,
                  top: `${group.point.y}%`,
                }}
                onClick={() => selectPin(group.point.label)}
              >
                <span />
                {group.profiles.length > 1 ? <strong>{group.profiles.length}</strong> : null}
              </Link>
            ))}
          </div>

          {selectedProfile && selectedGroup ? (
            <article
              className="passportPreviewCard"
              aria-live="polite"
              id="passport-preview"
              ref={previewRef}
              tabIndex={-1}
            >
              <button
                aria-label="Close Passport preview"
                className="passportPreviewClose"
                type="button"
                onClick={() => {
                  setSelectedCountry("");
                  setSelectedProfileIndex(0);
                }}
              >
                ×
              </button>
              <div className="passportPreviewHeader">
                <div className="passportPreviewPhoto">
                  {selectedProfile.photoUrl ? (
                    <img src={selectedProfile.photoUrl} alt={`${selectedProfile.name} passport photo`} />
                  ) : (
                    <span>{initials(selectedProfile.name)}</span>
                  )}
                </div>
                <div>
                  <p className="passportLabel">Passport preview</p>
                  <h2>{selectedProfile.name}</h2>
                  <p className="passportCountry">{selectedProfile.country}</p>
                  <p
                    className="acceptingStatus"
                    data-accepting={selectedProfile.acceptingNewPenPals}
                  >
                    {selectedProfile.acceptingNewPenPals
                      ? "Accepting new pen pals"
                      : "Not accepting new pen pals"}
                  </p>
                </div>
              </div>

              {selectedGroup.profiles.length > 1 ? (
                <div className="passportSwitcher" aria-label={`Passports from ${selectedGroup.point.label}`}>
                  {selectedGroup.profiles.map((profile, index) => (
                    <button
                      data-active={index === selectedProfileIndex}
                      key={profile.id}
                      type="button"
                      onClick={() => setSelectedProfileIndex(index)}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="passportPreviewSection">
                <p className="passportLabel">Languages</p>
                <div className="passportChips">
                  {selectedProfile.languages.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>

              <div className="passportPreviewSection">
                <p className="passportLabel">Interests</p>
                <div className="passportChips">
                  {selectedProfile.interests.slice(0, 4).map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>

              <div className="passportBio">
                <p className="passportLabel">Short bio</p>
                <p>{selectedProfile.bio}</p>
              </div>

              <div className="passportPreviewActions">
                <Link className="secondaryButton" href={`/profile/${selectedProfile.id}`}>
                  Open Passport
                </Link>
                {selectedProfile.scrapbookHref ? (
                  <Link className="button" href={selectedProfile.scrapbookHref}>
                    Open Scrapbook
                  </Link>
                ) : selectedProfile.acceptingNewPenPals ? (
                  <Link className="button" href={`/compose?recipient=${selectedProfile.id}`}>
                    Write a Letter
                  </Link>
                ) : (
                  <span className="disabledAction" aria-disabled="true">
                    Not accepting letters
                  </span>
                )}
              </div>
              <SafetyActions
                className="safetyActions compactSafetyActions"
                reportedUserId={selectedProfile.id}
                userName={selectedProfile.name}
              />
            </article>
          ) : (
            <aside className="passportPreviewCard passportPreviewPlaceholder">
              <p className="passportLabel">Passport preview</p>
              <h2>Choose a country pin</h2>
              <p>
                Select a pin to preview a Passport without leaving the map.
              </p>
            </aside>
          )}
        </div>
      ) : (
        <section className="browseEmpty" aria-live="polite">
          <h2>No pen pals are available on the map yet.</h2>
          <p>Check back soon for new passports from around the world.</p>
        </section>
      )}
    </section>
  );
}

export function canMapCountry(country: string) {
  return countryLookup.has(normalise(country));
}
