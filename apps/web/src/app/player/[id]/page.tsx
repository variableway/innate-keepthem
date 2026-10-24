import { PluginPage } from "@vytdl/plugin-runtime";

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default function RouteMount() {
  return <PluginPage route="/player/[id]" pluginId="vytdl.plugin.library" />;
}
