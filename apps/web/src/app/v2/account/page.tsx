import { redirect } from "next/navigation";

/** `/account` opens Settings (03 §9.2). */
export default function AccountIndex() {
  redirect("/account/settings");
}
