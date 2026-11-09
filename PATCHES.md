# Part 1 small edits (find and replace exactly). Save a History restore point first.

## 1. src/components/OpportunityCard.jsx
a) Add two imports after the existing imports:
   import EligibilityBadge from "@/components/EligibilityBadge";
   import useEligibility from "@/hooks/useEligibility";
b) After the line   const { t } = useI18n();   add:
   const eligibility = useEligibility(item);
c) Replace
   <p className="mt-2 text-[13px] text-muted-foreground">{item.organization}</p>
   with
   <p className="mt-2 text-[13px] text-muted-foreground">{item.organization}</p>
   <div className="mt-3"><EligibilityBadge result={eligibility} /></div>

## 2. src/pages/OpportunityDetail.jsx
a) Add import:   import EligibilityPanel from "@/components/EligibilityPanel";
b) Replace
   <FavoriteButton item={view} withLabel className="mt-3 w-full justify-center" />
   with
   <FavoriteButton item={view} withLabel className="mt-3 w-full justify-center" />
   <EligibilityPanel item={view} />
