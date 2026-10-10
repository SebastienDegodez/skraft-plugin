<!-- markdownlint-disable-file -->
# Consistency matrix — discount

| AC | Event model | Contract |
|---|---|---|
| AC-1 Bronze | LoyaltyReductionApplied(Bronze, 500) | chargedCents 9500 |
| AC-2 Silver | LoyaltyReductionApplied(Silver, 1000) | chargedCents 9000 |
| AC-3 Gold | LoyaltyReductionApplied(Gold, 1500) | chargedCents 8500 |
| AC-4 Whole cent | chargedCents floored | chargedCents 7 for subtotal 7 |
