"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { saveBusinessProfile } from "./actions";
import {
  COUNTRY_OPTIONS,
  EMPTY_PROFILE,
  countryLabel,
  type BusinessProfileDraft,
  type SavedProfile,
  type ProfileDocument,
} from "./types";

const STEPS = ["Company", "Capabilities", "Documents", "Review"];
const ICON_PATHS = {
  business:
    "M3 21h18M5 21V5l7-3 7 3v16M9 8h.01M15 8h.01M9 12h.01M15 12h.01M10 21v-5h4v5",
  capacity: "M4 20V10m5 10V4m6 16v-7m5 7V7",
  document:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5",
  check: "m5 12 4 4L19 6",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  upload: "M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  eye: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  close: "m6 6 12 12M6 18 18 6",
  info: "M12 8h.01M12 11v5M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
} as const;

function Icon({
  name,
  size = 20,
}: {
  name: keyof typeof ICON_PATHS;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

type Errors = Partial<Record<keyof BusinessProfileDraft, string>>;

function validate(profile: BusinessProfileDraft, step: number): Errors {
  if (step === 0)
    return {
      ...(!profile.name.trim() && { name: "Enter your company name." }),
      ...(!profile.country && { country: "Select your company's country." }),
      ...(!profile.city.trim() && { city: "Enter your company's city." }),
      ...(!profile.offerings.trim() && {
        offerings: "Tell us which services or products you offer.",
      }),
    };
  if (step === 1)
    return {
      ...(!profile.coverageScope && {
        coverageScope: "Choose where you can work.",
      }),
      ...(profile.coverageScope === "international" &&
        !profile.coverageCountries.length && {
          coverageCountries: "Select at least one country where you can work.",
        }),
      ...(!profile.capacity.trim() && {
        capacity: "Describe the projects you can take on.",
      }),
      ...(profile.experienceLevel === "experienced" &&
        !profile.experience.trim() && {
          experience:
            "Add an example or select that you are just starting out.",
        }),
    };
  return {};
}

function coverageLabel(profile: BusinessProfileDraft) {
  if (!profile.coverageScope) return "Coverage not specified";
  if (profile.coverageScope === "international")
    return profile.coverageCountries.length
      ? profile.coverageCountries.map(countryLabel).join(", ")
      : "Countries not selected";
  if (!profile.country) return "Coverage not specified";
  if (profile.coverageScope === "local")
    return profile.city.trim()
      ? `${profile.city}, ${countryLabel(profile.country)}`
      : "City not specified";
  return `Nationwide: ${countryLabel(profile.country)}`;
}

const SAMPLE_PROFILE: BusinessProfileDraft = {
  name: "Voltio Electrical",
  country: "ESP",
  city: "Valencia",
  offerings:
    "Electrical installation, maintenance and lighting for offices, shops and public buildings.",
  coverageScope: "national",
  coverageCountries: [],
  capacity:
    "A team of 8 technicians. We handle installations in small and medium-sized buildings, and maintenance contracts for up to 3 sites at a time.",
  experienceLevel: "experienced",
  experience:
    "Upgraded the lighting in a 2,000 m² shopping centre and maintained electrical systems in 3 office buildings over the past 2 years.",
};

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DocumentUpload({
  category,
  title,
  description,
  files,
  recordId,
  disabled,
  onBusyChange,
  onUploaded,
  onRemoved,
}: {
  category: "context" | "legal";
  title: string;
  description: string;
  files: ProfileDocument[];
  recordId: number;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onUploaded: (document: ProfileDocument) => void;
  onRemoved: (id: number) => void;
}) {
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState("");
  const operation = useRef(false);

  async function addFiles(incoming: File[]) {
    if (disabled || operation.current || !incoming.length) return;
    const valid: File[] = [];
    const messages: string[] = [];
    for (const file of incoming) {
      if (!/\.(pdf|doc|docx)$/i.test(file.name))
        messages.push(`${file.name}: use a PDF, DOC or DOCX file.`);
      else if (!file.size) messages.push(`${file.name}: the file is empty.`);
      else if (file.size > 10 * 1024 * 1024)
        messages.push(`${file.name}: the file exceeds 10 MB.`);
      else if (files.length + valid.length >= 5)
        messages.push("You can upload up to 5 files per category.");
      else valid.push(file);
    }
    operation.current = true;
    onBusyChange(true);
    setError("");
    try {
      for (const file of valid) {
        setProgress(`Uploading ${file.name}...`);
        const body = new FormData();
        body.set("file", file);
        body.set("category", category);
        const response = await fetch(
          `/api/business-records/${recordId}/documents`,
          { method: "POST", body },
        );
        const data = await response.json();
        if (!response.ok)
          messages.push(
            `${file.name}: ${data.error?.message ?? "Upload failed. Please try again."}`,
          );
        else onUploaded(data.document);
      }
    } catch {
      messages.push(
        "The upload could not finish. Reload to check which files were saved before trying again.",
      );
    } finally {
      operation.current = false;
      onBusyChange(false);
      setProgress("");
      setError(messages.join(" "));
    }
  }

  async function removeFile(file: ProfileDocument) {
    if (disabled || operation.current) return;
    operation.current = true;
    onBusyChange(true);
    setError("");
    setProgress(`Removing ${file.originalName}...`);
    try {
      const response = await fetch(file.downloadUrl, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          data.error?.message ?? "The file could not be removed.",
        );
      }
      onRemoved(file.id);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The file could not be removed. Please try again.",
      );
    } finally {
      operation.current = false;
      onBusyChange(false);
      setProgress("");
    }
  }

  return (
    <section aria-labelledby={`${category}-title`}>
      <div className="field" style={{ marginBottom: 14 }}>
        <h3 id={`${category}-title`} style={{ fontSize: 16, fontWeight: 500 }}>
          {title} <span className="optional">Optional</span>
        </h3>
        <p className="field-hint">{description}</p>
      </div>
      <div
        className={`upload-zone${dragging ? " dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <Icon name="upload" size={25} />
        <p>Drag your documents here</p>
        <label className="text-button" htmlFor={`upload-${category}`}>
          or choose files
        </label>
        <input
          className="sr-only"
          type="file"
          id={`upload-${category}`}
          accept=".pdf,.doc,.docx"
          multiple
          disabled={disabled}
          aria-describedby={`${category}-file-hint${error ? ` ${category}-file-error` : ""}`}
          onChange={(event) => {
            void addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <small id={`${category}-file-hint`}>
          PDF, DOC or DOCX · Up to 10 MB per file · Up to 5 files
        </small>
      </div>
      <p
        role="status"
        className="field-hint"
        style={{ marginTop: progress ? 10 : 0 }}
      >
        {progress}
      </p>
      {error ? (
        <p
          role="alert"
          className="error-message"
          id={`${category}-file-error`}
          style={{ marginTop: 10 }}
        >
          {error}
        </p>
      ) : null}
      <ul
        className="document-list"
        aria-label={`Files for ${title.toLowerCase()}`}
      >
        {files.map((file) => (
          <li key={file.id}>
            <Icon name="document" />
            <div className="file-details">
              <a href={file.downloadUrl}>{file.originalName}</a>
              <small>
                {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB · Uploaded
              </small>
            </div>
            <button
              type="button"
              className="icon-button"
              disabled={disabled}
              aria-label={`Remove ${file.originalName}`}
              onClick={() => void removeFile(file)}
            >
              <Icon name="close" size={18} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function BusinessForm({
  initialSaved = null,
  initialDocuments = [],
  initialError = "",
}: {
  initialSaved?: SavedProfile | null;
  initialDocuments?: ProfileDocument[];
  initialError?: string;
}) {
  const [profile, setProfile] = useState<BusinessProfileDraft>(
    initialSaved?.profile ?? EMPTY_PROFILE,
  );
  const [saved, setSaved] = useState(initialSaved);
  const [step, setStep] = useState(
    initialSaved
      ? initialSaved.status === "approved"
        ? 3
        : Object.keys(validate(initialSaved.profile, 1)).length
          ? 1
          : 2
      : 0,
  );
  const [errors, setErrors] = useState<Errors>({});
  const [documents, setDocuments] = useState(initialDocuments);
  const contextFiles = documents.filter((file) => file.category === "context");
  const legalFiles = documents.filter((file) => file.category === "legal");
  const [confirmed, setConfirmed] = useState(false);
  const [reviewed, setReviewed] = useState(initialSaved?.status === "approved");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const busy = saving || documentBusy;
  const [notice, setNotice] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: "start" });
  }, [step]);

  useEffect(() => {
    const firstInvalid = Object.entries(errors).find(
      ([, message]) => message,
    )?.[0];
    if (firstInvalid) document.getElementById(firstInvalid)?.focus();
  }, [errors]);

  function update<K extends keyof BusinessProfileDraft>(
    key: K,
    value: BusinessProfileDraft[K],
  ) {
    setProfile((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setConfirmed(false);
    setReviewed(false);
    setNotice("");
    setDirty(true);
    setFormError("");
  }

  async function persist(complete: boolean, approve = false) {
    if (initialError) return false;
    setSaving(true);
    setFormError("");
    try {
      const result = await saveBusinessProfile(profile, complete, approve);
      if ("error" in result) {
        setFormError(result.error);
        if (result.fields) {
          setErrors(result.fields);
          setStep(
            Object.keys(result.fields).some((field) =>
              ["name", "country", "city", "offerings"].includes(field),
            )
              ? 0
              : 1,
          );
        }
        return false;
      }
      setSaved(result.saved);
      setProfile(result.saved.profile);
      setDirty(false);
      setReviewed(result.saved.status === "approved");
      setNotice(
        approve
          ? "Your profile has been saved and approved. Matching has not started yet."
          : "Draft saved. You can continue in this browser.",
      );
      return true;
    } catch {
      setFormError(
        "Your profile could not be saved. Check your connection and try again.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function navigate(target: number) {
    if (busy || target === step || initialError) return;
    for (let index = 0; index < target; index++) {
      const nextErrors = validate(profile, index);
      if (Object.keys(nextErrors).length) {
        setErrors(nextErrors);
        setStep(index);
        return;
      }
    }
    if ((!saved || dirty) && !(await persist(target >= 2))) return;
    setErrors({});
    setStep(target);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || initialError) return;
    if (step < 3) {
      await navigate(step + 1);
      return;
    }
    if (confirmed) {
      await persist(true, true);
    }
  }

  function loadExample() {
    setProfile(SAMPLE_PROFILE);
    setConfirmed(false);
    setReviewed(false);
    setErrors({});
    setDirty(true);
    setFormError("");
    setNotice(
      "Sample business loaded. All details are fictional and can be edited.",
    );
  }

  const completion = [
    profile.name.trim(),
    profile.country && profile.city.trim(),
    profile.offerings.trim(),
    profile.country &&
      profile.coverageScope &&
      (profile.coverageScope !== "local" || profile.city.trim()) &&
      (profile.coverageScope !== "international" ||
        profile.coverageCountries.length),
    profile.capacity.trim(),
    profile.experienceLevel === "starting" || profile.experience.trim(),
  ].filter(Boolean).length;
  const icons = ["business", "capacity", "document", "check"] as const;
  const describedBy = (key: keyof BusinessProfileDraft, hasHint = false) =>
    [hasHint ? `${key}-hint` : "", errors[key] ? `${key}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined;
  const location = [
    profile.city.trim(),
    profile.country ? countryLabel(profile.country) : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="app-shell">
      <a className="skip-link" href="#profile-form">
        Skip to form
      </a>
      <aside className="sidebar" aria-label="Profile setup">
        <Link href="/" className="brand" aria-label="Gara Facile home">
          <Image
            className="brand-mark"
            src="/brand/gara-facile-mark.png"
            alt=""
            width={40}
            height={40}
            sizes="40px"
            preload
          />
          gara facile
        </Link>
        <p className="sidebar-intro">Tenders that fit.</p>
        <nav className="step-nav" aria-label="Form sections">
          {STEPS.map((label, index) => (
            <button
              key={label}
              type="button"
              aria-current={index === step ? "step" : undefined}
              disabled={busy || !!initialError}
              onClick={() => navigate(index)}
            >
              <Icon name={icons[index]} />
              <span>{label}</span>
              {index < step ? (
                <span className="step-state" aria-label="Completed">
                  <Icon name="check" size={16} />
                </span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Icon name="business" size={27} />
          <p>Every opportunity starts with your business.</p>
          <span>Your profile will help us find relevant public tenders.</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            <strong>Business profile</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="text-button"
              type="button"
              disabled={busy || !!initialError || (!dirty && !!saved)}
              onClick={() => void persist(false)}
            >
              {saving ? "Saving..." : "Save draft"}
            </button>
            <button
              className="text-button"
              type="button"
              disabled={busy || !!initialError}
              onClick={loadExample}
            >
              Load example
            </button>
          </div>
        </header>
        <main className="main-content" id="profile-form">
          <div className="page-heading">
            <div>
              <h1>Your business, well defined.</h1>
              <p>
                Tell us what you do and where you can work to help us find your
                next public tender.
              </p>
            </div>
            <span className="draft-label">
              <Icon name="eye" size={17} />
              {saving
                ? "Saving..."
                : dirty
                  ? "Unsaved changes"
                  : reviewed
                    ? "Approved"
                    : saved
                      ? "Draft saved"
                      : "New profile"}
            </span>
          </div>
          <div className="content-grid">
            <div className="form-panel">
              <div
                className="progress-track"
                role="progressbar"
                aria-label="Form progress"
                aria-valuemin={1}
                aria-valuemax={4}
                aria-valuenow={step + 1}
                aria-valuetext={STEPS[step]}
              >
                {STEPS.map((label, index) => (
                  <span key={label} className={index <= step ? "active" : ""} />
                ))}
              </div>
              {initialError || formError ? (
                <p
                  className="error-message"
                  role="alert"
                  style={{ marginBottom: 20 }}
                >
                  {initialError || formError}
                </p>
              ) : null}
              <form onSubmit={submit} noValidate aria-busy={busy}>
                <fieldset
                  className="form-controls"
                  disabled={busy || !!initialError}
                >
                  <div key={step} className="form-stage">
                    <div className="form-heading">
                      <h2 ref={headingRef} tabIndex={-1}>
                        {
                          [
                            "Start with your business",
                            "What you can take on",
                            "Add some context",
                            "Review your profile",
                          ][step]
                        }
                      </h2>
                      <p>
                        {
                          [
                            "The essentials to understand what you do.",
                            "Help us find opportunities that fit your capabilities.",
                            "Documents can add detail to your business profile.",
                            "Check that these details accurately describe your business.",
                          ][step]
                        }
                      </p>
                    </div>
                    {step === 0 ? (
                      <div className="fields">
                        <Field
                          id="name"
                          label="Company name"
                          error={errors.name}
                        >
                          <input
                            id="name"
                            name="name"
                            autoComplete="organization"
                            maxLength={160}
                            value={profile.name}
                            onChange={(event) =>
                              update("name", event.target.value)
                            }
                            placeholder="E.g. Voltio Electrical"
                            aria-required="true"
                            aria-invalid={!!errors.name}
                            aria-describedby={describedBy("name")}
                          />
                        </Field>
                        <div className="field-row">
                          <Field
                            id="country"
                            label="Country"
                            error={errors.country}
                          >
                            <select
                              id="country"
                              name="country"
                              autoComplete="country"
                              value={profile.country}
                              onChange={(event) =>
                                update("country", event.target.value)
                              }
                              aria-required="true"
                              aria-invalid={!!errors.country}
                              aria-describedby={describedBy("country")}
                            >
                              <option value="">Select a country</option>
                              {COUNTRY_OPTIONS.map(([code, label]) => (
                                <option key={code} value={code}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field id="city" label="City" error={errors.city}>
                            <input
                              id="city"
                              name="city"
                              autoComplete="address-level2"
                              maxLength={120}
                              value={profile.city}
                              onChange={(event) =>
                                update("city", event.target.value)
                              }
                              placeholder="E.g. Valencia"
                              aria-required="true"
                              aria-invalid={!!errors.city}
                              aria-describedby={describedBy("city")}
                            />
                          </Field>
                        </div>
                        <Field
                          id="offerings"
                          label="What services or products do you offer?"
                          error={errors.offerings}
                        >
                          <textarea
                            id="offerings"
                            name="offerings"
                            rows={4}
                            maxLength={2000}
                            value={profile.offerings}
                            onChange={(event) =>
                              update("offerings", event.target.value)
                            }
                            placeholder="E.g. We install and maintain electrical systems in offices, shops and public buildings."
                            aria-required="true"
                            aria-invalid={!!errors.offerings}
                            aria-describedby={describedBy("offerings", true)}
                          />
                          <div className="field-footer">
                            <p className="field-hint" id="offerings-hint">
                              Be specific. What do you do, and who do you work
                              with?
                            </p>
                            <span className="count">
                              {profile.offerings.length}/2000
                            </span>
                          </div>
                        </Field>
                      </div>
                    ) : null}
                    {step === 1 ? (
                      <div className="fields">
                        <fieldset
                          className="field"
                          id="coverageScope"
                          tabIndex={-1}
                          aria-describedby={
                            errors.coverageScope
                              ? "coverageScope-error"
                              : undefined
                          }
                        >
                          <legend>Where can you work?</legend>
                          <div className="choice-list">
                            {(
                              [
                                [
                                  "local",
                                  "In my city",
                                  "Projects in the city where my business is based.",
                                ],
                                [
                                  "national",
                                  "Across my country",
                                  "We can work in different cities across the country.",
                                ],
                                [
                                  "international",
                                  "In other EU countries",
                                  "Select all the countries where you can work.",
                                ],
                              ] as const
                            ).map(([value, label, hint]) => (
                              <label key={value} className="choice">
                                <input
                                  type="radio"
                                  name="coverageScope"
                                  value={value}
                                  checked={profile.coverageScope === value}
                                  onChange={() =>
                                    update("coverageScope", value)
                                  }
                                />
                                <span>
                                  {label}
                                  <small>{hint}</small>
                                </span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        {errors.coverageScope ? (
                          <p
                            id="coverageScope-error"
                            className="field-error"
                            role="alert"
                          >
                            {errors.coverageScope}
                          </p>
                        ) : null}
                        {profile.coverageScope === "international" ? (
                          <fieldset
                            className="field"
                            id="coverageCountries"
                            tabIndex={-1}
                            aria-describedby={
                              errors.coverageCountries
                                ? "coverageCountries-error"
                                : undefined
                            }
                          >
                            <legend>Countries you can cover</legend>
                            <div className="country-picker">
                              {COUNTRY_OPTIONS.map(([code, label]) => (
                                <label className="country-option" key={code}>
                                  <input
                                    type="checkbox"
                                    checked={profile.coverageCountries.includes(
                                      code,
                                    )}
                                    onChange={(event) =>
                                      update(
                                        "coverageCountries",
                                        event.target.checked
                                          ? [...profile.coverageCountries, code]
                                          : profile.coverageCountries.filter(
                                              (country) => country !== code,
                                            ),
                                      )
                                    }
                                  />
                                  {label}
                                </label>
                              ))}
                            </div>
                            {errors.coverageCountries ? (
                              <p
                                className="field-error"
                                role="alert"
                                id="coverageCountries-error"
                              >
                                {errors.coverageCountries}
                              </p>
                            ) : null}
                          </fieldset>
                        ) : null}
                        <Field
                          id="capacity"
                          label="What projects can you take on?"
                          hint="Describe the project sizes, your team and any relevant limits."
                          error={errors.capacity}
                        >
                          <textarea
                            id="capacity"
                            name="capacity"
                            maxLength={2000}
                            value={profile.capacity}
                            onChange={(event) =>
                              update("capacity", event.target.value)
                            }
                            placeholder="E.g. A team of 8 technicians for small and medium-sized installations, or maintenance of up to 3 sites."
                            aria-required="true"
                            aria-invalid={!!errors.capacity}
                            aria-describedby={describedBy("capacity", true)}
                          />
                        </Field>
                        <fieldset className="field">
                          <legend>Experience with similar work</legend>
                          <div className="choice-list">
                            {(
                              [
                                ["experienced", "We have completed projects"],
                                ["starting", "We are just starting out"],
                              ] as const
                            ).map(([value, label]) => (
                              <label key={value} className="choice">
                                <input
                                  type="radio"
                                  name="experienceLevel"
                                  value={value}
                                  checked={profile.experienceLevel === value}
                                  onChange={() =>
                                    update("experienceLevel", value)
                                  }
                                />
                                <span>{label}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        {profile.experienceLevel === "experienced" ? (
                          <Field
                            id="experience"
                            label="Share one or two examples"
                            hint="Describe the work and its scope. You can leave out client names."
                            error={errors.experience}
                          >
                            <textarea
                              id="experience"
                              name="experience"
                              maxLength={3000}
                              value={profile.experience}
                              onChange={(event) =>
                                update("experience", event.target.value)
                              }
                              placeholder="E.g. We upgraded the lighting in a shopping centre and maintain the electrical systems in 3 office buildings."
                              aria-required="true"
                              aria-invalid={!!errors.experience}
                              aria-describedby={describedBy("experience", true)}
                            />
                          </Field>
                        ) : (
                          <p className="field-hint">
                            We will reflect this in your profile. Experience
                            requirements will be checked for each tender.
                          </p>
                        )}
                      </div>
                    ) : null}
                    {step === 2 ? (
                      <div className="fields">
                        <DocumentUpload
                          category="context"
                          title="Company information and experience"
                          description="A catalogue, portfolio or presentation of your services and projects."
                          files={contextFiles}
                          recordId={saved!.recordId}
                          disabled={busy}
                          onBusyChange={setDocumentBusy}
                          onUploaded={(file) => {
                            setDocuments((current) => [...current, file]);
                            setConfirmed(false);
                            setReviewed(false);
                            setSaved((current) =>
                              current
                                ? {
                                    ...current,
                                    status: "draft",
                                    approvedAt: null,
                                  }
                                : current,
                            );
                          }}
                          onRemoved={(id) => {
                            setDocuments((current) =>
                              current.filter((file) => file.id !== id),
                            );
                            setConfirmed(false);
                            setReviewed(false);
                            setSaved((current) =>
                              current
                                ? {
                                    ...current,
                                    status: "draft",
                                    approvedAt: null,
                                  }
                                : current,
                            );
                          }}
                        />
                        <DocumentUpload
                          category="legal"
                          title="Legal and tax documents"
                          description="Documents about your business registration or tax status. Requirements vary by tender."
                          files={legalFiles}
                          recordId={saved!.recordId}
                          disabled={busy}
                          onBusyChange={setDocumentBusy}
                          onUploaded={(file) => {
                            setDocuments((current) => [...current, file]);
                            setConfirmed(false);
                            setReviewed(false);
                            setSaved((current) =>
                              current
                                ? {
                                    ...current,
                                    status: "draft",
                                    approvedAt: null,
                                  }
                                : current,
                            );
                          }}
                          onRemoved={(id) => {
                            setDocuments((current) =>
                              current.filter((file) => file.id !== id),
                            );
                            setConfirmed(false);
                            setReviewed(false);
                            setSaved((current) =>
                              current
                                ? {
                                    ...current,
                                    status: "draft",
                                    approvedAt: null,
                                  }
                                : current,
                            );
                          }}
                        />
                        <p className="form-footnote">
                          <Icon name="info" size={17} />
                          Uploaded documents are saved with your profile. Their
                          legal validity has not been verified and no AI
                          analysis has started.
                        </p>
                      </div>
                    ) : null}
                    {step === 3 ? (
                      <>
                        {reviewed ? (
                          <div className="success-panel" role="status">
                            <Icon name="check" size={30} />
                            <h2>Profile saved and approved</h2>
                            <p>
                              Your business details and documents have been
                              saved. You can return in this browser to review
                              them. Matching has not started yet.
                            </p>
                          </div>
                        ) : null}
                        <dl className="review-list">
                          <div>
                            <dt className="review-edit">
                              Company
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => navigate(0)}
                              >
                                Edit company
                              </button>
                            </dt>
                            <dd>
                              {profile.name}
                              <br />
                              {location}
                            </dd>
                          </div>
                          <div>
                            <dt>Services and products</dt>
                            <dd>{profile.offerings}</dd>
                          </div>
                          <div>
                            <dt className="review-edit">
                              Coverage
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => navigate(1)}
                              >
                                Edit capabilities
                              </button>
                            </dt>
                            <dd>{coverageLabel(profile)}</dd>
                          </div>
                          <div>
                            <dt>Capacity</dt>
                            <dd>{profile.capacity}</dd>
                          </div>
                          <div>
                            <dt>Experience</dt>
                            <dd>
                              {profile.experienceLevel === "starting"
                                ? "No previous experience declared."
                                : profile.experience}
                            </dd>
                          </div>
                          <div>
                            <dt className="review-edit">
                              Uploaded documents
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => navigate(2)}
                              >
                                Edit documents
                              </button>
                            </dt>
                            <dd>
                              {contextFiles.length + legalFiles.length
                                ? [...contextFiles, ...legalFiles]
                                    .map((file) => file.originalName)
                                    .join("\n")
                                : "No documents uploaded. You can add them later."}
                            </dd>
                          </div>
                        </dl>
                        {!reviewed ? (
                          <label className="review-confirm">
                            <input
                              type="checkbox"
                              checked={confirmed}
                              onChange={(event) =>
                                setConfirmed(event.target.checked)
                              }
                            />
                            <span>
                              I have reviewed these details and they accurately
                              describe my business.
                            </span>
                          </label>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  <div className="form-actions">
                    {step > 0 ? (
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => navigate(step - 1)}
                      >
                        Back
                      </button>
                    ) : (
                      <span className="field-hint">
                        Documents are optional.
                      </span>
                    )}
                    {reviewed ? (
                      <button
                        type="button"
                        className="button-primary"
                        onClick={() => {
                          setReviewed(false);
                          setConfirmed(false);
                          navigate(0);
                        }}
                      >
                        Edit profile
                      </button>
                    ) : (
                      <button
                        className="button-primary"
                        type="submit"
                        disabled={busy || (step === 3 && !confirmed)}
                      >
                        {saving
                          ? "Saving..."
                          : step === 3
                            ? "Confirm profile"
                            : step === 2
                              ? "Review profile"
                              : "Continue"}
                        <Icon name={step === 3 ? "check" : "arrow"} size={18} />
                      </button>
                    )}
                  </div>
                  <p className="form-footnote">
                    <Icon name="lock" size={16} />
                    Save your changes before leaving. You can continue in this
                    browser for 30 days; access is not yet linked to an account.
                  </p>
                  <p
                    role="status"
                    className="field-hint"
                    style={{ marginTop: notice ? 12 : 0 }}
                  >
                    {notice}
                  </p>
                </fieldset>
              </form>
            </div>
            <aside
              className="profile-preview"
              aria-label="Your profile preview"
            >
              <div className="preview-title">
                <h2>Your profile so far</h2>
                <Icon name="eye" size={19} />
              </div>
              <div className="business-avatar" aria-hidden="true">
                {profile.name.trim() ? (
                  profile.name.trim().slice(0, 2).toUpperCase()
                ) : (
                  <Icon name="business" size={23} />
                )}
              </div>
              <p className="preview-name">
                {profile.name.trim() || "Your business"}
              </p>
              <p className="preview-location">
                {location || "Location not specified"}
              </p>
              <div className="preview-section">
                <h3>What you offer</h3>
                <p className={profile.offerings.trim() ? "" : "empty-value"}>
                  {profile.offerings.trim() ||
                    "Your services and products will appear here."}
                </p>
              </div>
              <div className="preview-section">
                <h3>Where you work</h3>
                <p>{coverageLabel(profile)}</p>
              </div>
              <div className="preview-section">
                <h3>Capacity</h3>
                <p className={profile.capacity.trim() ? "" : "empty-value"}>
                  {profile.capacity.trim() || "The projects you can take on."}
                </p>
              </div>
              <div className="preview-progress">
                <p>
                  <strong>{completion} of 6 details completed</strong>
                </p>
                <div className="meter" aria-hidden="true">
                  {Array.from({ length: 6 }, (_, index) => (
                    <span
                      key={index}
                      className={index < completion ? "filled" : ""}
                    />
                  ))}
                </div>
              </div>
              <p className="preview-disclaimer">
                This shows profile completeness, not eligibility for a tender.
              </p>
            </aside>
          </div>
          <footer className="bottom-note">
            <span>Your profile first. Opportunities next.</span>
            <span>Gara Facile</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
