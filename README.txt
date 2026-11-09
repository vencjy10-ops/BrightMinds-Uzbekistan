BrightMinds Part 1 of 3: eligibility for school students (section 29.4) + optional profile fields.
Tested: the rules only (node tests/eligibility.test.mjs, 15 checks). NOT tested in the app, on a phone, or in 76 languages.

Apply in this order (no new npm packages needed):
1. Schemas: replace base44/entities/User.jsonc and Opportunity.jsonc (only optional fields were added; no data changes).
2. New files: src/lib/eligibility.js, src/hooks/useEligibility.js, src/components/EligibilityBadge.jsx, src/components/EligibilityPanel.jsx, tests/eligibility.test.mjs
3. Replace: src/hooks/useProfileForm.js, src/components/dashboard/ProfilePanel.jsx, src/components/audit/criticalMessages.js (this one also contains everything from batch 1)
4. Apply PATCHES.md (2 small edits).
5. Publish, sign in, fill age range, grade and country in the cabinet, open a program.

Honest limits:
- Until organizers' age, grade, country and deadline are entered into the new Opportunity fields, almost every program shows "Potentially eligible". That is correct, not a bug.
- Existing translations: the new texts are English; other languages get them through the runtime translator.
- Admin form (ProgramForm) does not yet edit the new fields: Part 2.

Part 2: admin form fields, search filters (age, free, online, open), scholarship quiz, deadline calendar, saved opportunities.
Part 3: light/dark theme default, homepage hero, SEO tags, legal pages, map error state, 76-to-50 languages (after you approve the list).
Not possible for me: finding photos or official deadlines/URLs for 613 records, or testing on your live site.
