import LegalPage from "./LegalPage";

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Notice"
      description="How SmartComment, operated by Christopher Charles Borchers, collects and uses personal data."
    >
      <h2>1. Who we are</h2>
      <p>
        SmartComment is operated by <strong>Christopher Charles Borchers</strong>
        ("we", "us", "our"), the data controller for personal data processed through the
        Service. Contact: <a href="mailto:ccborchers@gmail.com">ccborchers@gmail.com</a>.
      </p>
      <p>
        SmartComment is operated as a sole proprietorship by Christopher Charles Borchers.
      </p>
      <p>
        Postal address:
        <br />
        c/o LIV Village
        <br />
        PO Box 1817
        <br />
        Verulam
        <br />
        4340
        <br />
        South Africa
      </p>

      <h2>2. Data we collect</h2>
      <ul>
        <li><strong>Account data:</strong> name, email address, login credentials, school affiliation.</li>
        <li><strong>Teaching content:</strong> class lists, student names, marks, observations, voice notes, handwriting images, and AI-generated comments you create.</li>
        <li><strong>Support and feedback:</strong> messages you send us.</li>
        <li><strong>Usage and telemetry:</strong> AI feature usage counts and credit consumption, error logs, device identifiers, IP address, browser type.</li>
      </ul>
      <p>
        Payment data (card numbers, billing addresses) is collected and processed by
        Paddle.com, our Merchant of Record, not by us.
      </p>

      <h2>3. How and why we use data</h2>
      <ul>
        <li><strong>Provide the Service</strong> — account creation, AI generation, transcription, OCR, storage of your work. Legal basis: performance of contract.</li>
        <li><strong>Security and fraud prevention</strong> — detect abuse, secure accounts. Legal basis: legitimate interests.</li>
        <li><strong>Customer support</strong> — respond to your messages. Legal basis: performance of contract / legitimate interests.</li>
        <li><strong>Product improvement</strong> — diagnose issues, improve features. Legal basis: legitimate interests.</li>
        <li><strong>Billing</strong> — process orders via Paddle. Legal basis: performance of contract.</li>
        <li><strong>Legal compliance</strong> — meet tax, accounting, and regulatory obligations. Legal basis: legal obligation.</li>
      </ul>

      <h2>4. Who we share data with</h2>
      <ul>
        <li><strong>Service providers / subprocessors</strong> — hosting (Supabase / Lovable Cloud), AI model providers (e.g. Google, OpenAI), email delivery, error monitoring, analytics.</li>
        <li><strong>Paddle.com</strong> — our Merchant of Record for sales, subscription management, payment processing, tax handling and invoicing.</li>
        <li><strong>School administrators</strong> — if you are linked to a partner school, aggregate usage attributed to that school is visible to its designated administrators for invoicing and oversight.</li>
        <li><strong>Professional advisers</strong> — legal and accounting advisers, where necessary.</li>
        <li><strong>Authorities</strong> — where required by law or to protect rights, property or safety.</li>
      </ul>
      <p>We do not sell personal data.</p>

      <h2>5. International transfers</h2>
      <p>
        Our infrastructure providers may process data outside the UK / EEA. Where data is
        transferred internationally, we rely on appropriate safeguards such as Standard
        Contractual Clauses or adequacy decisions.
      </p>

      <h2>6. How long we keep data</h2>
      <p>
        We keep account and teaching content for as long as your account is active, and for a
        reasonable period afterwards to allow for export, dispute resolution and legal
        retention requirements. Telemetry and logs are retained for a shorter period (typically
        up to 12 months). When data is no longer needed, we delete or anonymise it.
      </p>

      <h2>7. Your rights</h2>
      <p>Depending on your country, you have rights to:</p>
      <ul>
        <li>access the personal data we hold about you;</li>
        <li>have inaccurate data corrected;</li>
        <li>have your data deleted ("right to erasure");</li>
        <li>restrict or object to certain processing;</li>
        <li>data portability (receive your data in a portable format);</li>
        <li>withdraw consent where processing is based on consent;</li>
        <li>lodge a complaint with your local supervisory authority.</li>
      </ul>
      <p>
        To exercise these rights, contact{" "}
        <a href="mailto:ccborchers@gmail.com">ccborchers@gmail.com</a>. We respond within one
        month.
      </p>

      <h2>8. Security</h2>
      <p>
        We use appropriate technical and organisational measures to protect personal data,
        including encryption in transit, access controls, row-level database security, and
        secrets management. No system is fully secure; please use a strong password and tell
        us if you suspect your account has been compromised.
      </p>

      <h2>9. Cookies</h2>
      <p>
        The Service uses essential cookies and local storage required for authentication and
        for the app to function (for example, keeping you signed in). We do not currently use
        advertising or third-party marketing cookies. If this changes we will update this
        notice and request consent where required.
      </p>

      <h2>10. Children</h2>
      <p>
        The Service is for teachers and school staff. It is not intended for use by children.
        Where teachers enter student information (e.g. names, marks), the school remains
        responsible for the lawful basis to do so under its own data protection arrangements.
      </p>

      <h2>11. Changes to this notice</h2>
      <p>
        We may update this Privacy Notice from time to time. Material changes will be
        communicated through the Service or by email.
      </p>
    </LegalPage>
  );
}
