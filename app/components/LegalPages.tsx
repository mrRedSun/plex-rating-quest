import { Gamepad2 } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Brand, Shell } from "./QuestUi";

export type LegalPageKind = "privacy" | "terms";

const CONTACT_EMAIL = "supremumsoftteam@gmail.com";
const OPERATOR = "Plex Rating Quest Community Operator";

function LegalSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function PrivacyNotice(): ReactElement {
  return (
    <>
      <p className="legal-summary">
        Plex Rating Quest does not use advertising or analytics trackers. It
        processes only the information needed to connect your Plex account,
        build your quest, save your encrypted session, and keep the service
        secure.
      </p>
      <LegalSection title="Who operates this deployment">
        <p>
          The public deployment at <strong>plexquest.lviv.win</strong> is
          operated by {OPERATOR}. Privacy and data-handling questions can be
          sent to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Other
          self-hosted deployments have their own operators and policies.
        </p>
      </LegalSection>
      <LegalSection title="Information processed">
        <ul>
          <li>
            Plex account identity: account UUID, username, and display name.
          </li>
          <li>
            Plex authorization and server tokens, server connection addresses,
            and a temporary sign-in PIN.
          </li>
          <li>
            Library titles, artwork references, watch history, and ratings used
            to build the experience in your current browser tab.
          </li>
          <li>
            A random session cookie and privacy-filtered operational logs such
            as request IDs, route names, status codes, and durations.
          </li>
          <li>
            Network information, including IP address and browser metadata,
            necessarily visible to Cloudflare and the hosting network.
          </li>
        </ul>
      </LegalSection>
      <LegalSection title="Where information lives and for how long">
        <p>
          Account credentials and discovered Plex connections are stored in an
          AES-256-GCM encrypted SQLite session on the server. Session IDs are
          stored as hashes. Sessions expire after 30 days of inactivity and are
          deleted immediately when logout succeeds. A pending Plex PIN expires
          after about 10 minutes.
        </p>
        <p>
          Quest progress, filters, viewing data, queued ratings, tier lists, and
          privacy-safe diagnostics stay in browser session storage and are
          normally removed when the tab session ends. A random Plex client ID is
          kept in local storage so sign-in can work consistently.
        </p>
      </LegalSection>
      <LegalSection title="Why information is used">
        <p>
          Information is used only to authenticate with Plex at your request,
          retrieve the libraries you select, display and update ratings,
          preserve your signed-in session, prevent abuse, diagnose failures, and
          operate the service. It is not sold and is not used for targeted
          advertising.
        </p>
      </LegalSection>
      <LegalSection title="Third parties">
        <p>
          Plex receives authorization, account, library, history, and rating
          requests under its own terms and privacy policy. Cloudflare proxies
          the public site and processes network/security information under its
          own policies. The service is independent and is not endorsed by Plex.
        </p>
      </LegalSection>
      <LegalSection title="Your choices">
        <p>
          You can cancel a library load, export privacy-filtered diagnostics,
          close the tab to clear browser-session data, or log out to delete the
          server-side session. Contact {CONTACT_EMAIL} to ask about information
          associated with this deployment. Plex account requests must be made
          directly to Plex.
        </p>
      </LegalSection>
      <LegalSection title="Children and families">
        <p>
          The service does not independently register children. A person under
          18 may use it only with a parent or legal guardian’s involvement and
          only as an authorized user under that adult’s Plex account. The adult
          is responsible for supervision and appropriate media access.
        </p>
      </LegalSection>
      <LegalSection title="Security and changes">
        <p>
          Reasonable technical safeguards are used, but no internet service is
          risk-free. This notice may change when the service or its providers
          change. Material changes will be published here with a new effective
          date.
        </p>
      </LegalSection>
    </>
  );
}

function TermsOfUse(): ReactElement {
  return (
    <>
      <p className="legal-summary">
        These terms govern the free public deployment at plexquest.lviv.win. By
        using it, you agree to use your Plex account and media lawfully and
        accept that this community service is provided without commercial
        guarantees.
      </p>
      <LegalSection title="Operator and contact">
        <p>
          This deployment is provided by {OPERATOR}. Contact
          <a href={`mailto:${CONTACT_EMAIL}`}> {CONTACT_EMAIL}</a> for service,
          legal, or abuse notices.
        </p>
      </LegalSection>
      <LegalSection title="Eligibility and family use">
        <p>
          Adults may use the service with an account they are authorized to
          access. Users under 18 may participate only with a parent or legal
          guardian’s involvement and as an authorized user under that adult’s
          Plex account, consistent with Plex’s terms.
        </p>
      </LegalSection>
      <LegalSection title="Acceptable use">
        <ul>
          <li>
            Use only accounts, servers, and media you may lawfully access.
          </li>
          <li>
            Do not attack, probe, overload, automate abuse of, or bypass limits
            on the service or its providers.
          </li>
          <li>
            Do not use the service to infringe copyright, privacy, security, or
            other rights.
          </li>
          <li>Keep your Plex account and deployment access secure.</li>
        </ul>
      </LegalSection>
      <LegalSection title="Plex and other services">
        <p>
          Plex Rating Quest is an independent project and is not affiliated
          with, sponsored by, or endorsed by Plex. Plex, Cloudflare, and linked
          services apply their own terms and policies. Plex names and marks
          belong to their respective owners.
        </p>
      </LegalSection>
      <LegalSection title="Availability and changes">
        <p>
          The service is free and may be changed, rate-limited, interrupted, or
          discontinued. Access may be suspended to protect users, providers,
          infrastructure, or legal rights. There is no promise that every Plex
          server, library, or feature will remain compatible.
        </p>
      </LegalSection>
      <LegalSection title="No warranty">
        <p>
          To the extent permitted by applicable law, the service is provided “as
          is” and “as available,” without warranties of uninterrupted operation,
          fitness for a particular purpose, or preservation of data. Keep
          independent backups and review rating changes before applying them to
          Plex.
        </p>
      </LegalSection>
      <LegalSection title="Responsibility and liability">
        <p>
          You remain responsible for your account, media, ratings, devices,
          network, and compliance with applicable law. To the extent permitted
          by law, the operator is not liable for indirect or consequential loss
          arising from use or inability to use this free service. Rights that
          cannot legally be excluded remain unaffected.
        </p>
      </LegalSection>
      <LegalSection title="Applicable rules and updates">
        <p>
          Applicable law governs without creating a special choice-of-law or
          court agreement. Updated terms will be published here with a new
          effective date. Stop using the service if you do not accept an update.
        </p>
      </LegalSection>
    </>
  );
}

export function LegalPage({
  kind,
}: {
  readonly kind: LegalPageKind;
}): ReactElement {
  const privacy = kind === "privacy";
  return (
    <Shell compact showAccountControls={false}>
      <header className="topbar legal-topbar">
        <Brand nativeNavigation />
        <span className="privacy-pill">
          <Gamepad2 size={14} /> Community service
        </span>
      </header>
      <article className="legal-page">
        <div className="eyebrow">Effective August 8, 2026</div>
        <h1>{privacy ? "Privacy & data handling" : "Terms of use"}</h1>
        {privacy ? <PrivacyNotice /> : <TermsOfUse />}
        <p className="legal-review-note">
          This plain-language notice documents the service’s intended operation
          and is not a substitute for advice from qualified legal counsel.
        </p>
      </article>
    </Shell>
  );
}
