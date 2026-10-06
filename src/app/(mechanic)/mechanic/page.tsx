import { redirect } from "next/navigation";

/** /mechanic has no page of its own: the job board is the mechanic home. */
export default function MechanicHomePage() {
  redirect("/mechanic/jobs");
}
