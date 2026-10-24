"use client";

import { useParams } from "next/navigation";
import AnalyzeReportClient from "../components/analyze-report-client";

export default function AnalyzeReportPage() {
  const params = useParams<{ id: string }>();
  return <AnalyzeReportClient id={params.id} />;
}
