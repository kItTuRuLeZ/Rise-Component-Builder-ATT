# AT&T edition: UAT checklist and known limitations

**Site:** https://kittu-rulz.github.io/Rise-Component-Builder-ATT/
**Scope of this build:** the storyboard importer, course outline, component editing, preview, QA, export, project backup/restore, and the Post-Publish Toolkit. Full-course SCORM export and any Word add-in are **not** part of this build.

## Before you start

1. Open the site in a **fresh window or hard refresh** (Ctrl+F5). The site is cached, so an old tab can show an older build.
2. Check the version badge at the top of the page. It should read `v3.0.0` with today's build date and time. Note it in every report.
3. Use a desktop browser (Chrome, Edge, Firefox or Safari). Note which one you used.
4. Work on a **test project**, not production content. Projects are stored in your browser only.

## Checklist

Mark each line Pass / Fail. For a Fail, write what you did, what you expected, what happened, and attach a screenshot.

### 1. Storyboard import
- [ ] Dashboard > **Import Storyboard** lists all 26 components (not four).
- [ ] **Download blank template**, **Download example**, and **Download field guide** each download a file.
- [ ] Upload the downloaded **example** without editing it. The review screen reads "26 Builder components + 8 Rise references (34 outline rows)" with no blocking errors.
- [ ] **Create Project.** The outline shows all 34 rows in order. The 8 Rise rows are labelled as Rise references.
- [ ] **Rise Build Sheet** lists all 8 Rise references in order. Copy and Download both work.
- [ ] Fill in the **blank template** with your own storyboard. Upload it. Errors name the exact block and field.

### 2. Course outline
- [ ] Long component titles are readable (not cut to a few letters). Status and action buttons do not overlap the title.
- [ ] **Export This Block** and **Focus Edit** are visible buttons on each row.
- [ ] Change a block's status (Draft / In Review / Ready). The QA view shows editorial status separately from technical checks.

### 3. Editing and preview
- [ ] Open each component type you plan to use. Fields are labelled. Using only the keyboard, you can reach and fill every field.
- [ ] If you use a screen reader: each text field is announced with its label (Main Headline, Item title, and so on).
- [ ] Live preview updates as you type. Check Desktop, Tablet and Mobile preview widths.
- [ ] **Comparison Matrix:** feature tooltips appear as "?" markers. No `[info: ...]` text is visible.
- [ ] **Study Cards:** cards reveal on click, tap and Enter.

### 4. Preflight, QA and export
- [ ] Open **Preflight**. Results say "Automated checks", never "100% Compliant". The scope note is shown.
- [ ] **Export** opens quickly. Copy for Rise and the Web Package ZIP work for a block.
- [ ] Audio or video with **chapters**: attach a short audio file, set a chapter timestamp longer than the file. Preflight warns and names the chapter, its time and the valid range. Replace the file with a longer one and the warning clears.
- [ ] **QA Preflight** (course level) runs. Rise reference rows are excluded.
- [ ] The **Export Package** tab on a course downloads a hosted copy of the components. (It is not a backup: it cannot be imported back as a project.)

### 5. Save, backup and restore
- [ ] Save a project, return to the dashboard, reload the page. There is no false "Recovered autosave" banner.
- [ ] Make an edit, do **not** save, reload. The recovery banner appears and **Resume** restores the edit.
- [ ] In the editor toolbar choose **Open**, then the project's menu > **Export Package** (this makes a `.rise-project.zip`). Delete that project, then dashboard > **Import** with the ZIP. The project and its media come back.
- [ ] Import a `.json` export. If it used media, the message says the media files are not in a JSON file.
- [ ] Import a hosted component ZIP by mistake. The message says what it is and what to use instead.
- [ ] Names containing an apostrophe ("Kim's course") display correctly everywhere.

### 6. Post-Publish Toolkit
- [ ] Upload a real Rise Web export (a ZIP). It is detected, including when the files sit inside one folder.
- [ ] **Choose Tools:** ticking and unticking tools does not add duplicate sections.
- [ ] **Add Content:** the step bar at the top keeps its size and does not show a scrollbar.
- [ ] **Download ZIP** with the sample content untouched: the button is visible but disabled, and explains what to fix. The "Fix" buttons take you to the right step.
- [ ] Replace the sample items and example.com addresses with your own. The button enables and the enhanced ZIP downloads.
- [ ] Upload the enhanced ZIP again. It is recognised as already enhanced.
- [ ] The preview simulator is labelled as a demo, not your course.

## Known limitations (not defects to report)

- **Not tested by the development team, so please test and report:** embedding in a real Rise 360 course; Rise Continue-block completion; LMS behaviour; physical phones and tablets; real Safari file uploads; a full manual screen-reader pass; real Post-Publish packages other than the one used in testing.
- **Automated checks are not a certificate.** Preflight and QA are automated rules. They do not prove WCAG conformance or Rise compatibility.
- **Interactive Video multiple-choice markers** import only the correct answer from a storyboard. Add the wrong options in the Builder.
- **External audio and video links:** chapter timestamps cannot be checked against their length, and Preflight says "unverified". Upload the file to have it checked.
- **Backups:** a `.json` file holds content only. A `.rise-project.zip` (Open > the project's menu > Export Package) holds content and media. The **Export Package tab on a course** and hosted component ZIPs make published copies that cannot be re-imported as projects. The same words "Export Package" appear in both places; clearer labelling is a known follow-up.
- **Post-Publish:** the Support Email, Phone, Hours and Department fields do not yet have programmatic labels, so a screen reader may not announce them correctly. Placeholder addresses (example.com) always block the download; deliberate sample content can be acknowledged in Preview & Validate.
- **Storyboard template:** the file shipped with the importer (templates/storyboard) is a corrected copy of the original reference template. The original had two gaps (no gauge tiers, no marker title) that stopped it importing.
- **Packages enhanced by earlier builds** keep any defects those builds had until they are enhanced again.
- **Projects live in your browser.** Clearing site data deletes them. Use Export Package for a backup.

## Reporting

Send: edition, browser and version, the `v3.0.0` build badge text, the checklist line, steps to reproduce, expected result, actual result, and a screenshot. For a data or import problem, attach the file (a test file, not confidential content).
