import { UserButton } from "@clerk/nextjs";

interface HeaderProps {
  title: string;
  action?: React.ReactNode;
}

export function Header({ title, action }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b bg-white">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-4">
        {action}
        <UserButton />
      </div>
    </header>
  );
}
