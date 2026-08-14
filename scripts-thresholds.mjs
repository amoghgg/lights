// Emits Table II as IEEEtran LaTeX, straight from the detector constants.
// Paste the output into the paper so the table and the running system agree.
import { THRESHOLDS } from "./lib/thresholds.ts";

const rows = THRESHOLDS.map(
  (t) => `  ${t.cue.padEnd(8)} & ${t.name.padEnd(26)} & ${t.value} \\\\`,
).join("\n");

console.log(`\\begin{table}[t]
\\centering
\\caption{Principal detector parameters}
\\label{tab:thresholds}
\\begin{tabular}{@{}lll@{}}
\\toprule
\\textbf{Cue} & \\textbf{Parameter} & \\textbf{Value} \\\\
\\midrule
${rows}
\\bottomrule
\\end{tabular}
\\end{table}`);
