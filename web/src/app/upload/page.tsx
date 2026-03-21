import { redirect } from "next/navigation";

// Upload has moved to /studio/upload
export default function UploadPage() {
  redirect("/studio/upload");
}
