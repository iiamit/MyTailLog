import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, OnboardingEmailCandidate } from "@/lib/database.types";
import { sendEmail } from "@/lib/email";

type Service = SupabaseClient<Database>;
const SITE = "https://mytaillog.com";
const ADDRESS = "1321 Upland Dr. Suite 9324, Houston, Texas 77043, US";
const INTERNAL_DOMAINS = ["@iamit.org", "@mytaillog.com", "@example.com", "@localhost", "@vtmpj.com", "@kjkpc.net"];
const INVALID_DOMAINS = ["@gmai.com", "@gmial.com", "@gmail.ciom"];
const INTERNAL_EMAILS = new Set(["mytaillog@joshnisly.com", "iamit@gomboc.ai", "myflightbook@gmail.com", "mayergoup@gmail.com"]);

/** Admins are excluded in SQL. This second guard catches demo/test identities. */
export function excludedOnboardingEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const local = normalized.split("@")[0] ?? "";
  const extra = (process.env.ONBOARDING_EXCLUDE_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return INTERNAL_DOMAINS.some((d) => normalized.endsWith(d))
    || INVALID_DOMAINS.some((d) => normalized.endsWith(d))
    || INTERNAL_EMAILS.has(normalized)
    || extra.includes(normalized)
    || /(^|[+._-])(test|demo|e2e|qa)([+._-]|$)/.test(local);
}

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (value: string) => value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 80);

