import { Header } from "@/components/layout/Header";
import { NewClientForm } from "./new-client-form";

export default function NewClientPage() {
  return (
    <div>
      <Header title="New Client" />
      <div className="p-6 max-w-xl">
        <NewClientForm />
      </div>
    </div>
  );
}
