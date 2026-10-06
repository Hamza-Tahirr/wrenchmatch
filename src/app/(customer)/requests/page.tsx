import { redirect } from "next/navigation";

/** /requests has no page of its own: a customer's requests are listed on /quotes. */
export default function RequestsIndexPage() {
  redirect("/quotes");
}
