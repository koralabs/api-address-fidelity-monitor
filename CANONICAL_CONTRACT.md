# api-address-fidelity-monitor canonical contract

Watches api.handle.me and checks that the address it gives for each handle is the address the chain says holds that handle. It only reads and reports; it never fixes an address, writes to the API, signs or touches funds.

1. A mismatch between the API address and the chain address that outlives the grace window is reported with a `NOTIFY` carrying the exact old and new addresses; it is never hidden or corrected.
2. Chain truth is the owner of the handle asset as Koios reports it, matched on the exact Handles policy id and asset name; unrelated outputs or results for other assets are never used.
3. A handle with no chain owner found is a mismatch, not a match.
4. Koios block times (seconds) are converted to milliseconds exactly once, in `src/koios.ts`.
5. The grace window is 60,000 ms. A younger mismatch is queued and rechecked with fresh data; a first mismatch at or past the window and a queued item that comes due are treated the same. A catch-up clears silently; a newer transfer gets its own full window.
6. A failed API or Koios lookup logs `ERROR` and returns the item to the queue tail; a queued handle is never lost.
