import VideoPlayerClient from "./PlayerClient";

export async function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default function PlayerPage() {
  return <VideoPlayerClient />;
}
