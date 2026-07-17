import { notFound } from "next/navigation";
import { auth } from "@/auth";

/** Gates admin pages to the site owner; 404s for anyone else (including logged-out visitors). */
export async function requireAdmin(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !process.env.ADMIN_EMAIL || email !== process.env.ADMIN_EMAIL) {
    notFound();
  }
  return email;
}
