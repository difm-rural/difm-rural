# Listing availability Release 1

Deploy the hosted migration before clients that select the new listing columns. The migration is additive: existing listings default to accepting bookings, legacy availability dates remain readable, and the public view retains the existing column order, masked location fields, and visibility predicates. Existing booking writes retain their payload and request ID. The insert guard permits a matching request-ID replay and leaves updates to existing bookings on the existing lifecycle path.

For application rollback, restore the previous provider and public web deployments and republish the last compatible Expo Preview group for the same runtime. Retain the new columns, view projection, and recorded availability settings. Older clients continue to work with the additive schema and receive a readable error when a paused listing rejects a new request.

If the guard itself must be withdrawn, first roll back clients or suspend booking testing. Use a separately reviewed forward migration addressing the guard, preserving listing data, location masking, and existing RLS. Do not remove columns or revert recorded bookings to roll back the interface.
