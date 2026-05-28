import LegalPage from "./LegalPage";

export default function Refund() {
  return (
    <LegalPage
      title="Refund Policy"
      description="SmartComment 30-day money-back guarantee on credit pack purchases."
    >
      <h2>30-day money-back guarantee</h2>
      <p>
        We want you to be happy with SmartComment. If you're not satisfied with a credit pack
        purchase, you can request a full refund within <strong>30 days</strong> of your order
        date.
      </p>

      <h2>How to request a refund</h2>
      <p>
        Our orders are processed by our online reseller and Merchant of Record,{" "}
        <strong>Paddle.com</strong>. To request a refund:
      </p>
      <ul>
        <li>
          Visit <a href="https://paddle.net" target="_blank" rel="noreferrer">paddle.net</a>{" "}
          and look up your order with the email address you used at checkout. From there you
          can request a refund directly.
        </li>
        <li>
          Or email us at{" "}
          <a href="mailto:ccborchers@gmail.com">ccborchers@gmail.com</a> with the email
          address you used at checkout and we'll arrange it with Paddle on your behalf.
        </li>
      </ul>

      <h2>Refund processing</h2>
      <p>
        Refunds are issued back to the original payment method by Paddle and typically appear
        within 5–10 business days, depending on your bank or card issuer. Refunded credit
        packs are removed from your account balance. Credits that have already been consumed
        before the refund request remain consumed.
      </p>

      <h2>School-sponsored accounts</h2>
      <p>
        Teachers using a verified school email under a partner-school arrangement do not pay
        for credits and have nothing to refund. Billing arrangements for the school as a
        whole are handled separately with the school administrator.
      </p>

      <h2>Questions</h2>
      <p>
        For any questions about refunds, contact us at{" "}
        <a href="mailto:ccborchers@gmail.com">ccborchers@gmail.com</a>.
      </p>
    </LegalPage>
  );
}
