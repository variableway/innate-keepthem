import { PluginPage } from "@vytdl/plugin-runtime";

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default function RouteMount() {
  return <PluginPage route="/analyze/[id]" pluginId="vytdl.plugin.analyze" />;
}
