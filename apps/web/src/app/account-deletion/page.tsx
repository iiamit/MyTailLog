import type { Metadata } from "next";
import Link from "next/link";
import { MarketingSection, MarketingShell } from "@/components/MarketingShell";

export const metadata: Metadata = {
  title: "Delete your MyTailLog account",
  description: "Request deletion of your MyTailLog account and associated data.",
};

export default function AccountDeletionPage() {
  return (
    <MarketingShell
      eyebrow="Account"
      title="Delete your MyTailLog account"
      current="/account-deletion"
      lede="You can request deletion here even if you no longer have the app."
    >
      <div className="space-y-8">
        <MarketingSection id="request" title="Send a deletion request">
          <p>
            Email <a className="underline" href="mailto:mytaillog@iamit.org?subject=Delete%20my%20MyTailLog%20account">mytaillog@iamit.org</a> from
            the address on your MyTailLog account. Put “Delete my MyTailLog account” in the subject.
            If you cannot use that address, tell us which account to find; we will verify ownership
            before deleting it. You can also start from Account → Delete my account in the Android or iOS app.
          </p>
          <p>
            We handle requests manually. We will confirm what will be deleted, including your account,
            aircraft you own, their logbook records and uploaded files, and device notification tokens.
            If an aircraft is shared with other people, we will explain any effect on their access before
            removing it. You can export your records first from the web app.
          </p>
        </MarketingSection>
        <MarketingSection id="more" title="Your data choices">
          <p>
            You can remove an individual aircraft without deleting your account. See the{" "}
            <Link href="/privacy" className="underline">privacy policy</Link> for how data is handled
            while your account is active.
          </p>
        </MarketingSection>
      </div>
    </MarketingShell>
  );
}
