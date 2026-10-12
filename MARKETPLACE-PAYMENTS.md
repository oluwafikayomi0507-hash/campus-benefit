# Marketplace customer payments

## Payment split

- Paystack checkout supports carts with several vendors.
- Campus Benefit keeps 5% of item prices. The 5% is taken from the vendor item share; it is not added to the customer's displayed order total.
- The vendor receives the rest of item prices plus the full delivery fee.
- Paystack transaction fees are shared proportionally between Campus Benefit and the vendors.
- Orders appear in vendor inboxes only after Paystack confirms payment.

## Safe staging setup

1. Keep production `MARKETPLACE_PAYMENTS_ENABLED` unset or `false`. Production continues its existing order flow and will not charge marketplace customers.
2. In the **staging Neon database only**, open SQL Editor and run `backend/marketplace-payments.sql` from this repository.
3. Deploy this branch to the staging Render service. The staging Blueprint defaults `MARKETPLACE_PAYMENTS_ENABLED` to `false`.
4. After the migration succeeds, set `MARKETPLACE_PAYMENTS_ENABLED=true` in the staging service. Confirm its `PAYSTACK_SECRET_KEY` is the **test** key (`sk_test_...`), and its `DATABASE_URL` points to the separate staging database.
5. Sign in to the staging site as an approved vendor. In the vendor dashboard, connect the vendor's own bank account. Check the account name Paystack resolves and confirm it before saving.
6. Sign in as a student and place a small test order using Paystack test checkout. Check that the order shows as paid to the student and becomes visible to the vendor only after payment succeeds.

Do not run the migration against production or switch production to the live customer-payment flow until staging has passed and vendors have connected verified live payout accounts. Vendor payout account numbers are sent to Paystack for verification and subaccount creation; Campus Benefit stores only the Paystack subaccount code, bank name, account name, and last four digits.
