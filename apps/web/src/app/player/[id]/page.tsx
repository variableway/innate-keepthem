import VideoPlayerClient from "./player-client";

export async function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default function PlayerPage() {
  return <VideoPlayerClient />;
}
