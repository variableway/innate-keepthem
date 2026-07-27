import AnalyzeReportClient from "./analyze-report-client";

export async function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default async function AnalyzeReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AnalyzeReportClient id={id} />;
}
