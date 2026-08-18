import { useQuery } from "@tanstack/react-query";

export type NimbusSubject = {
  id: number;
  name: string;
  color: string;
};

const subjectKey = (value: string | null | undefined) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

async function fetchSubjects() {
  const response = await fetch("/api/subjects", { credentials: "include" });
  if (!response.ok) throw new Error("Subjects could not be loaded");
  return response.json() as Promise<NimbusSubject[]>;
}

export function useSubjects() {
  return useQuery({
    queryKey: ["/api/subjects"],
    queryFn: fetchSubjects,
    staleTime: 5 * 60_000,
  });
}

export function subjectColor(
  subject: string | null | undefined,
  subjects: NimbusSubject[],
) {
  if (!subject) return undefined;
  return subjects.find((item) => subjectKey(item.name) === subjectKey(subject))
    ?.color;
}
