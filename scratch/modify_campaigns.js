const fs = require('fs');
const path = require('path');

const fileKampanyalar = path.join("C:\\Users\\hurce\\.gemini\\antigravity\\scratch\\hurcell-com", "stok", "app", "kampanyalar", "page.tsx");

let contentK = fs.readFileSync(fileKampanyalar, "utf-8");

const wizardMarker = "/* Full-Screen Step-by-Step Wizard Layout */";
if (contentK.includes(wizardMarker)) {
    const startIdx = contentK.indexOf("{!isFormOpen ? (");
    const wizardIdx = contentK.indexOf(wizardMarker);
    const colonIdx = contentK.lastIndexOf(") : (", wizardIdx);
    
    if (startIdx !== -1 && colonIdx !== -1 && colonIdx > startIdx) {
        let afterStart = contentK.substring(startIdx);
        // Find the match
        const regex = /\{!isFormOpen \? \(\s*<>\s*([\s\S]*?)\s*<\/>\s*\) : \(/m;
        const match = afterStart.match(regex);
        
        if (match) {
            let listContent = match[1];
            const sectionEnd = afterStart.indexOf("</section>");
            const newSection = listContent + "\n    </section>";
            contentK = contentK.substring(0, startIdx) + newSection + contentK.substring(startIdx + sectionEnd + 10);
        } else {
            console.log("Regex match failed");
        }
    }
}

// Remove Düzenle button
contentK = contentK.replace(/<button\s+onClick=\{\(\) => handleOpenEditWizard\(camp\)\}[\s\S]*?Düzenle\s*<\/button>/g, '');

fs.writeFileSync(fileKampanyalar, contentK, "utf-8");
console.log("kampanyalar/page.tsx modified successfully");