export function onboardingMessage(candidate: OnboardingEmailCandidate) {
  const name = clean(candidate.full_name ?? "").split(/\s+/)[0] || "there";
  const tail = clean(candidate.tail_number ?? "your aircraft") || "your aircraft";
  const aircraftPath = candidate.aircraft_id ? `/aircraft/${candidate.aircraft_id}` : "/dashboard";
  const unsubscribeUrl = `${SITE}/api/onboarding/unsubscribe?token=${candidate.unsubscribe_token}`;
  const catchup = candidate.is_catchup;

  let subject: string;
  let preheader: string;
  let heading: string;
  let paragraphs: string[];
  let button: string;
  let link: string;
  let illustration: [string, string];

  switch (candidate.stage) {
    case "aircraft":
      subject = catchup ? "Ready to bring your aircraft into MyTailLog?" : "Your aircraft’s records have a home";
      preheader = "Add your aircraft to start keeping its records together.";
      heading = catchup ? `Welcome back, ${name}.` : `Welcome aboard, ${name}.`;
      paragraphs = catchup
        ? ["You created a MyTailLog account, but haven’t added an aircraft yet. If you’d still like a home for your logbooks and maintenance history, this is the place to start.", "Start with the tail number and what you know. You can add more aircraft details later."]
        : ["Thanks for signing up. Add your aircraft and MyTailLog will give its logbooks, documents, and maintenance history one place to live.", "Start with the tail number and what you know. You can add more aircraft details later."];
      button = "Add my aircraft";
      link = `${SITE}/aircraft/enroll`;
      illustration = ["Your fleet · No aircraft yet", "Add your aircraft · Tail number, make, model"];
      break;
    case "logbooks":
      subject = catchup ? `Want a hand getting ${tail}’s records into MyTailLog?` : `Ready to bring ${tail}’s logbooks aboard?`;
      preheader = catchup ? "Pick up where you left off with one easy next step." : "Scan a page or upload a PDF whenever you’re ready.";
      heading = catchup ? `${tail} is ready when you are.` : `${tail} is in your hangar.`;
      paragraphs = catchup
        ? [`You added ${tail} to MyTailLog, but haven’t brought in its logbooks yet. If you’d still like searchable maintenance records, scan a page with the mobile app or upload a PDF on the web.`, "There’s no need to do it all at once. Start with one page, then add the rest whenever you have time."]
        : ["Nice work getting your aircraft set up. Its paper history can come along too: scan a few pages with the mobile app, or upload a PDF from your computer.", "You can start with one page. Your originals stay yours, and you can return to add the rest whenever it suits you."];
      button = catchup ? `Continue setting up ${tail}` : `Add ${tail}’s logbooks`;
      link = `${SITE}${aircraftPath}/upload`;
      illustration = [`${tail} · Aircraft added`, "Add a logbook · Scan pages or upload a PDF"];
      break;
    case "review":
      subject = catchup ? `${tail}’s logbook entries are waiting for a quick review` : `Your ${tail} logbook pages are ready to review`;
      preheader = "Check the extracted entries against the original pages.";
      heading = "Your pages are in. Now check the details.";
      paragraphs = catchup
        ? [`You uploaded pages for ${tail}, and some extracted entries are still waiting for your review. Compare them with the original scans and correct anything that needs attention.`, "Checking dates, tach or Hobbs readings, and the work description is a good place to start."]
        : [`MyTailLog has finished reading the pages you uploaded for ${tail}. Before those entries join your searchable history, compare them with the scans and correct anything that needs attention.`, "It’s especially useful to check dates, tach or Hobbs readings, and the work description."];
      button = "Review my entries";
      link = `${SITE}${aircraftPath}/review`;
      illustration = ["Original page · Your scan", "Review entries · Check and confirm"];
      break;
    case "extract":
      subject = `Turn ${tail}’s uploaded pages into searchable entries`;
      preheader = "Your pages are saved. Start extraction when you’re ready.";
      heading = "Your pages are safe. Let’s read them.";
      paragraphs = [`You uploaded logbook pages for ${tail}, but some haven’t been extracted yet. Open Logbooks & pages and choose Extract to turn the writing into entries you can search and review.`, "If a page says Failed, you can retry it there. Your original scan stays in your logbook either way."];
      button = "Extract my pages";
      link = `${SITE}${aircraftPath}/pages`;
      illustration = ["Pages uploaded · Originals saved", "Extract · Then review entries"];
      break;
    case "success":
      subject = `Your first ${tail} logbook entry is ready`;
      preheader = "Your searchable maintenance history has started.";
      heading = "One entry down. A clearer history ahead.";
      paragraphs = [`Thanks for reviewing your first entry for ${tail}. It’s now part of a searchable history you can reach on the web, iPhone, or Android.`, "As you add more records, MyTailLog can help you spot maintenance items and keep important aircraft documents close at hand."];
      button = `Explore ${tail}’s records`;
      link = `${SITE}${aircraftPath}/timeline`;
      illustration = ["Entry confirmed · Saved with its source page", "Search and track · Find work and review status"];
      break;
  }

  const footerReason = catchup
    ? "You’re receiving this one-time note because your MyTailLog setup is still in progress."
    : "You’re receiving this because you’re setting up MyTailLog.";
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#edf2f8;font-family:Arial,Helvetica,sans-serif;color:#172235;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;margin:0 auto;background:#fff;border-collapse:collapse;">
      <tr><td style="background:#0b2244;padding:22px 30px;color:#fff;font-size:20px;font-weight:600;"><span style="color:#69b4ff;margin-right:8px;">▲</span>MyTailLog</td></tr>
      <tr><td style="padding:34px 34px 26px;font-size:15px;line-height:1.6;">
        <div style="color:#2269aa;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">${catchup ? "Pick up where you left off" : "Your next step"}</div>
        <h1 style="margin:0 0 22px;color:#112b4d;font-size:26px;line-height:1.2;">${escapeHtml(heading)}</h1>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f3f8fd;border:1px solid #d7e4f2;margin-bottom:24px;"><tr>
          <td style="width:46%;padding:15px;color:#173253;font-size:13px;">${escapeHtml(illustration[0])}</td>
          <td style="width:8%;text-align:center;color:#407eb9;">→</td>
          <td style="width:46%;padding:15px;color:#173253;font-size:13px;">${escapeHtml(illustration[1])}</td>
        </tr></table>
        ${paragraphs.map((p) => `<p style="margin:0 0 16px;">${escapeHtml(p)}</p>`).join("")}
        <p style="margin:22px 0;"><a href="${link}" style="display:inline-block;background:#1766ad;color:#fff;text-decoration:none;border-radius:8px;padding:12px 18px;font-size:14px;font-weight:600;">${escapeHtml(button)}</a></p>
        <p style="margin:0;">If you got stuck, just reply and tell me where.<br>Ian · MyTailLog</p>
      </td></tr>
      <tr><td style="padding:22px 34px;background:#f7f9fc;border-top:1px solid #e5eaf1;color:#69798b;font-size:12px;line-height:1.5;">
        ${footerReason}<br><a href="${unsubscribeUrl}" style="color:#245d98;">Unsubscribe from setup emails</a> · <a href="${SITE}/profile" style="color:#245d98;">Email preferences</a><br>
        MyTailLog · ${ADDRESS}
      </td></tr>
    </table></body></html>`;
  const text = `${heading}\n\n${paragraphs.join("\n\n")}\n\n${button}: ${link}\n\nIf you got stuck, just reply and tell me where.\nIan · MyTailLog\n\n${footerReason}\nUnsubscribe: ${unsubscribeUrl}\nEmail preferences: ${SITE}/profile\nMyTailLog · ${ADDRESS}`;
  return {
    subject, html, text, replyTo: "mytaillog@iamit.org",
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    idempotencyKey: `onboarding-${candidate.user_id}-${candidate.stage}`,
  };
}

export async function onboardingCandidates(supabase: Service, preview = false): Promise<OnboardingEmailCandidate[]> {
  const { data, error } = await supabase.rpc("onboarding_email_candidates", { p_preview: preview });
  if (error) throw error;
  return (data ?? []).filter((c) => !excludedOnboardingEmail(c.email));
}

/** Claimed before send, so overlapping cron runs cannot mail the same stage twice. */
export async function runOnboardingEmails(supabase: Service): Promise<number> {
  const candidates = (await onboardingCandidates(supabase)).slice(0, 50);
  let sent = 0;
  for (const candidate of candidates) {
    const { data: claim, error: claimError } = await supabase.from("onboarding_email_log")
      .insert({ user_id: candidate.user_id, stage: candidate.stage, is_catchup: candidate.is_catchup })
      .select("id").single();
    if (claimError?.code === "23505") continue;
    if (claimError || !claim) {
      console.error(`[onboarding] claim failed for ${candidate.user_id}: ${claimError?.message}`);
      continue;
    }
    try {
      // Respect an opt-out or account change made after the candidate query.
      const { data: profile, error } = await supabase.from("profile")
        .select("email, is_admin, onboarding_opt_out").eq("id", candidate.user_id).single();
      if (error || !profile || profile.is_admin || profile.onboarding_opt_out
        || profile.email?.toLowerCase() !== candidate.email.toLowerCase()
        || excludedOnboardingEmail(candidate.email)) {
        await supabase.from("onboarding_email_log").delete().eq("id", claim.id);
        continue;
      }
      if (!(await sendEmail({ to: candidate.email, ...onboardingMessage(candidate) }))) {
        await supabase.from("onboarding_email_log").delete().eq("id", claim.id);
        continue;
      }
      const { error: stampError } = await supabase.from("onboarding_email_log")
        .update({ sent_at: new Date().toISOString() }).eq("id", claim.id);
      if (stampError) console.error(`[onboarding] sent but could not stamp ${claim.id}: ${stampError.message}`);
      sent += 1;
    } catch (error) {
      // Keep an uncertain claim: retrying after an unknown network result can
      // send a duplicate. An operator can inspect and clear it if needed.
      console.error(`[onboarding] uncertain send for ${candidate.user_id}: ${(error as Error).message}`);
    }
  }
  return sent;
}
