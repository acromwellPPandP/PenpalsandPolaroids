import Link from "next/link";
import type { Metadata } from "next";
import { isSupabaseConfigured } from "../utils/supabase/config";
import { createClient } from "../utils/supabase/server";

export const metadata: Metadata = {
  title: "Home | Penpals & Polaroids",
};

const steps = [
  {
    number: "①",
    title: "Create Your Passport",
    text: "Create your personal passport with your country, languages, interests and story.",
  },
  {
    number: "②",
    title: "Write a Letter",
    text: "Every letter includes exactly one Polaroid that captures a moment from your world.",
  },
  {
    number: "③",
    title: "Build Your Scrapbook",
    text: "Every exchanged letter becomes part of a shared scrapbook full of memories.",
  },
];

const features = [
  {
    icon: "🌍",
    title: "International Community",
    text: "Meet people from countries across the globe.",
  },
  {
    icon: "📷",
    title: "One Polaroid Every Letter",
    text: "Every letter includes one meaningful photograph.",
  },
  {
    icon: "📔",
    title: "Shared Scrapbooks",
    text: "Collect memories instead of messages.",
  },
  {
    icon: "🛂",
    title: "Passport Profiles",
    text: "Your profile feels like a travel passport.",
  },
  {
    icon: "✉️",
    title: "Thoughtful Letters",
    text: "Slow conversations that encourage meaningful connections.",
  },
  {
    icon: "🕊",
    title: "Calm Experience",
    text: "No likes. No followers. No popularity contests.",
  },
];

export default async function Home() {
  const isConfigured = isSupabaseConfigured();
  const supabase = isConfigured ? await createClient() : null;
  const {
    data: { user },
  } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null } };

  return (
    <main className="homePage">
      <section className="hero journalHero">
        <nav className="nav" aria-label="Primary navigation">
          <Link className="brand" href="/">
            <img className="brandMark" src="/penpals-polaroids-logo.png" alt="" />
            Penpals & Polaroids
          </Link>
          <Link className="navLink" href={user ? "/dashboard" : "/login"}>
            {user ? "🏠 Home" : "Sign In"}
          </Link>
        </nav>

        <div className="heroGrid journalHeroGrid">
          <div className="heroCopy journalHeroCopy">
            <p className="eyebrow">Opening a travel journal</p>
            <div className="heroLockup">
              <img
                className="heroLogo"
                src="/penpals-polaroids-logo.png"
                alt="Penpals & Polaroids"
              />
              <h1>
                Real friendships.{" "}
                <span>One Letter.</span>
                {" "}
                <span>One Photograph.</span>
              </h1>
            </div>
            <p className="intro">
              Connect with people across the world through thoughtful letters
              and meaningful photographs.
            </p>
            <p className="heroPromise">
              No endless scrolling. No likes. Just genuine conversations that
              become lasting memories.
            </p>
            <div className="actions">
              <Link
                className="button"
                id="start"
                href={user ? "/profile" : "/signup"}
              >
                Create Your Passport
              </Link>
              <Link className="secondaryButton" href={user ? "/browse" : "/signup"}>
                Discover Pen Pals
              </Link>
            </div>
          </div>

          <figure className="heroPhoto" aria-label="Vintage desk with a travel journal, Polaroid and warm stationery">
            <img
              src="/dashboard-writing-background.png"
              alt="A warm vintage desk with a notebook, pen, copper mug and Penpals & Polaroids photo"
            />
            <figcaption>Letters, Polaroids, passports and quiet beginnings.</figcaption>
          </figure>
        </div>
      </section>

      <section className="section" aria-labelledby="how-it-works">
        <div className="sectionHeader">
          <p className="eyebrow">How it works</p>
          <h2 id="how-it-works">A simpler way to make the world feel close.</h2>
        </div>

        <div className="steps">
          {steps.map((step) => (
            <article className="step" key={step.number}>
              <p className="stepNumber">{step.number}</p>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="missionSection" aria-labelledby="mission-title">
        <div className="missionPanel">
          <p className="eyebrow">Mission</p>
          <h2 id="mission-title">Friendship Without Borders</h2>
          <p>
            Penpals & Polaroids exists to bring people from around the world
            together through meaningful letters and shared photographs.
          </p>
          <p>
            Discover new cultures, learn about everyday life and create genuine
            friendships one letter at a time.
          </p>
        </div>
      </section>

      <section className="featureSection" aria-labelledby="feature-title">
        <div className="sectionHeader">
          <p className="eyebrow">What makes it different</p>
          <h2 id="feature-title">A calmer way to meet the world.</h2>
        </div>

        <div className="featureGrid">
          {features.map((feature) => (
            <article className="featureCard" key={feature.title}>
              <span className="featureIcon" aria-hidden="true">
                {feature.icon}
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="worldSection" aria-labelledby="world-title">
        <div className="worldMap" aria-hidden="true">
          <span className="continent continentOne" />
          <span className="continent continentTwo" />
          <span className="continent continentThree" />
          <span className="continent continentFour" />
          <span className="mapLine mapLineOne" />
          <span className="mapLine mapLineTwo" />
          <span className="mapPin mapPinOne" />
          <span className="mapPin mapPinTwo" />
          <span className="mapPin mapPinThree" />
        </div>
        <div className="worldCopy">
          <p className="eyebrow">World map</p>
          <h2 id="world-title">Your Journey Starts Here</h2>
          <p>
            Every new friendship adds another chapter to your journey around
            the world.
          </p>
          <p className="futureNote">
            In future this will become an interactive map.
          </p>
        </div>
      </section>

      <section className="homeCta" aria-labelledby="cta-title">
        <p className="eyebrow">Begin slowly</p>
        <h2 id="cta-title">Your next letter could change your world.</h2>
        <Link className="button" href={user ? "/profile" : "/signup"}>
          Create Your Passport
        </Link>
      </section>

      <footer className="homeFooter" aria-label="Footer">
        <Link href="/">About</Link>
        <Link href="/">Community Guidelines</Link>
        <Link href="/">Privacy Policy</Link>
        <Link href="/">Contact</Link>
        <Link href="/">FAQ</Link>
      </footer>
    </main>
  );
}
