import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { clerkEnabled } from "@/lib/env";

export default function SignUpPage() {
  // Without Clerk (AUTH_MODE=dev) there is nothing to sign in to.
  if (!clerkEnabled()) redirect("/");
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-4 py-10">
      <div className="text-center">
        <h1 className="large-title">Landscape Tracker</h1>
        <p className="mt-1 text-label-2">Jobs, receipts, profit and GST in one place.</p>
      </div>
      <SignUp />
    </div>
  );
}
