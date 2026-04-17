const fs = require('fs');
const path = 'src/pages/AnalysisResult.tsx';

let code = fs.readFileSync(path, 'utf8');

// 1. Remove SelectedLawContext type
code = code.replace(/type SelectedLawContext = \{[\s\S]*?\};\n\n/, '');

// 2. Remove functions from buildOriginalUrl to ensureDistinctPanelSections
code = code.replace(/function buildOriginalUrl[\s\S]*?function ActionCard/g, 'function ActionCard');

// 3. Remove onSelectArticle from ActionCard
code = code.replace(/,\s*onSelectArticle,\n\}: \{/g, '\n}: {');
code = code.replace(/\s*onSelectArticle: \(context: SelectedLawContext\) => void;/g, '');

// 4. Remove state variables
code = code.replace(/\s*const \[selectedLawContext, setSelectedLawContext\] = useState<SelectedLawContext \| null>\(null\);/, '');
code = code.replace(/\s*const \[isRightPanelDrawerOpen, setIsRightPanelDrawerOpen\] = useState\(false\);/, '');
code = code.replace(/\s*const \[isLawBasisOpen, setIsLawBasisOpen\] = useState\(false\);/, '');

// 5. Remove useEffect for selectedLawContext
code = code.replace(/\s*useEffect\(\(\) => \{\n\s*if \(\!selectedLawContext\?\.articleNumber && \!selectedLawContext\?\.actionId\) \{\n\s*return;\n\s*\}\n\n\s*if \(window\.matchMedia\("\(max-width: 1279px\)"\)\.matches\) \{\n\s*setIsRightPanelDrawerOpen\(true\);\n\s*\}\n\s*\}, \[selectedLawContext\]\);\n/, '');

// 6. Remove 1395-1575 (from fallbackSelectedContext to rightPanel rendering)
// Just regex from fallbackSelectedContext to the end of rightPanel
code = code.replace(/const fallbackSelectedContext = useMemo<SelectedLawContext \| null>\(\(\) => \{[\s\S]*?const rightPanel = \([\s\S]*?</div>\n    </div>\n  \);\n/g, '');

// 7. Remove rightPanel props from DashboardShell
code = code.replace(/rightPanel=\{rightPanel\}\n\s*rightPanelDrawerOpen=\{isRightPanelDrawerOpen\}\n\s*onRightPanelDrawerOpenChange=\{setIsRightPanelDrawerOpen\}/g, '');

// 8. Remove the 법령 근거 section (bottom)
code = code.replace(/<section className="rounded-radius-lg border border-border bg-surface p-space-5">\n\s*<div className="flex items-center justify-between gap-space-3 mb-space-2">[\s\S]*?<\/section>\n\n\s*<div className="flex justify-end">/g, '<div className="flex justify-end">');

fs.writeFileSync(path, code);
console.log('done');
