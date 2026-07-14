import LegalPage from "./LegalPage";

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      description="Terms of Service for SmartComment, operated by Christopher Charles Borchers."
    >
      <h2>1. Who we are</h2>
      <p>
        SmartComment (the "Service") is operated by <strong>Christopher Charles Borchers</strong>
        ("we", "us", "our"). By creating an account, accessing or using the Service, you
        ("you", "user") agree to these Terms of Service ("Terms"). If you do not agree, do not
        use the Service.
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
      <p>
        If you are using the Service on behalf of a school or organisation, you represent that
        you have authority to bind that organisation to these Terms. If you are using the
        Service as an individual, you confirm that you are of legal age in your jurisdiction.
      </p>

      <h2>2. The Service</h2>
      <p>
        SmartComment is a software tool that helps teachers draft, refine and export student
        report comments using AI generation, voice transcription, handwriting OCR and related
        features. We grant you a limited, non-exclusive, non-transferable, revocable right to
        use the Service for your own teaching work, within the limits of your plan.
      </p>

      <h2>3. Acceptable use</h2>
      <p>You must not:</p>
      <ul>
        <li>use the Service for any unlawful, fraudulent, deceptive or harmful purpose;</li>
        <li>infringe the intellectual property, privacy or other rights of any person;</li>
        <li>upload malware, attempt to probe, scan or test the vulnerability of the Service, or interfere with its security or integrity;</li>
        <li>scrape, harvest, or systematically extract data from the Service;</li>
        <li>resell, sublicense or redistribute the Service or its outputs as a competing product;</li>
        <li>reverse engineer, decompile or attempt to derive the source code of the Service, except where permitted by law.</li>
      </ul>

      <h2>4. AI features and outputs</h2>
      <p>
        The Service uses generative AI models. You are responsible for the prompts and inputs
        you provide, for confirming the accuracy and appropriateness of any AI-generated
        output before using it, and for ensuring you have the rights to any content you
        upload (including student data, handwriting samples and audio recordings).
      </p>
      <p>
        AI outputs may be inaccurate, incomplete or biased. They are not a substitute for
        professional judgement. We may filter, restrict or refuse outputs, and may suspend
        accounts that repeatedly generate prohibited content (e.g. illegal material, hate
        speech, deepfakes, attempts to jailbreak the model).
      </p>
      <p>
        We claim no ownership of the inputs you provide or the outputs you generate. You are
        responsible for how outputs are used. If a rights-holder alleges that content
        generated or hosted on the Service infringes their rights, they may contact us and we
        will review and act on legitimate complaints, including removal and, for repeat
        infringement, account termination.
      </p>

      <h2>5. Your account and content</h2>
      <p>
        You are responsible for keeping your account credentials confidential and for all
        activity under your account. You must provide accurate information and keep it up to
        date. You retain ownership of the content you upload, and grant us a limited licence
        to host and process it solely to provide the Service to you.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        We retain all right, title and interest in the Service, including its software,
        documentation and branding. Nothing in these Terms transfers any of our intellectual
        property to you.
      </p>

      <h2>7. Payment, billing and subscriptions</h2>
      <p>
        Paid features are offered as a monthly subscription (currently R49 per month for
        2,000 credits, billed recurringly) and as one-time credit top-ups. Our order process
        is conducted by our online reseller <strong>Paddle.com</strong>. Paddle.com is the
        Merchant of Record for all our orders. Paddle provides all customer service inquiries
        and handles returns. Payment terms, billing, tax handling, cancellation and refund
        mechanics are governed by Paddle's{" "}
        <a href="https://www.paddle.com/legal/checkout-buyer-terms" target="_blank" rel="noreferrer">
          Buyer Terms
        </a>
        . See our <a href="/legal/refunds">Refund Policy</a> for our specific commitments.
      </p>

      <h2>8. Service level and warranties</h2>
      <p>
        We work hard to keep the Service available and accurate, but we do not guarantee that
        it will be uninterrupted, error-free, or fit for any particular purpose. To the
        fullest extent permitted by law, we disclaim all implied warranties, including
        warranties of merchantability, fitness for a particular purpose and non-infringement.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, our aggregate liability arising out of or
        relating to the Service is limited to the fees you paid to us in the twelve (12)
        months preceding the event giving rise to the claim. We are not liable for any
        indirect, consequential, incidental, special or punitive damages, including loss of
        profits, data, goodwill or teaching time. Nothing in these Terms excludes liability
        that cannot be excluded by law (such as for fraud, death or personal injury caused by
        negligence).
      </p>

      <h2>10. Indemnity</h2>
      <p>
        You agree to indemnify and hold us harmless from claims arising out of (a) your
        content, (b) your use of AI outputs, or (c) your breach of these Terms or applicable
        law.
      </p>

      <h2>11. Suspension and termination</h2>
      <p>
        We may suspend or terminate your access to the Service for: material breach of these
        Terms, non-payment, suspected fraud or security risk, or repeated policy violations.
        You may stop using the Service at any time. On termination, your right to access the
        Service ends, and we may delete your data after a reasonable retention period.
      </p>

      <h2>12. Changes to the Service or Terms</h2>
      <p>
        We may change the Service or these Terms from time to time. Material changes will be
        notified through the Service or by email. Continued use after changes take effect
        constitutes acceptance.
      </p>

      <h2>13. Governing law</h2>
      <p>
        These Terms are governed by the laws of the Republic of South Africa, without regard
        to its conflict of laws rules. The courts of South Africa have exclusive jurisdiction
        over any disputes, subject to any mandatory consumer protections in your country of
        residence.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions about these Terms? Contact us at{" "}
        <a href="mailto:ccborchers@gmail.com">ccborchers@gmail.com</a>.
      </p>
    </LegalPage>
  );
}
