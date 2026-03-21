import { Suspense } from "react";
import MyMediaContent from "./MyMediaContent";

export default function MyMediaPage() {
  return (
    <Suspense>
      <MyMediaContent />
    </Suspense>
  );
}
