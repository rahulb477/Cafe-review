import { StatusScreen } from "@/components/StatusScreen";

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-canvas">
      <StatusScreen
        emoji="🏪"
        title="Business Not Found"
        message="We couldn't find this business. Please re-scan the QR code at your table or ask a staff member for help."
      />
    </div>
  );
}
