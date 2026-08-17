import { ArrowLeft, Cloud, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

type LegalSection = { title: string; paragraphs: string[] };

const privacySections: LegalSection[] = [
  {
    title: "What Nimbus stores",
    paragraphs: [
      "Nimbus stores the account details you provide and the workspace content you create, including tasks, habits, projects, preferences, focus history, rewards, and progress. This information is used only to provide and improve your Nimbus experience.",
      "Account and workspace data is stored in Firebase services and is separated by your authenticated user ID. Nimbus does not sell personal information or use it for advertising.",
    ],
  },
  {
    title: "Google sign-in and Calendar",
    paragraphs: [
      "Google sign-in gives Nimbus your basic profile information so you can access your account. Connecting Google Calendar is optional and requests read-only calendar access so Nimbus can import the calendar you choose and turn upcoming Canvas events into tasks.",
      "Nimbus cannot create, edit, or delete Google Calendar events. The temporary Google Calendar access token stays in the current browser session; it is not written to the Nimbus database. Nimbus stores only the selected calendar ID, its display name, imported event details, and the last sync status. Disconnecting removes the imported items and saved connection details from Nimbus without changing Google Calendar or Canvas.",
    ],
  },
  {
    title: "AI assistance",
    paragraphs: [
      "When you ask Nimbo for help, the text you submit and the minimum workspace context needed to answer it are sent to Firebase AI Logic and Google's Gemini service. Nimbo previews proposed workspace changes and does not apply them until you confirm.",
    ],
  },
  {
    title: "Your choices",
    paragraphs: [
      "You can use Nimbus without connecting Google Calendar, import a local .ics calendar instead, disconnect Calendar at any time, and sign out whenever you choose. You can request deletion of your Nimbus account and associated workspace data by contacting the support address shown below.",
    ],
  },
];

const termsSections: LegalSection[] = [
  {
    title: "Using Nimbus",
    paragraphs: [
      "Nimbus is a planning and productivity tool. You are responsible for the accuracy of information you enter and for reviewing due dates, recommendations, imported calendar events, and AI-generated suggestions before relying on them.",
      "Do not use Nimbus to break the law, interfere with the service, access another person's workspace, or upload content you do not have the right to use.",
    ],
  },
  {
    title: "School and calendar connections",
    paragraphs: [
      "Calendar import is a convenience and may be delayed or incomplete because of changes made by Google, Canvas, a school administrator, or a network filter. Nimbus does not modify your source calendar. Always confirm important deadlines with the official course source.",
    ],
  },
  {
    title: "Rewards and recommendations",
    paragraphs: [
      "Nimbus Points, Breeze Points, forecasts, chests, streak shields, and other rewards are in-app features with no cash value. Task recommendations and Nimbo responses are suggestions, not professional, academic, medical, legal, or financial advice.",
    ],
  },
  {
    title: "Availability",
    paragraphs: [
      "Nimbus is provided as available and may change as the product develops. We work to protect data and keep the service reliable, but no online service can guarantee uninterrupted operation. These terms may be updated when features or legal requirements change.",
    ],
  },
];

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const isPrivacy = kind === "privacy";
  const title = isPrivacy ? "Privacy policy" : "Terms of use";
  const sections = isPrivacy ? privacySections : termsSections;

  return (
    <main className="min-h-screen bg-[#f4f1ff] px-5 py-8 text-[#171522] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d7d1e7] bg-white px-4 text-sm font-black shadow-[0_8px_24px_rgba(45,34,82,.07)] transition-transform hover:-translate-y-0.5">
          <ArrowLeft className="h-4 w-4" /> Back to Nimbus
        </Link>
        <header className="mt-12 border-b border-[#d7d1e7] pb-10 sm:mt-16 sm:pb-14">
          <div className="flex items-center gap-3 text-sm font-black uppercase tracking-[.18em] text-[#6d5dfc]">
            {isPrivacy ? <ShieldCheck className="h-5 w-5" /> : <Cloud className="h-5 w-5" />}
            Nimbus trust center
          </div>
          <h1 className="mt-6 text-[clamp(3.5rem,9vw,7rem)] font-[630] leading-[.86] tracking-[-.07em]">{title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#686177]">
            {isPrivacy ? "A plain-language explanation of what Nimbus uses, where it goes, and what stays under your control." : "The simple rules that keep Nimbus useful, fair, and safe for everyone."}
          </p>
          <p className="mt-5 text-sm font-bold text-[#8a8399]">Effective August 16, 2026</p>
        </header>
        <div className="divide-y divide-[#d7d1e7]">
          {sections.map((section, index) => (
            <section key={section.title} className="grid gap-5 py-10 sm:grid-cols-[3rem_1fr] sm:py-12">
              <span className="text-sm font-black text-[#7c68ef]">0{index + 1}</span>
              <div>
                <h2 className="text-2xl font-[630] tracking-[-.035em]">{section.title}</h2>
                <div className="mt-4 space-y-4 text-base leading-7 text-[#625b72]">
                  {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </div>
            </section>
          ))}
        </div>
        <section className="mt-8 rounded-[2rem] bg-[#171522] p-7 text-white sm:p-10">
          <p className="text-xs font-black uppercase tracking-[.18em] text-[#a99cff]">Questions or deletion requests</p>
          <h2 className="mt-4 text-3xl font-[630] tracking-[-.045em]">Contact Nimbus support.</h2>
          <a href="mailto:sidhvik.daram@gmail.com" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-black text-[#171522] transition-transform hover:-translate-y-0.5">sidhvik.daram@gmail.com</a>
        </section>
        <nav className="flex flex-wrap gap-5 py-10 text-sm font-bold text-[#645d75]" aria-label="Legal pages">
          <Link href="/">Home</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link>
        </nav>
      </div>
    </main>
  );
}
