import os
import re

kampanyalar_file = os.path.join("C:\\Users\\hurce\\.gemini\\antigravity\\scratch\\hurcell-com", "stok", "app", "kampanyalar", "page.tsx")

with open(kampanyalar_file, "r", encoding="utf-8") as f:
    contentK = f.read()

# 1. We must remove the wizard part.
# The code structure is:
# return (
#   <section className="space-y-6">
#     {!isFormOpen ? (
#       <>
#         ... list ...
#       </>
#     ) : (
#       /* Full-Screen Step-by-Step Wizard Layout */
#       ... wizard ...
#     )}
#   </section>
# )
# Let's replace the whole `!isFormOpen ? ( <>` block up to `) : (` with just the content of the list, 
# and delete the `: ( ... )` wizard part.

# A simple string replacement based on unique markers:
wizard_marker = "/* Full-Screen Step-by-Step Wizard Layout */"
if wizard_marker in contentK:
    # Find start of `{!isFormOpen ? (`
    start_idx = contentK.find("{!isFormOpen ? (")
    # Find start of the wizard block
    wizard_idx = contentK.find(wizard_marker)
    # Go backwards to find `) : (`
    colon_idx = contentK.rfind(") : (", start_idx, wizard_idx)
    
    # We want the content inside `{!isFormOpen ? (\n        <>\n` and `\n        </>\n      ) : (`
    # We'll just extract that content
    after_start = contentK[start_idx:]
    match = re.search(r'\{!isFormOpen \? \(\s*<>\s*(.*?)\s*<\/>\s*\) : \(', after_start, re.DOTALL)
    
    if match:
        list_content = match.group(1)
        # Find the end of the section tag after the wizard
        section_end = after_start.find("</section>")
        # Replace everything from `{!isFormOpen ? (` to `</section>`
        new_section = list_content + "\n    </section>"
        contentK = contentK[:start_idx] + new_section + contentK[start_idx + section_end + 10:]
    else:
        print("Regex match failed")

# Remove Düzenle button
contentK = re.sub(r'<button\s*onClick=\{\(\) => handleOpenEditWizard\(camp\)\}[\s\S]*?Düzenle\s*<\/button>', '', contentK)

# Write back
with open(kampanyalar_file, "w", encoding="utf-8") as f:
    f.write(contentK)

print("kampanyalar/page.tsx modified successfully")
