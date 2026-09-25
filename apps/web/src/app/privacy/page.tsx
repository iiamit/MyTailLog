import type { Metadata } from "next";
import Link from "next/link";
import { MarketingSection, MarketingShell } from "@/components/MarketingShell";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How MyTailLog handles account, aircraft, logbook and mobile app data.",
};

export default function PrivacyPage() {
  return (
    <MarketingShell
      eyebrow="Privacy"
      title="How MyTailLog handles your data"
      current="/privacy"
      lede="This policy covers the MyTailLog website and its iOS and Android apps. Updated September 25, 2026."
    >
      <div className="space-y-8">
        <MarketingSection id="collect" title="What we collect">
          <p>
            Your account uses an email address and sign-in credentials. When you use MyTailLog, you may
            add aircraft details, maintenance records, logbook scans, documents, inspection and
            airworthiness tracking data, squawks, and notes. The mobile app keeps a local copy of
            records and files you choose to sync so you can work offline.
          </p>
          <p>
            If you enable reminders, we store a device notification token and your reminder settings.
            If you connect an outside service or add your own AI key, we store the connection details
            needed to provide that feature. We also process the requests and errors needed to run and
            secure the service.
          </p>
        </MarketingSection>
        <MarketingSection id="use" title="How we use it">
          <p>
            We use this data to show your aircraft records, sync your devices, extract text from scans,
            answer your questions about records, create backups you request, and send reminders you
            enable. MyTailLog does not train AI models on your data.
          </p>
          <p>
            To read a page or answer a question, the relevant image or text is sent to the configured
            Anthropic or OpenAI API. Their handling of API traffic is governed by their terms. You can
            provide your own provider key in Profile if you prefer those calls under your account.
          </p>
        </MarketingSection>
        <MarketingSection id="share" title="Who receives it">
          <p>
            People you invite can see the aircraft data their viewer or editor access permits. The
            hosted service uses Supabase for accounts and data, Google Cloud for hosting and private
            file storage, Firebase Cloud Messaging or Apple Push Notification service for enabled
            device reminders, and email delivery for reminders and service messages. Optional Dropbox,
            Google Drive, MyFlightBook, or other connections are used only when you set them up.
          </p>
          <p>
            The operator of mytaillog.com can access hosted data to run and support the service.
            MyTailLog does not sell aircraft records or use them for advertising.
          </p>
        </MarketingSection>
        <MarketingSection id="control" title="Access, export and deletion">
          <p>
            You can export your records from the web app, remove an aircraft, revoke a sharing
            invitation or connected app, and turn off reminders. To request deletion of your account
            and associated data, use the <Link href="/account-deletion" className="underline">account deletion page</Link>.
            We verify requests before carrying them out and explain any effect on shared aircraft.
          </p>
          <p>
            Signing out of the mobile app removes its local account copy. Records you explicitly
            exported or backed up to your own storage remain under your control.
          </p>
        </MarketingSection>
        <MarketingSection id="security" title="Security and contact">
          <p>
            Aircraft data is access controlled by account and sharing permissions. Uploaded files
            are private, and the mobile app excludes its local records from Android backup. We use
            encrypted connections for data in transit; some third-party connection secrets are
            additionally encrypted at rest. No system can promise perfect security.
          </p>
          <p>
            Questions or privacy requests: <a className="underline" href="mailto:mytaillog@iamit.org">mytaillog@iamit.org</a>.
          </p>
        </MarketingSection>
      </div>
    </MarketingShell>
  );
}
