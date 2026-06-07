export const SAMPLE_PLAN = `# Welcome to OpenPlan

> You can open a local file or directory from the **Files** tab on the left to start annotating your own plan markdown files right now, and copy or export annotations.

OpenPlan is an interactive plan review tool for Claude Code. It allows teams to annotate, version, review, and manage engineering plans in a beautiful browser-based UI.

## Features & Actions

- **Interactive Annotations**: Highlight any text in the plan to add comments, ask questions, propose deletions, or suggest inline changes (with diffs).
- **Directory Mode**: Browse and review all plan markdown files in a project folder.

## CLI Installation

To run interactive review sessions locally on your terminal:

\`\`\`bash
curl -fsSL https://openplan.smithgajjar.dev/install.sh | sh
\`\`\`

## How to Review & Annotate

1. Navigate to a project containing your planning markdown files.
2. Run \`openplan annotate <file.md>\` to launch the review session.
3. The interactive browser UI will open. Select any text to create an annotation (comment, question, deletion, or suggestion).
4. When finished, choose to **Approve** the plan or **Request Changes** (this will feed the annotations back to Claude Code to revise the plan).
`;
