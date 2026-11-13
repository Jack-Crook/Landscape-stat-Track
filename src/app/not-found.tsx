import { LinkButton } from "@/components/kit/ui";
import { HydrationMark } from "@/components/layout/HydrationMark";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="title-2">Not found</h1>
      <p className="mt-2 text-label-2">That page doesn&apos;t exist, or it was deleted.</p>
      <LinkButton href="/" className="mt-6">
        Go home
      </LinkButton>
      <HydrationMark />
    </div>
  );
}
