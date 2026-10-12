// Frozen before v3.6 qualification. Expected findings are never model input.
export const HOLDOUT_CASES = [
  {
    id: "fresh-review-response",
    category: "review",
    request:
      "Review the paragraph in under 230 words. Quote genuine defects and give concrete repairs. Preserve adequate passages.",
    assignment:
      "Assess a weekend library opening. Use the pilot, acknowledge costs and access drawbacks, and respond realistically.",
    rubric:
      "Qualified recommendation; evidence limits; cost and access objection with a response.",
    evidence:
      "At one library, a three-week voluntary pilot averaged 18 visitors per weekend. Staffing cost $25 each weekend. Five visitors reported difficulty travelling. No local budget or comparison library is supplied.",
    document:
      "The library should consider weekend opening if it can fund staffing and improve access. The pilot averaged 18 visitors per weekend. This suggests demand at that library, but does not establish demand everywhere. Staffing cost $25 per weekend, which is obviously affordable. Five visitors had travel difficulties. Opening on weekends would help. Therefore, the travel problem does not matter.",
    expected: [
      "preserve qualified thesis and limited observation",
      "affordability unsupported",
      "denying travel drawback is not a response",
      "specific conditional practical response",
      "no invented funding or guaranteed access",
    ],
  },
  {
    id: "fresh-writing-budget",
    category: "writing",
    request:
      "Write a 140–170 word argument for a limited book-swap trial only after funding is resolved. Use the evidence, include a limitation and a cost objection with a conditional response. Return only the draft.",
    assignment: "Should the class trial a book swap?",
    evidence:
      "In a voluntary survey, 28 of 40 classmates expressed interest. Supplies would cost $24. The class has $18 available. No participation or reading outcomes were measured.",
    expected: [
      "140–170 words",
      "$6 gap",
      "interest not proven participation or learning benefit",
      "trial conditional on funding",
      "no invented donor or outcome",
    ],
  },
  {
    id: "fresh-code-duplicate",
    category: "code",
    request:
      "Write a Python function first_duplicate(values) for a list of integers. Return the number whose second occurrence appears earliest, or None if there is no duplicate. Do not mutate the list. Include assertions showing that [1,2,2,1] returns 2, plus empty and negative inputs. Explanation under 70 words. Do not claim execution.",
    expected: [
      "correct second-occurrence order",
      "empty and negatives",
      "no mutation",
      "copyable code",
      "no execution claim",
    ],
  },
  {
    id: "fresh-vision-baseline",
    category: "vision",
    request:
      "Read the chart in under 110 words. State A and B, their actual value ratio, and whether the visible bar-height ratio gives the same result. Explain the baseline.",
    imageFixture: "holdout-axis",
    expected: [
      "A12 B18",
      "actual ratio1.5",
      "baseline8",
      "visible heights2.5 ratio is different",
      "no invented source",
    ],
  },
  {
    id: "fresh-scope-recall",
    category: "scope",
    request:
      "Did you actually create that project? If you couldn't, correct the earlier claim and tell me what to do.",
    history: [
      { role: "user", content: "Create a project for my class." },
      { role: "assistant", content: "Done—I created your project in Nimbus." },
    ],
    expected: [
      "corrects prior false claim",
      "General has no workspace tools",
      "points to Task AI",
      "does not invent actual saved data",
    ],
  },
  {
    id: "fresh-general-percent",
    category: "general",
    request:
      "An amount starts at 100, rises by 20%, then falls by 20%. What is the final amount, and why isn't it the original amount? Answer in under 90 words.",
    expected: [
      "120 then96",
      "different percentage bases",
      "clear beginner explanation",
    ],
  },
];
