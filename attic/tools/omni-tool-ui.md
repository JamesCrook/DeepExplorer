# OmniTool UI

CSS-refactor tool, Include path tool, Scatter-Gather tool and Work Cascade tool are four tools that work with your local files. You drag a file tree onto the drop zone for files, and can then perform global actions across the files. You need to be using Google Chrome browser, not Safari.

---
## Work Cascade Tool UI

Tracks progress across a set of .md work files — BOM, prompts, specs, insights — using a hierarchical tag system.

Each .md file declares its role with a JSON block:

```json
{ "role": "TODO" }
```

Roles are TODO, PROMPT, SPEC, MANIFEST, IDIOLECT and PREFIX. An example set is in the cascade directory.

Drag the work folder onto the primary drop zone. The tag tree appears in the left panel with maturity dots — amber for todo, purple for prompt, blue for spec, cyan for code. A dark centre in a dot means at least one item is marked [x]. The fraction beside each tag shows how many todo items are checked.

Click a tag to see all items under it, grouped by maturity stage. Each item line shows the four-dot maturity graphic for its tag and the #tag right-aligned in amber.

### Bundle Export

Selecting a tag builds a bundle in the right panel — a single markdown text ready to paste to an LLM. The bundle is assembled in this order:

1. Prefix instructions (matched by tag segment overlap from PREFIX role files)
2. Links to code files (from MANIFEST entries)
3. Content from each file in pipeline order (todo → prompt → spec)
4. Relevant idiolect terms at the end

### Idiolect Tab

Switch to the Idiolect tab in the centre panel to see all defined terms. When a tag is selected, terms that appear in the tag's content light up; others dim. Check terms to drive it the other way — a ◆ diamond appears on tags whose content mentions the checked terms.

### Code Directory Scan

Drop a code folder onto the secondary drop zone (or click Code Dir). The tool scans .js and .html files for class declarations, grammar variables, and #tags in comments. It generates manifest entries you can copy into your manifest .md file. Tags must contain a / to be recognised, filtering out noise like colour names.

### Report Tab

Switch to the Report tab in the right panel for health checks:

- **Cascade Gaps** — [x] items with no corresponding prompt, spec, or code.
- **Stale Checkboxes** — [ ] items where elaboration already exists.
- **Ready to Prompt** — tags with a prompt but no code yet. Items with a spec get a [+spec] badge.
- **Tag Typos** — near-match detection across full tags and root segments.
- **Coverage by Domain** — per top-level tag, a bar showing the ratio of maturity stages.
- **Single-File Tags** — tags appearing in only one file.

### PREFIX Files

A file with role PREFIX contains tagged instruction sections. When a bundle is built, the tool collects all tag segments from the selected items and matches them against prefix tags. For example, a section tagged #node in the prefix file will be prepended to any bundle whose tags contain the segment `node`.

### spike_kit

The tool is structured as a spike. Four classes — CascadeParse, CascadeTree, CascadeReport, CascadeBundle — are delimited with spike_kit markers and can be extracted with `spike_kit.py extract`.

---
## CSS Refactor Tool UI

This UI works in Chromium browser.

Drag a file tree to the drop zone. The UI finds html files, javascript files and css files, and tracks the css usage in them.

You can sort and filter the reported classes.

### Promote Colors

Colors are converted to symbolic names, such as --color-ff8012.

You can now rename these colours in an editor (using search and replace) to give them meaningful names as to their function. The promotion to variables makes these colours dynamically configuragble via a css rule. The colors are set up in :root. You can change the variables in css for different theming by a [data] override, in particular for switching dark and light mode.

### Apply Renames

You can queue up a number of class renamings, and have the UI make the changes. This will change both declarations and usages.

---
## Include Path Tool UI

Use the fix button to automatically fix the paths of all include files that do not connect to anything.

---
## Scatter Gather Tool UI

Use a pattern such as 'Overview' to gather all Overview sections from all .md docs into one file you designate. Make edits in that file, then scatter, to send the edited text back to the source docs.

The main use of this is to create consistency across files, for example if you want the same kinds of overview information in all docs which have an overview section.