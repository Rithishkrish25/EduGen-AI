import Link from "next/link";
import HeroDepthVisual from "@/components/landing/HeroDepthVisual";
import { getBackendHealth } from "@/lib/api";

async function isBackendConnected(): Promise<boolean> {
  try {
    await getBackendHealth();
    return true;
  } catch {
    return false;
  }
}

async function BackendStatus() {
  const connected = await isBackendConnected();

  return (
    <span className="inline-flex items-center gap-2 text-xs text-navy-foreground/70">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          connected ? "bg-emerald-400" : "bg-red-400"
        }`}
      />
      {connected
        ? "Platform services online"
        : "Platform services unavailable"}
    </span>
  );
}

const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "Platform", href: "#platform" },
  { label: "Student", href: "#student" },
  { label: "Faculty", href: "#faculty" },
  { label: "Features", href: "#features" },
  { label: "About", href: "#about" },
];

const rolePortals = [
  {
    id: "student",
    title: "Student Portal",
    description:
      "Your syllabus-grounded academic workspace for study, revision, and assessment.",
    features: [
      "AI Notes",
      "Important Questions",
      "Ask AI",
      "Assigned Quizzes",
      "Learning History",
      "Academic Materials",
    ],
    cta: "Student Login",
  },
  {
    id: "faculty",
    title: "Faculty Portal",
    description:
      "An academic workspace for preparing course content and building assessments faster.",
    features: [
      "Academic Materials",
      "AI Question Generation",
      "Question Bank",
      "CO & Bloom Mapping",
      "Quiz Management",
      "Question Paper Generator",
    ],
    cta: "Faculty Login",
  },
  {
    id: "admin",
    title: "Admin Portal",
    description:
      "Institutional oversight of academic structure, users, and platform intelligence.",
    features: [
      "Academic Management",
      "User Management",
      "Staff Approval",
      "Analytics",
      "AI Usage Control",
      "Academic Readiness",
    ],
    cta: "Admin Login",
  },
];

const processSteps = [
  "Academic Subject",
  "Faculty Materials",
  "AI Processing + RAG",
  "Student Learning",
  "Assessment",
  "Academic Readiness",
];

const studentExperience = [
  {
    title: "AI Notes",
    description:
      "Generate short notes, exam notes, revision notes, or key points in English, Tamil, or Tanglish from approved subject material.",
  },
  {
    title: "Important Questions",
    description:
      "Generate exam-style practice questions grouped by marks and difficulty, grounded in approved syllabus materials.",
  },
  {
    title: "Ask from Materials",
    description:
      "Ask academic doubts and receive answers based on approved subject documents with source citations.",
  },
  {
    title: "Assigned Quizzes",
    description:
      "Attend quizzes created and published by faculty, submit securely, and review your result and revision topics.",
  },
  {
    title: "Learning History",
    description:
      "Access previously generated notes, questions, conversations, quiz attempts, and academic learning activity.",
  },
];

const facultyHighlights = [
  "Question Bank",
  "AI-assisted Question Generation",
  "Unit-wise Mark Distribution",
  "Question Pattern Blueprint",
  "Difficulty Distribution",
  "Bloom's Taxonomy",
  "Course Outcome Mapping",
  "Multiple Question Sets",
  "Answer Key Generation",
  "PDF Export",
];

const aiPipeline = [
  "Uploaded Materials",
  "Text Extraction",
  "Embeddings",
  "Relevant Retrieval",
  "AI Provider",
  "Citation-Based Answer",
];

const capabilities = [
  {
    mark: "01",
    title: "Syllabus-Grounded AI",
    description:
      "Generated responses are scoped to approved academic material for the selected subject.",
  },
  {
    mark: "02",
    title: "Document Intelligence",
    description:
      "Academic PDFs, documents, presentations, and text files are processed for retrieval.",
  },
  {
    mark: "03",
    title: "AI Learning",
    description:
      "Structured notes, important questions, and academic doubt solving in one workspace.",
  },
  {
    mark: "04",
    title: "Faculty Assessments",
    description:
      "Faculty can create manual or AI-assisted quizzes and publish them to students.",
  },
  {
    mark: "05",
    title: "Question Paper Automation",
    description:
      "Generate structured question papers using unit, marks, difficulty, CO, and Bloom blueprints.",
  },
  {
    mark: "06",
    title: "CO / Bloom Mapping",
    description:
      "Questions can be mapped to existing Course Outcomes and Bloom taxonomy levels.",
  },
  {
    mark: "07",
    title: "Academic Readiness",
    description:
      "Track subject readiness from units, materials, question bank, quizzes, and question papers.",
  },
  {
    mark: "08",
    title: "Secure Role-Based Access",
    description:
      "Separate governed experiences for students, faculty, and administrators.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      {/* =========================================================
          TOP INFORMATION BAR
      ========================================================== */}
      <div className="bg-navy px-6 py-2 text-navy-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-between text-xs">
          <span className="font-medium tracking-wide">
            EduGen AI{" "}
            <span className="text-navy-foreground/60">&middot;</span>{" "}
            Academic Intelligence Platform
          </span>

          <span className="hidden text-navy-foreground/60 sm:inline">
            Syllabus-Grounded Teaching &amp; Learning
          </span>
        </div>
      </div>

      {/* =========================================================
          MAIN NAVIGATION
      ========================================================== */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <a href="#home" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-sm border border-accent/40 bg-navy text-sm font-bold text-navy-foreground shadow-sm">
              EG
            </span>

            <span className="flex flex-col leading-tight">
              <span className="text-base font-semibold text-foreground">
                EduGen AI
              </span>

              <span className="text-[11px] uppercase tracking-wide text-muted">
                Academic Intelligence Platform
              </span>
            </span>
          </a>

          <nav className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-foreground/80 transition-colors hover:text-primary"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <Link
            href="/login"
            className="rounded-sm bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Login
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* =========================================================
            HERO — 3D VERSION
        ========================================================== */}
        <section
          id="home"
          className="relative isolate min-h-[650px] overflow-hidden border-b border-border bg-background"
        >
          {/* Academic grid */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(11,37,69,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(11,37,69,0.045) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              maskImage:
                "linear-gradient(to bottom, black, transparent 90%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black, transparent 90%)",
            }}
          />

          {/* Main hero glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[520px] bg-[radial-gradient(ellipse_65%_55%_at_50%_0%,rgba(11,37,69,0.10),transparent)]"
          />

          {/* Decorative ambient glows */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-32 top-20 z-0 h-80 w-80 rounded-full bg-primary/[0.035] blur-3xl"
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-32 top-10 z-0 h-96 w-96 rounded-full bg-accent/[0.05] blur-3xl"
          />

          {/* Actual 3D cards */}
          <HeroDepthVisual />

          {/* Hero text */}
          <div className="relative z-10 mx-auto flex min-h-[650px] max-w-7xl items-center px-6">
            <div className="mx-auto flex max-w-3xl flex-col items-center py-20 text-center sm:py-28">
              <span className="section-label">
                Academic Intelligence Platform
              </span>

              <h1
                className="mt-6 text-5xl font-bold tracking-tight text-primary sm:text-7xl"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                EduGen AI
              </h1>

              <p className="mt-4 text-lg font-medium text-foreground sm:text-xl">
                AI-Powered Academic Intelligence Platform
              </p>

              <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
                Smart Learning for Students, Smarter Teaching for Educators.
              </p>

              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
                A syllabus-grounded academic platform that helps students
                learn, faculty prepare academic content, and institutions
                manage intelligent teaching workflows using AI.
              </p>

              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <a
                  href="#platform"
                  className="rounded-sm bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-raised)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-hover"
                >
                  Explore EduGen AI
                </a>

                <Link
                  href="/login"
                  className="rounded-sm border border-border-strong bg-background/90 px-6 py-3 text-sm font-semibold text-foreground shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40"
                >
                  Login to Portal
                </Link>
              </div>
            </div>
          </div>

          {/* Bottom fade */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-24 bg-gradient-to-t from-background to-transparent"
          />
        </section>

        {/* =========================================================
            ROLE PORTALS
        ========================================================== */}
        <section id="platform" className="bg-page px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="text-center">
              <span className="section-label justify-center">
                One Platform
              </span>

              <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Three Academic Experiences
              </h2>

              <p className="mx-auto mt-3 max-w-2xl text-sm text-muted sm:text-base">
                Every role gets a purpose-built academic workspace, governed
                by the same syllabus-grounded platform.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
              {rolePortals.map((portal) => (
                <div
                  key={portal.id}
                  className="group flex flex-col rounded-md border border-border bg-background p-8 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/20 hover:shadow-[var(--shadow-raised)]"
                >
                  <span className="section-label">{portal.title}</span>

                  <p className="mt-4 text-sm leading-relaxed text-muted">
                    {portal.description}
                  </p>

                  <ul className="mt-6 flex flex-1 flex-col gap-2.5 border-t border-border pt-6">
                    {portal.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center gap-2.5 text-sm text-foreground"
                      >
                        <span
                          aria-hidden="true"
                          className="h-1 w-1 shrink-0 rounded-full bg-accent"
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/login"
                    className="mt-8 inline-flex items-center justify-center rounded-sm border border-primary px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    {portal.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* =========================================================
            PLATFORM PROCESS
        ========================================================== */}
        <section className="border-y border-border bg-background px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-5xl text-center">
            <span className="section-label justify-center">
              Core Platform
            </span>

            <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Built Around Your Syllabus
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              Academic structure, faculty materials, AI learning, assessment,
              and readiness work together in one connected workflow.
            </p>
          </div>

          <div className="mx-auto mt-14 flex max-w-5xl flex-col items-stretch gap-0 sm:flex-row sm:items-center">
            {processSteps.map((step, index) => (
              <div key={step} className="flex flex-1 items-center">
                <div className="flex flex-1 flex-col items-center gap-3 px-2 text-center">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-primary text-sm font-semibold text-primary">
                    {index + 1}
                  </span>

                  <span className="text-sm font-medium text-foreground">
                    {step}
                  </span>
                </div>

                {index < processSteps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="mx-1 hidden h-px flex-1 bg-border-strong sm:block"
                  />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* =========================================================
            STUDENT EXPERIENCE
        ========================================================== */}
        <section id="student" className="bg-page px-6 py-20 sm:py-24">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-14 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <span className="section-label">Student Experience</span>

              <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
                Learn With Context, Not Generic AI.
              </h2>

              <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
                Learn from approved subject materials, generate structured
                study content, ask academic questions, and attend
                faculty-published assessments from one workspace.
              </p>

              <Link
                href="/login"
                className="mt-7 inline-flex items-center rounded-sm bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Student Login
              </Link>
            </div>

            <div className="lg:col-span-3">
              <div className="flex flex-col divide-y divide-border rounded-md border border-border bg-background shadow-sm">
                {studentExperience.map((item, index) => (
                  <div
                    key={item.title}
                    className="flex gap-5 p-6 transition-colors hover:bg-surface/60"
                  >
                    <span
                      className="shrink-0 text-sm font-semibold text-accent-hover"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {item.title}
                      </h3>

                      <p className="mt-1.5 text-sm leading-relaxed text-muted">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            FACULTY EXPERIENCE
        ========================================================== */}
        <section
          id="faculty"
          className="border-y border-border bg-background px-6 py-20 sm:py-24"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-14 lg:grid-cols-5">
            <div className="lg:order-2 lg:col-span-2">
              <span className="section-label">Faculty Experience</span>

              <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
                From Syllabus to Assessment.
              </h2>

              <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
                Build question banks, create and publish quizzes, configure
                academic blueprints, map CO and Bloom levels, and generate
                structured question papers with faculty review.
              </p>

              <Link
                href="/login"
                className="mt-7 inline-flex items-center rounded-sm bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Faculty Login
              </Link>
            </div>

            <div className="lg:order-1 lg:col-span-3">
              <div className="rounded-md border border-border bg-page p-2 shadow-sm">
                <div className="rounded-sm border border-border-strong bg-background p-6">
                  <p className="section-label">Flagship Feature</p>

                  <h3 className="mt-2 text-lg font-semibold text-foreground">
                    Question Paper Blueprint &amp; Generator
                  </h3>

                  <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                    {facultyHighlights.map((item) => (
                      <div
                        key={item}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <span
                          aria-hidden="true"
                          className="h-1 w-1 shrink-0 rounded-full bg-accent"
                        />

                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            ACADEMIC AI
        ========================================================== */}
        <section
          id="about"
          className="bg-navy px-6 py-20 text-navy-foreground sm:py-24"
        >
          <div className="mx-auto max-w-5xl text-center">
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
              <span
                aria-hidden="true"
                className="h-px w-6 bg-accent"
              />
              Academic Intelligence
            </span>

            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Academic AI, Grounded in College Materials.
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-navy-foreground/75 sm:text-base">
              EduGen AI retrieves relevant information from approved academic
              material before generation, helping keep learning and
              assessment workflows aligned with the selected subject.
            </p>
          </div>

          <div className="mx-auto mt-14 flex max-w-5xl flex-col items-stretch gap-0 sm:flex-row sm:items-center">
            {aiPipeline.map((step, index) => (
              <div key={step} className="flex flex-1 items-center">
                <div className="flex flex-1 flex-col items-center gap-3 px-2 text-center">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-accent text-xs font-semibold text-accent">
                    {index + 1}
                  </span>

                  <span className="text-xs font-medium text-navy-foreground/90 sm:text-sm">
                    {step}
                  </span>
                </div>

                {index < aiPipeline.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="mx-1 hidden h-px flex-1 bg-navy-foreground/20 sm:block"
                  />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* =========================================================
            PLATFORM CAPABILITIES
        ========================================================== */}
        <section id="features" className="bg-page px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="text-center">
              <span className="section-label justify-center">
                Platform Capabilities
              </span>

              <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                One Connected Academic Platform
              </h2>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {capabilities.map((item) => (
                <div
                  key={item.title}
                  className="flex flex-col gap-2 bg-background p-6 transition-colors hover:bg-surface"
                >
                  <span
                    className="text-xs font-semibold text-accent-hover"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {item.mark}
                  </span>

                  <h3 className="text-sm font-semibold text-foreground">
                    {item.title}
                  </h3>

                  <p className="text-sm leading-relaxed text-muted">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* =========================================================
            FINAL CTA
        ========================================================== */}
        <section className="border-t border-border bg-primary px-6 py-16 text-center">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
            EduGen AI
          </span>

          <h2 className="mt-3 text-2xl font-bold tracking-tight text-primary-foreground sm:text-3xl">
            Transform Academic Learning with EduGen AI.
          </h2>

          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-primary-foreground/70">
            One academic intelligence platform for students, faculty, and
            administrators.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="rounded-sm bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              Student Portal
            </Link>

            <Link
              href="/login"
              className="rounded-sm border border-primary-foreground/30 px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-foreground/10"
            >
              Faculty Portal
            </Link>
          </div>
        </section>
      </main>

      {/* =========================================================
          FOOTER
      ========================================================== */}
      <footer className="bg-navy px-6 py-10 text-navy-foreground">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-accent/40 text-xs font-bold text-navy-foreground">
                EG
              </span>

              <span className="flex flex-col leading-tight">
                <span className="text-sm font-semibold">
                  EduGen AI
                </span>

                <span className="text-[11px] uppercase tracking-wide text-navy-foreground/60">
                  Academic Intelligence Platform
                </span>
              </span>
            </div>

            <div className="mt-4">
              <BackendStatus />
            </div>
          </div>

          <nav className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <a
              href="#student"
              className="text-navy-foreground/75 transition-colors hover:text-navy-foreground"
            >
              Student
            </a>

            <a
              href="#faculty"
              className="text-navy-foreground/75 transition-colors hover:text-navy-foreground"
            >
              Faculty
            </a>

            <Link
              href="/login"
              className="text-navy-foreground/75 transition-colors hover:text-navy-foreground"
            >
              Admin
            </Link>

            <a
              href="#platform"
              className="text-navy-foreground/75 transition-colors hover:text-navy-foreground"
            >
              Platform
            </a>
          </nav>
        </div>

        <p className="mx-auto mt-8 max-w-7xl border-t border-navy-foreground/10 pt-6 text-xs text-navy-foreground/50">
          EduGen AI — Smart Learning for Students, Smarter Teaching for
          Educators.
        </p>
      </footer>
    </div>
  );
}